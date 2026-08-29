# @File: backend/routers/gps_tracking.py
# @Desc: API routes pour le suivi GPS en temps réel des véhicules de la flotte EDEN VTC
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.vehicle_positions import Vehicle_positions
from models.vehicles import Vehicles
from models.rides import Rides
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gps", tags=["gps_tracking"])


# === Schemas ===

class GPSUpdateRequest(BaseModel):
    """Payload envoyé par le boîtier GPS du véhicule"""
    vehicle_id: int
    latitude: float
    longitude: float
    speed: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    accuracy: Optional[float] = 10.0
    status: Optional[str] = "moving"  # moving, idle, parked, offline
    device_token: Optional[str] = None  # Token d'authentification du boîtier GPS


class GPSPositionResponse(BaseModel):
    """Position GPS d'un véhicule"""
    vehicle_id: int
    latitude: float
    longitude: float
    speed: float
    heading: float
    accuracy: float
    status: str
    ride_id: Optional[int] = None
    driver_id: Optional[int] = None
    updated_at: Optional[str] = None


class FleetPositionResponse(BaseModel):
    """Position de tous les véhicules de la flotte"""
    vehicles: list
    total: int


# === Endpoints ===

@router.post("/update-position")
async def update_vehicle_position(
    payload: GPSUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint appelé par le boîtier GPS installé dans chaque véhicule.
    Met à jour la position en temps réel du véhicule dans la base de données.
    Chaque véhicule de la flotte EDEN VTC est doté d'un GPS physique
    qui envoie sa position à cet endpoint à intervalles réguliers (5-10 secondes).
    """
    try:
        # Vérifier que le véhicule existe
        vehicle_result = await db.execute(
            select(Vehicles).where(Vehicles.id == payload.vehicle_id)
        )
        vehicle = vehicle_result.scalar_one_or_none()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Véhicule non trouvé dans la flotte")

        # Chercher si une position existe déjà pour ce véhicule
        existing_result = await db.execute(
            select(Vehicle_positions).where(
                Vehicle_positions.vehicle_id == payload.vehicle_id
            )
        )
        existing_position = existing_result.scalar_one_or_none()

        if existing_position:
            # Mettre à jour la position existante
            existing_position.latitude = payload.latitude
            existing_position.longitude = payload.longitude
            existing_position.speed = payload.speed
            existing_position.heading = payload.heading
            existing_position.accuracy = payload.accuracy
            existing_position.status = payload.status
            existing_position.updated_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(existing_position)
            return {
                "success": True,
                "message": "Position mise à jour",
                "vehicle_id": payload.vehicle_id,
                "timestamp": existing_position.updated_at.isoformat() if existing_position.updated_at else None,
            }
        else:
            # Créer une nouvelle entrée de position
            new_position = Vehicle_positions(
                vehicle_id=payload.vehicle_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                speed=payload.speed,
                heading=payload.heading,
                accuracy=payload.accuracy,
                status=payload.status,
            )
            db.add(new_position)
            await db.commit()
            await db.refresh(new_position)
            return {
                "success": True,
                "message": "Position enregistrée",
                "vehicle_id": payload.vehicle_id,
                "timestamp": new_position.created_at.isoformat() if new_position.created_at else None,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur mise à jour position GPS: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Erreur serveur lors de la mise à jour GPS")


@router.post("/assign-ride")
async def assign_ride_to_vehicle(
    vehicle_id: int,
    ride_id: int,
    driver_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Assigne une course à un véhicule pour le suivi GPS.
    Appelé quand un chauffeur accepte une course.
    """
    try:
        result = await db.execute(
            select(Vehicle_positions).where(
                Vehicle_positions.vehicle_id == vehicle_id
            )
        )
        position = result.scalar_one_or_none()

        if not position:
            raise HTTPException(status_code=404, detail="Aucune position GPS pour ce véhicule")

        position.ride_id = ride_id
        position.driver_id = driver_id
        await db.commit()

        return {"success": True, "message": "Course assignée au véhicule pour suivi GPS"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur assignation course: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Erreur serveur")


@router.get("/vehicle-position/{vehicle_id}")
async def get_vehicle_position(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Récupère la position GPS actuelle d'un véhicule.
    Utilisé par le client pour suivre son chauffeur en temps réel.
    """
    try:
        result = await db.execute(
            select(Vehicle_positions).where(
                Vehicle_positions.vehicle_id == vehicle_id
            )
        )
        position = result.scalar_one_or_none()

        if not position:
            raise HTTPException(status_code=404, detail="Position GPS non disponible pour ce véhicule")

        return {
            "vehicle_id": position.vehicle_id,
            "latitude": position.latitude,
            "longitude": position.longitude,
            "speed": position.speed or 0,
            "heading": position.heading or 0,
            "accuracy": position.accuracy or 10,
            "status": position.status or "unknown",
            "ride_id": position.ride_id,
            "driver_id": position.driver_id,
            "updated_at": position.updated_at.isoformat() if position.updated_at else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération position: {e}")
        raise HTTPException(status_code=500, detail="Erreur serveur")


@router.get("/ride-position/{ride_id}")
async def get_ride_vehicle_position(
    ride_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Récupère la position GPS du véhicule assigné à une course.
    Le client utilise cet endpoint pour suivre sa course en temps réel.
    """
    try:
        result = await db.execute(
            select(Vehicle_positions).where(
                Vehicle_positions.ride_id == ride_id
            )
        )
        position = result.scalar_one_or_none()

        if not position:
            raise HTTPException(
                status_code=404,
                detail="Aucun véhicule GPS assigné à cette course"
            )

        return {
            "vehicle_id": position.vehicle_id,
            "latitude": position.latitude,
            "longitude": position.longitude,
            "speed": position.speed or 0,
            "heading": position.heading or 0,
            "accuracy": position.accuracy or 10,
            "status": position.status or "unknown",
            "ride_id": position.ride_id,
            "driver_id": position.driver_id,
            "updated_at": position.updated_at.isoformat() if position.updated_at else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération position course: {e}")
        raise HTTPException(status_code=500, detail="Erreur serveur")


@router.get("/fleet-positions")
async def get_fleet_positions(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Récupère les positions de tous les véhicules de la flotte.
    Réservé aux administrateurs pour la vue d'ensemble de la flotte.
    """
    try:
        query = select(Vehicle_positions)
        if status:
            query = query.where(Vehicle_positions.status == status)

        result = await db.execute(query)
        positions = result.scalars().all()

        vehicles_data = []
        for pos in positions:
            vehicles_data.append({
                "vehicle_id": pos.vehicle_id,
                "latitude": pos.latitude,
                "longitude": pos.longitude,
                "speed": pos.speed or 0,
                "heading": pos.heading or 0,
                "accuracy": pos.accuracy or 10,
                "status": pos.status or "unknown",
                "ride_id": pos.ride_id,
                "driver_id": pos.driver_id,
                "updated_at": pos.updated_at.isoformat() if pos.updated_at else None,
            })

        return {
            "vehicles": vehicles_data,
            "total": len(vehicles_data),
        }

    except Exception as e:
        logger.error(f"Erreur récupération flotte: {e}")
        raise HTTPException(status_code=500, detail="Erreur serveur")


@router.post("/end-ride/{ride_id}")
async def end_ride_tracking(
    ride_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Termine le suivi GPS d'une course ET déclenche le reversement caisse.
    Délègue au service ride_completion (source unique de vérité, idempotent).
    """
    from services.ride_completion import complete_ride_and_transfer

    try:
        result = await complete_ride_and_transfer(
            db=db,
            ride_id=ride_id,
            release_gps=True,
        )

        if result.get("error") == "not_found":
            # Pas de course trouvée, on libère quand même le GPS si possible
            await db.commit()
            raise HTTPException(status_code=404, detail="Course introuvable.")

        if result.get("error") == "invalid_status":
            await db.commit()
            raise HTTPException(status_code=400, detail=result["message"])

        await db.commit()
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur fin suivi: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Erreur serveur")