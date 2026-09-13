"""Bouton SOS et contact de confiance.

Complète la trilogie sécurité déjà en place : EDEN Trust Score (avant la
course), veille anti-déviation d'itinéraire (pendant), et ici le bouton
SOS (en cas d'urgence) — un différenciateur que DiDi et Yango n'exposent
pas de façon aussi transparente sur ce marché.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_admin_user, get_current_user
from models.drivers import Drivers
from models.passengers import Passengers
from models.rides import Rides
from models.sos_alerts import Sos_alerts
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/safety", tags=["safety"])


# === Schemas ===

class EmergencyContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=6, max_length=30)


class EmergencyContactResponse(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class SosRequest(BaseModel):
    ride_id: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# === Contact de confiance ===

@router.get("/emergency-contact", response_model=EmergencyContactResponse)
async def get_emergency_contact(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    result = await db.execute(select(Passengers).where(Passengers.user_id == current_user.id))
    passenger = result.scalar_one_or_none()
    if not passenger:
        return EmergencyContactResponse()
    return EmergencyContactResponse(
        name=passenger.emergency_contact_name,
        phone=passenger.emergency_contact_phone,
    )


@router.put("/emergency-contact", response_model=EmergencyContactResponse)
async def set_emergency_contact(
    data: EmergencyContactRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    result = await db.execute(select(Passengers).where(Passengers.user_id == current_user.id))
    passenger = result.scalar_one_or_none()
    if not passenger:
        raise HTTPException(status_code=404, detail="Profil passager introuvable.")

    passenger.emergency_contact_name = data.name.strip()
    passenger.emergency_contact_phone = data.phone.strip()
    await db.commit()

    return EmergencyContactResponse(name=passenger.emergency_contact_name, phone=passenger.emergency_contact_phone)


# === SOS ===

@router.post("/sos")
async def trigger_sos(
    data: SosRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Déclenche une alerte SOS pendant une course.

    Utilisable par le passager de la course ou par le chauffeur qui lui est
    assigné. Journalise l'alerte (position, qui l'a déclenchée) et retourne
    le contact de confiance du passager (s'il en a un) pour que le client
    puisse immédiatement lui partager la position — EDEN VTC ne peut pas
    envoyer de SMS à la place de l'utilisateur, seulement l'y aider."""
    ride_result = await db.execute(select(Rides).where(Rides.id == data.ride_id))
    ride = ride_result.scalar_one_or_none()
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable.")

    passenger_result = await db.execute(select(Passengers).where(Passengers.user_id == current_user.id))
    passenger = passenger_result.scalar_one_or_none()

    driver_result = await db.execute(select(Drivers).where(Drivers.user_id == current_user.id))
    driver = driver_result.scalar_one_or_none()

    triggered_by = None
    if passenger and ride.passenger_id == passenger.id:
        triggered_by = "passenger"
    elif driver and ride.driver_id == driver.id:
        triggered_by = "driver"

    if not triggered_by:
        raise HTTPException(status_code=403, detail="Cette course ne vous est pas associée.")

    alert = Sos_alerts(
        ride_id=ride.id,
        passenger_id=ride.passenger_id,
        driver_id=ride.driver_id,
        triggered_by=triggered_by,
        latitude=data.latitude,
        longitude=data.longitude,
        status="active",
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    logger.warning(
        f"[SOS] Alerte déclenchée par {triggered_by} sur la course {ride.id} "
        f"(alerte #{alert.id}, position: {data.latitude}, {data.longitude})"
    )

    emergency_contact = None
    if passenger and passenger.emergency_contact_phone:
        emergency_contact = {
            "name": passenger.emergency_contact_name,
            "phone": passenger.emergency_contact_phone,
        }

    return {
        "success": True,
        "alert_id": alert.id,
        "message": "Alerte enregistrée. Partagez votre position à votre contact de confiance sans attendre.",
        "emergency_contact": emergency_contact,
    }


@router.get("/sos/active")
async def list_active_sos_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Liste des alertes SOS en cours, pour la supervision admin."""
    result = await db.execute(
        select(Sos_alerts).where(Sos_alerts.status == "active").order_by(Sos_alerts.created_at.desc())
    )
    alerts = result.scalars().all()
    return {
        "alerts": [
            {
                "id": a.id,
                "ride_id": a.ride_id,
                "passenger_id": a.passenger_id,
                "driver_id": a.driver_id,
                "triggered_by": a.triggered_by,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "created_at": str(a.created_at) if a.created_at else None,
            }
            for a in alerts
        ],
        "total": len(alerts),
    }


@router.post("/sos/{alert_id}/resolve")
async def resolve_sos_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Marque une alerte SOS comme résolue (suivi effectué par l'équipe)."""
    result = await db.execute(
        update(Sos_alerts)
        .where(Sos_alerts.id == alert_id, Sos_alerts.status == "active")
        .values(status="resolved", resolved_by=current_user.id, resolved_at=datetime.now())
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alerte introuvable ou déjà résolue.")
    await db.commit()
    return {"success": True, "alert_id": alert_id}
