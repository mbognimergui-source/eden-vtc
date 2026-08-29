"""Règle d'alerte flotte EDEN VTC (« règle des -15 % »).

Si la recette moyenne par véhicule, calculée en glissant sur une fenêtre de
`window_days` jours (90 par défaut), descend sous `alert_threshold`
(25 500 FCFA/jour par défaut, soit -15 % de l'objectif de 30 000 FCFA/jour),
une bannière d'alerte doit être visible côté administration.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.fleet_kpi_settings import Fleet_kpi_settings
from models.rides import Rides
from models.vehicles import Vehicles

logger = logging.getLogger(__name__)

DEFAULT_DAILY_TARGET = 30000
DEFAULT_ALERT_RATIO = 0.85  # -15 %


async def get_settings(db: AsyncSession) -> Fleet_kpi_settings:
    """Charge les paramètres actifs, ou crée la ligne par défaut si absente."""
    stmt = (
        select(Fleet_kpi_settings)
        .where(Fleet_kpi_settings.is_active.is_(True))
        .order_by(Fleet_kpi_settings.id.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    settings_row = result.scalar_one_or_none()
    if settings_row:
        return settings_row

    settings_row = Fleet_kpi_settings(
        daily_target=DEFAULT_DAILY_TARGET,
        alert_threshold=round(DEFAULT_DAILY_TARGET * DEFAULT_ALERT_RATIO),
        window_days=90,
        is_active=True,
    )
    db.add(settings_row)
    await db.commit()
    await db.refresh(settings_row)
    return settings_row


async def update_settings(
    db: AsyncSession,
    daily_target: Optional[int] = None,
    alert_threshold: Optional[int] = None,
    window_days: Optional[int] = None,
) -> Fleet_kpi_settings:
    settings_row = await get_settings(db)
    if daily_target is not None:
        settings_row.daily_target = daily_target
    if alert_threshold is not None:
        settings_row.alert_threshold = alert_threshold
    if window_days is not None:
        settings_row.window_days = window_days
    await db.commit()
    await db.refresh(settings_row)
    return settings_row


async def _vehicle_avg_daily_revenue(db: AsyncSession, vehicle_id: int, since: datetime, window_days: int) -> int:
    stmt = select(func.coalesce(func.sum(Rides.final_price), 0)).where(
        Rides.vehicle_id == vehicle_id,
        Rides.status == "completed",
        Rides.created_at >= since,
    )
    result = await db.execute(stmt)
    total_revenue = int(result.scalar() or 0)
    return round(total_revenue / window_days) if window_days > 0 else 0


async def get_fleet_alert_status(db: AsyncSession) -> dict:
    settings_row = await get_settings(db)
    window_days = settings_row.window_days or 90
    threshold = settings_row.alert_threshold or round(DEFAULT_DAILY_TARGET * DEFAULT_ALERT_RATIO)
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    vehicles_result = await db.execute(select(Vehicles))
    vehicles = vehicles_result.scalars().all()

    vehicle_stats = []
    for vehicle in vehicles:
        avg_daily = await _vehicle_avg_daily_revenue(db, vehicle.id, since, window_days)
        vehicle_stats.append(
            {
                "vehicle_id": vehicle.id,
                "fleet_id": vehicle.fleet_id,
                "license_plate": vehicle.license_plate,
                "avg_daily_revenue": avg_daily,
                "below_threshold": avg_daily < threshold,
            }
        )

    below_threshold_vehicles = [v for v in vehicle_stats if v["below_threshold"]]
    fleet_avg = (
        round(sum(v["avg_daily_revenue"] for v in vehicle_stats) / len(vehicle_stats))
        if vehicle_stats
        else 0
    )

    return {
        "alert_active": fleet_avg < threshold and len(vehicle_stats) > 0,
        "fleet_avg_daily_revenue": fleet_avg,
        "daily_target": settings_row.daily_target,
        "alert_threshold": threshold,
        "window_days": window_days,
        "vehicle_count": len(vehicle_stats),
        "below_threshold_count": len(below_threshold_vehicles),
        "below_threshold_vehicles": below_threshold_vehicles,
        "vehicles": vehicle_stats,
    }
