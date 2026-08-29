"""API de paie des chauffeurs salariés — réservée aux administrateurs."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.driver_payroll import Driver_payroll
from routers.access_management import verify_admin
from schemas.auth import UserResponse
from services import payroll as payroll_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payroll", tags=["payroll"])


class GeneratePayrollRequest(BaseModel):
    period_year: int
    period_month: int
    driver_id: Optional[int] = None  # si absent : génère pour tous les chauffeurs salariés
    daily_target: Optional[int] = None


class DeductionsRequest(BaseModel):
    deductions: int
    reason: Optional[str] = None


class MarkPaidRequest(BaseModel):
    payment_reference: Optional[str] = None


class PayrollRecordResponse(BaseModel):
    id: int
    driver_id: int
    period_year: int
    period_month: int
    base_salary: int
    worked_days: Optional[int] = None
    daily_target: Optional[int] = None
    days_target_met: Optional[int] = None
    total_ride_revenue: Optional[int] = None
    performance_bonus: Optional[int] = None
    deductions: Optional[int] = None
    deduction_reason: Optional[str] = None
    net_pay: int
    status: Optional[str] = None
    payment_reference: Optional[str] = None
    validated_at: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


def _serialize(record: Driver_payroll) -> dict:
    return {
        "id": record.id,
        "driver_id": record.driver_id,
        "period_year": record.period_year,
        "period_month": record.period_month,
        "base_salary": record.base_salary,
        "worked_days": record.worked_days,
        "daily_target": record.daily_target,
        "days_target_met": record.days_target_met,
        "total_ride_revenue": record.total_ride_revenue,
        "performance_bonus": record.performance_bonus,
        "deductions": record.deductions,
        "deduction_reason": record.deduction_reason,
        "net_pay": record.net_pay,
        "status": record.status,
        "payment_reference": record.payment_reference,
        "validated_at": record.validated_at.isoformat() if record.validated_at else None,
        "paid_at": record.paid_at.isoformat() if record.paid_at else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@router.post("/generate")
async def generate_payroll(
    payload: GeneratePayrollRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Génère les bulletins de paie du mois (un chauffeur ou toute la flotte salariée)."""
    await verify_admin(current_user, db)

    kwargs = {}
    if payload.daily_target:
        kwargs["daily_target"] = payload.daily_target

    if payload.driver_id:
        try:
            record = await payroll_service.generate_payroll(
                db, payload.driver_id, payload.period_year, payload.period_month, **kwargs
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        return {"records": [_serialize(record)]}

    records = await payroll_service.generate_payroll_for_all(
        db, payload.period_year, payload.period_month, **kwargs
    )
    return {"records": [_serialize(r) for r in records]}


@router.get("/records")
async def list_payroll_records(
    period_year: Optional[int] = Query(None),
    period_month: Optional[int] = Query(None),
    driver_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)

    stmt = select(Driver_payroll)
    if period_year is not None:
        stmt = stmt.where(Driver_payroll.period_year == period_year)
    if period_month is not None:
        stmt = stmt.where(Driver_payroll.period_month == period_month)
    if driver_id is not None:
        stmt = stmt.where(Driver_payroll.driver_id == driver_id)
    if status is not None:
        stmt = stmt.where(Driver_payroll.status == status)
    stmt = stmt.order_by(Driver_payroll.period_year.desc(), Driver_payroll.period_month.desc(), Driver_payroll.driver_id)

    result = await db.execute(stmt)
    records = result.scalars().all()
    return {"records": [_serialize(r) for r in records]}


@router.get("/summary")
async def get_payroll_summary(
    period_year: int = Query(...),
    period_month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    return await payroll_service.payroll_summary(db, period_year, period_month)


@router.patch("/{payroll_id}/deductions")
async def update_deductions(
    payroll_id: int,
    payload: DeductionsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    record = await payroll_service.set_deductions(db, payroll_id, payload.deductions, payload.reason)
    if not record:
        raise HTTPException(status_code=404, detail="Bulletin introuvable ou déjà payé")
    return _serialize(record)


@router.post("/{payroll_id}/validate")
async def validate_payroll(
    payroll_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    record = await payroll_service.validate_payroll(db, payroll_id)
    if not record:
        raise HTTPException(status_code=404, detail="Bulletin introuvable ou déjà validé")
    return _serialize(record)


@router.post("/{payroll_id}/mark-paid")
async def mark_payroll_paid(
    payroll_id: int,
    payload: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    record = await payroll_service.mark_paid(db, payroll_id, payload.payment_reference)
    if not record:
        raise HTTPException(status_code=404, detail="Bulletin introuvable ou déjà payé")
    return _serialize(record)
