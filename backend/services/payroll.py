"""Paie des chauffeurs salariés EDEN VTC.

Les chauffeurs sont des employés, pas des indépendants à la commission : le
salaire de base est dû qu'il y ait ou non des courses. Une prime de
performance journalière récompense les jours où la recette générée pour
l'entreprise atteint l'objectif (30 000 FCFA/jour par défaut), en plus du
salaire fixe — jamais à la place de celui-ci.
"""

import logging
from datetime import date, datetime, timezone
from calendar import monthrange
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.driver_payroll import Driver_payroll
from models.drivers import Drivers
from models.rides import Rides

logger = logging.getLogger(__name__)

DEFAULT_DAILY_TARGET = 30000
DEFAULT_BONUS_PER_TARGET_DAY = 1000


async def _period_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = monthrange(year, month)[1]
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    return start, end


async def compute_period_stats(
    db: AsyncSession, driver_id: int, year: int, month: int, daily_target: int = DEFAULT_DAILY_TARGET
) -> dict:
    """Agrège les courses terminées du chauffeur sur la période (revenu par jour)."""
    start, end = await _period_bounds(year, month)

    day_expr = func.date(Rides.created_at)
    stmt = (
        select(day_expr.label("day"), func.coalesce(func.sum(Rides.final_price), 0).label("daily_revenue"))
        .where(
            Rides.driver_id == driver_id,
            Rides.status == "completed",
            Rides.created_at >= start,
            Rides.created_at <= end,
        )
        .group_by(day_expr)
    )
    result = await db.execute(stmt)
    rows = result.all()

    worked_days = len(rows)
    days_target_met = sum(1 for _day, revenue in rows if (revenue or 0) >= daily_target)
    total_ride_revenue = sum(int(revenue or 0) for _day, revenue in rows)

    return {
        "worked_days": worked_days,
        "days_target_met": days_target_met,
        "total_ride_revenue": total_ride_revenue,
    }


async def get_payroll_record(db: AsyncSession, driver_id: int, year: int, month: int) -> Optional[Driver_payroll]:
    stmt = select(Driver_payroll).where(
        Driver_payroll.driver_id == driver_id,
        Driver_payroll.period_year == year,
        Driver_payroll.period_month == month,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def generate_payroll(
    db: AsyncSession,
    driver_id: int,
    year: int,
    month: int,
    daily_target: int = DEFAULT_DAILY_TARGET,
    bonus_per_target_day: int = DEFAULT_BONUS_PER_TARGET_DAY,
) -> Driver_payroll:
    """Génère (ou régénère, si encore à l'état `draft`) le bulletin d'un chauffeur.

    Idempotent : rappeler cette fonction sur un bulletin `draft` recalcule les
    montants avec les données à jour. Un bulletin `validated` ou `paid` n'est
    jamais modifié automatiquement — il faut d'abord le repasser en brouillon
    côté admin si une correction est nécessaire.
    """
    driver = await db.get(Drivers, driver_id)
    if not driver:
        raise ValueError(f"Chauffeur {driver_id} introuvable")

    stats = await compute_period_stats(db, driver_id, year, month, daily_target)
    base_salary = int(driver.monthly_base_salary or 0)
    performance_bonus = stats["days_target_met"] * bonus_per_target_day

    record = await get_payroll_record(db, driver_id, year, month)
    if record and record.status != "draft":
        logger.info(
            "Bulletin déjà %s pour driver=%s %s-%s, aucune régénération automatique",
            record.status, driver_id, year, month,
        )
        return record

    deductions = record.deductions if record else 0
    net_pay = base_salary + performance_bonus - int(deductions or 0)

    if record:
        record.base_salary = base_salary
        record.worked_days = stats["worked_days"]
        record.daily_target = daily_target
        record.days_target_met = stats["days_target_met"]
        record.total_ride_revenue = stats["total_ride_revenue"]
        record.performance_bonus = performance_bonus
        record.net_pay = max(net_pay, 0)
    else:
        record = Driver_payroll(
            driver_id=driver_id,
            period_year=year,
            period_month=month,
            base_salary=base_salary,
            worked_days=stats["worked_days"],
            daily_target=daily_target,
            days_target_met=stats["days_target_met"],
            total_ride_revenue=stats["total_ride_revenue"],
            performance_bonus=performance_bonus,
            deductions=0,
            net_pay=max(net_pay, 0),
            status="draft",
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)
    return record


async def generate_payroll_for_all(
    db: AsyncSession, year: int, month: int, daily_target: int = DEFAULT_DAILY_TARGET
) -> list[Driver_payroll]:
    """Génère les bulletins de tous les chauffeurs salariés actifs pour la période."""
    stmt = select(Drivers).where(Drivers.employment_type == "salaried")
    result = await db.execute(stmt)
    drivers = result.scalars().all()

    records = []
    for driver in drivers:
        record = await generate_payroll(db, driver.id, year, month, daily_target)
        records.append(record)
    return records


async def set_deductions(
    db: AsyncSession, payroll_id: int, deductions: int, reason: Optional[str] = None
) -> Optional[Driver_payroll]:
    record = await db.get(Driver_payroll, payroll_id)
    if not record or record.status == "paid":
        return None
    record.deductions = max(int(deductions or 0), 0)
    record.deduction_reason = reason
    record.net_pay = max(record.base_salary + record.performance_bonus - record.deductions, 0)
    await db.commit()
    await db.refresh(record)
    return record


async def validate_payroll(db: AsyncSession, payroll_id: int) -> Optional[Driver_payroll]:
    record = await db.get(Driver_payroll, payroll_id)
    if not record or record.status != "draft":
        return None
    record.status = "validated"
    record.validated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record


async def mark_paid(db: AsyncSession, payroll_id: int, payment_reference: Optional[str] = None) -> Optional[Driver_payroll]:
    record = await db.get(Driver_payroll, payroll_id)
    if not record or record.status not in ("validated", "draft"):
        return None
    record.status = "paid"
    record.paid_at = datetime.now(timezone.utc)
    record.payment_reference = payment_reference
    await db.commit()
    await db.refresh(record)
    return record


async def payroll_summary(db: AsyncSession, year: int, month: int) -> dict:
    stmt = select(Driver_payroll).where(
        Driver_payroll.period_year == year, Driver_payroll.period_month == month
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    total_base = sum(r.base_salary for r in records)
    total_bonus = sum(r.performance_bonus for r in records)
    total_deductions = sum(r.deductions for r in records)
    total_net = sum(r.net_pay for r in records)

    return {
        "period_year": year,
        "period_month": month,
        "driver_count": len(records),
        "total_base_salary": total_base,
        "total_performance_bonus": total_bonus,
        "total_deductions": total_deductions,
        "total_net_pay": total_net,
        "paid_count": sum(1 for r in records if r.status == "paid"),
        "validated_count": sum(1 for r in records if r.status == "validated"),
        "draft_count": sum(1 for r in records if r.status == "draft"),
    }
