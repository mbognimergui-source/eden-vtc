"""API de la règle d'alerte flotte (« règle des -15 % ») — réservée aux administrateurs."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from routers.access_management import verify_admin
from schemas.auth import UserResponse
from services import fleet_kpi as fleet_kpi_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/fleet-kpi", tags=["fleet-kpi"])


class FleetKpiSettingsUpdate(BaseModel):
    daily_target: Optional[int] = None
    alert_threshold: Optional[int] = None
    window_days: Optional[int] = None


@router.get("/alert-status")
async def alert_status(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Statut de l'alerte -15% : recette moyenne/véhicule glissante vs seuil."""
    await verify_admin(current_user, db)
    return await fleet_kpi_service.get_fleet_alert_status(db)


@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    settings_row = await fleet_kpi_service.get_settings(db)
    return {
        "daily_target": settings_row.daily_target,
        "alert_threshold": settings_row.alert_threshold,
        "window_days": settings_row.window_days,
    }


@router.put("/settings")
async def update_settings(
    payload: FleetKpiSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    await verify_admin(current_user, db)
    settings_row = await fleet_kpi_service.update_settings(
        db,
        daily_target=payload.daily_target,
        alert_threshold=payload.alert_threshold,
        window_days=payload.window_days,
    )
    return {
        "daily_target": settings_row.daily_target,
        "alert_threshold": settings_row.alert_threshold,
        "window_days": settings_row.window_days,
    }
