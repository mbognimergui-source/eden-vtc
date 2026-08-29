# @File: backend/routers/ride_dispatch.py
# @Desc: Système de dispatch de courses - visibilité chauffeurs libres < 10 min, acceptation exclusive
import logging
import math
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.rides import Rides
from models.drivers import Drivers
from models.vehicle_positions import Vehicle_positions
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dispatch", tags=["ride_dispatch"])

# Average speed in km/h for ETA calculation (urban African context)
AVERAGE_SPEED_KMH = 25.0
MAX_ETA_MINUTES = 10.0


# === Schemas ===

class CreateRideRequest(BaseModel):
    """Passager crée une commande"""
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    destination_address: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    distance_km: Optional[float] = None
    duration_min: Optional[int] = None
    estimated_price: Optional[int] = None
    payment_method: str = "wallet"
    is_scheduled: bool = False
    scheduled_at: Optional[str] = None
    co2_saved: Optional[float] = None


class AcceptRideRequest(BaseModel):
    """Chauffeur accepte une commande"""
    ride_id: int


class DriverPositionUpdate(BaseModel):
    """Mise à jour position chauffeur"""
    latitude: float
    longitude: float


# === Utility functions ===

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in km using Haversine formula."""
    R = 6371.0  # Earth radius in km
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def estimate_eta_minutes(distance_km: float) -> float:
    """Estimate ETA in minutes based on distance and average urban speed."""
    if distance_km <= 0:
        return 0.0
    return (distance_km / AVERAGE_SPEED_KMH) * 60.0


# === Endpoints ===

# Plafond de dette autorisé par course (FCFA)
MAX_DEBT_PER_RIDE = 5000
# Nombre minimum de courses pour bénéficier du crédit (fidélisation)
MIN_RIDES_FOR_CREDIT = 50

# === Zone de service ===
# EDEN VTC n'exploite actuellement que l'agglomération de Douala. Toute course
# dont le départ ou l'arrivée sort de ce périmètre est refusée explicitement,
# afin qu'aucun test tiers ne puisse commander une course non desservie.
DOUALA_CENTER_LAT = 4.0511
DOUALA_CENTER_LNG = 9.7679
SERVICE_RADIUS_KM = 35.0
SERVICE_AREA_LABEL = "Douala"


def _distance_from_douala_km(lat: Optional[float], lng: Optional[float]) -> Optional[float]:
    """Distance en km entre un point et le centre de Douala, ou None si inconnu."""
    if lat is None or lng is None:
        return None
    return haversine_distance(DOUALA_CENTER_LAT, DOUALA_CENTER_LNG, lat, lng)


def _assert_within_service_area(
    pickup_lat: Optional[float],
    pickup_lng: Optional[float],
    destination_lat: Optional[float],
    destination_lng: Optional[float],
) -> None:
    """Lève une 403 si le départ ou l'arrivée sort de la zone desservie."""
    checks = (
        ("de départ", _distance_from_douala_km(pickup_lat, pickup_lng)),
        ("d'arrivée", _distance_from_douala_km(destination_lat, destination_lng)),
    )
    for label, distance in checks:
        if distance is not None and distance > SERVICE_RADIUS_KM:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Le point {label} est situé à environ {distance:.0f} km de "
                    f"{SERVICE_AREA_LABEL}. EDEN VTC ne dessert actuellement que "
                    f"l'agglomération de {SERVICE_AREA_LABEL} "
                    f"(rayon {int(SERVICE_RADIUS_KM)} km)."
                ),
            )


@router.post("/create-ride")
async def create_ride(
    data: CreateRideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Passager crée une nouvelle commande.
    La course est en statut 'pending' et visible par les chauffeurs éligibles.
    Contrainte : si le passager a déjà une dette en cours, il ne peut pas commander.
    """
    try:
        from models.passengers import Passengers

        # Zone de service : refuser immédiatement toute course hors Douala
        _assert_within_service_area(
            data.pickup_lat, data.pickup_lng, data.destination_lat, data.destination_lng
        )

        # Trouver ou créer le passager lié à l'utilisateur connecté
        passenger_result = await db.execute(
            select(Passengers).where(Passengers.user_id == current_user.id)
        )
        passenger = passenger_result.scalar_one_or_none()

        # Si le passager n'existe pas encore, le créer automatiquement
        if not passenger:
            passenger = Passengers(
                user_id=current_user.id,
                first_name=getattr(current_user, "name", "") or "Passager",
                phone=getattr(current_user, "phone", "") or "",
                wallet_balance=0,
                has_pending_debt=False,
                debt_amount=0,
                total_rides=0,
                co2_saved=0,
            )
            db.add(passenger)
            await db.flush()

        # Vérifier si le passager a une dette en cours (une seule course à crédit autorisée)
        if passenger.has_pending_debt and (passenger.debt_amount or 0) > 0:
            raise HTTPException(
                status_code=403,
                detail=f"Vous avez une dette de {passenger.debt_amount} FCFA en cours. "
                       f"Veuillez régulariser avant de commander une nouvelle course."
            )

        # === Prix serveur ===
        # Le prix envoyé par le client (data.estimated_price) n'est JAMAIS utilisé
        # pour l'éligibilité ni pour la facturation : il est recalculé ici depuis
        # la distance, la durée et les paramètres tarifaires en base.
        from services.pricing import quote_ride_price

        quote = await quote_ride_price(
            db=db,
            pickup_address=data.pickup_address,
            pickup_lat=data.pickup_lat,
            pickup_lng=data.pickup_lng,
            destination_address=data.destination_address,
            destination_lat=data.destination_lat,
            destination_lng=data.destination_lng,
            client_distance_km=data.distance_km,
            client_duration_min=data.duration_min,
        )
        server_price = quote["amount"]
        if data.estimated_price and abs(int(data.estimated_price) - server_price) > 0:
            logger.info(
                "Prix client ignoré pour la course du passager %s : client=%s, serveur=%s",
                passenger.id,
                data.estimated_price,
                server_price,
            )

        # Vérifier l'éligibilité au crédit (fidélisation : 50 courses minimum)
        # Si le solde est insuffisant pour couvrir la course, le passager doit avoir ≥ 50 courses
        wallet_balance = passenger.wallet_balance or 0
        estimated_price = server_price

        if wallet_balance < estimated_price:
            total_rides = passenger.total_rides or 0
            if total_rides < MIN_RIDES_FOR_CREDIT:
                raise HTTPException(
                    status_code=403,
                    detail=f"Solde insuffisant ({wallet_balance:,} FCFA). "
                           f"Le crédit de course n'est accessible qu'aux clients fidèles "
                           f"ayant effectué au moins {MIN_RIDES_FOR_CREDIT} courses. "
                           f"Vous avez actuellement {total_rides} course(s). "
                           f"Veuillez recharger votre portefeuille."
                )
            # Client fidèle (≥ 50 courses) : autoriser la course à crédit
            # Vérifier que le montant ne dépasse pas le plafond de dette
            debt_needed = estimated_price - wallet_balance
            if debt_needed > MAX_DEBT_PER_RIDE:
                raise HTTPException(
                    status_code=403,
                    detail=f"Le montant à crédit ({debt_needed:,} FCFA) dépasse le plafond autorisé "
                           f"de {MAX_DEBT_PER_RIDE:,} FCFA par course. "
                           f"Veuillez recharger votre portefeuille."
                )
            logger.info(
                f"Credit ride authorized for loyal passenger {passenger.id} "
                f"(total_rides={total_rides}, debt_needed={debt_needed} FCFA)"
            )

        new_ride = Rides(
            passenger_id=passenger.id,
            driver_id=None,  # No driver yet
            vehicle_id=None,
            status="pending",
            pickup_address=data.pickup_address,
            pickup_lat=data.pickup_lat,
            pickup_lng=data.pickup_lng,
            destination_address=data.destination_address,
            destination_lat=data.destination_lat,
            destination_lng=data.destination_lng,
            distance_km=quote["breakdown"]["distance_km"],
            duration_min=quote["breakdown"]["duration_min"],
            estimated_price=server_price,
            payment_method=data.payment_method,
            payment_status="pending",
            is_scheduled=data.is_scheduled,
            scheduled_at=data.scheduled_at,
            co2_saved=data.co2_saved,
        )
        db.add(new_ride)
        await db.commit()
        await db.refresh(new_ride)

        logger.info(f"Ride {new_ride.id} created by user {current_user.id}")

        return {
            "success": True,
            "ride_id": new_ride.id,
            "status": "pending",
            "price": server_price,
            "currency": quote["currency"],
            "price_breakdown": quote["breakdown"],
            "message": "Commande créée. En attente d'un chauffeur disponible.",
        }
    except HTTPException:
        # Les refus métier (dette, solde, zone) doivent remonter tels quels
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating ride: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la course: {str(e)}")


@router.get("/available-rides")
async def get_available_rides(
    driver_lat: float,
    driver_lng: float,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retourne les courses en attente (pending) qui sont à moins de 10 minutes
    du chauffeur. Seuls les chauffeurs 'online' (libres) voient les courses.
    """
    try:
        # Verify the current user is a driver and is online (free)
        driver_result = await db.execute(
            select(Drivers).where(
                and_(
                    Drivers.user_id == current_user.id,
                    Drivers.status == "online"
                )
            )
        )
        driver = driver_result.scalar_one_or_none()

        if not driver:
            return {"rides": [], "message": "Vous n'êtes pas un chauffeur actif ou vous n'êtes pas en ligne."}

        # Get all pending rides (not yet accepted)
        rides_result = await db.execute(
            select(Rides).where(
                and_(
                    Rides.status == "pending",
                    Rides.driver_id.is_(None),
                    Rides.pickup_lat.isnot(None),
                    Rides.pickup_lng.isnot(None),
                )
            )
        )
        pending_rides = rides_result.scalars().all()

        # Filter rides within 10 minutes ETA
        available_rides = []
        for ride in pending_rides:
            distance = haversine_distance(
                driver_lat, driver_lng,
                ride.pickup_lat, ride.pickup_lng
            )
            eta = estimate_eta_minutes(distance)

            if eta <= MAX_ETA_MINUTES:
                available_rides.append({
                    "id": ride.id,
                    "pickup_address": ride.pickup_address,
                    "pickup_lat": ride.pickup_lat,
                    "pickup_lng": ride.pickup_lng,
                    "destination_address": ride.destination_address,
                    "destination_lat": ride.destination_lat,
                    "destination_lng": ride.destination_lng,
                    "distance_km": ride.distance_km,
                    "duration_min": ride.duration_min,
                    "estimated_price": ride.estimated_price,
                    "payment_method": ride.payment_method,
                    "is_scheduled": ride.is_scheduled,
                    "scheduled_at": str(ride.scheduled_at) if ride.scheduled_at else None,
                    "co2_saved": ride.co2_saved,
                    "eta_minutes": round(eta, 1),
                    "distance_to_pickup_km": round(distance, 2),
                    "created_at": str(ride.created_at) if ride.created_at else None,
                })

        # Sort by ETA (closest first)
        available_rides.sort(key=lambda r: r["eta_minutes"])

        return {
            "rides": available_rides,
            "total": len(available_rides),
            "driver_id": driver.id,
            "driver_status": driver.status,
        }
    except Exception as e:
        logger.error(f"Error fetching available rides: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/accept-ride")
async def accept_ride(
    data: AcceptRideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Chauffeur accepte une course.
    La course est assignée au chauffeur et disparaît pour les autres.
    Vérifie que la course est toujours en 'pending' (pas déjà prise).
    """
    try:
        # Verify the current user is a driver and is online
        driver_result = await db.execute(
            select(Drivers).where(
                and_(
                    Drivers.user_id == current_user.id,
                    Drivers.status == "online"
                )
            )
        )
        driver = driver_result.scalar_one_or_none()

        if not driver:
            raise HTTPException(
                status_code=403,
                detail="Vous n'êtes pas un chauffeur actif ou vous n'êtes pas en ligne."
            )

        # Get the ride and check it's still pending
        ride_result = await db.execute(
            select(Rides).where(
                and_(
                    Rides.id == data.ride_id,
                    Rides.status == "pending",
                    Rides.driver_id.is_(None),
                )
            )
        )
        ride = ride_result.scalar_one_or_none()

        if not ride:
            raise HTTPException(
                status_code=409,
                detail="Cette course n'est plus disponible. Elle a déjà été acceptée par un autre chauffeur."
            )

        # Assign ride to driver
        ride.driver_id = driver.id
        ride.vehicle_id = driver.vehicle_id
        ride.status = "accepted"

        # Update driver status to on_ride
        driver.status = "on_ride"

        await db.commit()
        await db.refresh(ride)

        logger.info(f"Ride {ride.id} accepted by driver {driver.id} (user {current_user.id})")

        return {
            "success": True,
            "ride_id": ride.id,
            "status": "accepted",
            "driver_id": driver.id,
            "vehicle_id": driver.vehicle_id,
            "message": "Course acceptée ! Rendez-vous au point de prise en charge.",
            "pickup": {
                "address": ride.pickup_address,
                "lat": ride.pickup_lat,
                "lng": ride.pickup_lng,
            },
            "destination": {
                "address": ride.destination_address,
                "lat": ride.destination_lat,
                "lng": ride.destination_lng,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error accepting ride: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# === Mode démo (tests internes uniquement) ===
#
# L'auto-acceptation d'une course n'a AUCUNE place en exploitation réelle : un
# passager ne doit jamais se voir attribuer un chauffeur qui ne s'est pas
# engagé lui-même. Ce comportement est donc désactivé par défaut et ne
# s'active que si la variable d'environnement DEMO_MODE vaut explicitement
# "true" (jamais sur l'environnement de prévisualisation partagé).
#
# Même activé, le mode démo n'assigne QUE des chauffeurs réels déjà présents
# en base et en ligne : aucun chauffeur fictif n'est jamais créé.
DEMO_AUTO_ACCEPT_DELAY_SECONDS = 10


def _is_demo_mode() -> bool:
    """Vrai uniquement si DEMO_MODE est explicitement activé dans l'environnement."""
    return os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")


@router.get("/ride-status/{ride_id}")
async def get_ride_status(
    ride_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Vérifie le statut d'une course (pour le passager qui attend un chauffeur).

    Une course reste en statut 'pending' tant qu'aucun chauffeur réel et en
    ligne ne l'a acceptée manuellement via /accept-ride. Aucune assignation
    automatique n'a lieu en exploitation.
    """
    try:
        ride_result = await db.execute(
            select(Rides).where(Rides.id == ride_id)
        )
        ride = ride_result.scalar_one_or_none()

        if not ride:
            raise HTTPException(status_code=404, detail="Course introuvable.")

        # Auto-acceptation réservée aux tests internes (DEMO_MODE=true).
        # Désactivée par défaut : la course reste 'pending' indéfiniment.
        if _is_demo_mode() and ride.status == "pending" and ride.created_at:
            now = datetime.now(timezone.utc)
            ride_created = ride.created_at
            # Ensure timezone-aware comparison
            if ride_created.tzinfo is None:
                ride_created = ride_created.replace(tzinfo=timezone.utc)
            elapsed = (now - ride_created).total_seconds()

            if elapsed >= DEMO_AUTO_ACCEPT_DELAY_SECONDS:
                # Uniquement un chauffeur réel déjà en ligne ; jamais de création.
                driver = await _find_online_driver(db)
                if driver:
                    ride.driver_id = driver.id
                    ride.vehicle_id = driver.vehicle_id
                    ride.status = "accepted"
                    driver.status = "on_ride"
                    await db.commit()
                    await db.refresh(ride)
                    logger.info(
                        f"[DEMO_MODE] Ride {ride.id} auto-accepted by real online "
                        f"driver {driver.id} after {elapsed:.0f}s"
                    )

        response = {
            "ride_id": ride.id,
            "status": ride.status,
            "driver_id": ride.driver_id,
            "vehicle_id": ride.vehicle_id,
            "pickup_address": ride.pickup_address,
            "destination_address": ride.destination_address,
            "estimated_price": ride.estimated_price,
        }

        # If a driver accepted, get driver info
        if ride.driver_id:
            driver_result = await db.execute(
                select(Drivers).where(Drivers.id == ride.driver_id)
            )
            driver = driver_result.scalar_one_or_none()
            if driver:
                response["driver"] = {
                    "id": driver.id,
                    "first_name": driver.first_name,
                    "last_name": driver.last_name,
                    "phone": driver.phone,
                    "rating": driver.rating,
                    "vehicle_id": driver.vehicle_id,
                }

        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ride status: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


async def _find_online_driver(db: AsyncSession) -> Optional[Drivers]:
    """
    Retourne un chauffeur RÉEL déjà enregistré et en ligne, ou None.

    Aucun chauffeur fictif n'est créé et aucun chauffeur hors ligne n'est
    réquisitionné : si personne n'est disponible, la course reste en attente.
    """
    result = await db.execute(
        select(Drivers).where(Drivers.status == "online").limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/cancel-ride/{ride_id}")
async def cancel_ride(
    ride_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Annuler une course (par le passager avant qu'elle soit acceptée,
    ou par le chauffeur après acceptation).
    """
    try:
        ride_result = await db.execute(
            select(Rides).where(Rides.id == ride_id)
        )
        ride = ride_result.scalar_one_or_none()

        if not ride:
            raise HTTPException(status_code=404, detail="Course introuvable.")

        # Only pending or accepted rides can be cancelled
        if ride.status not in ("pending", "accepted"):
            raise HTTPException(
                status_code=400,
                detail="Cette course ne peut plus être annulée."
            )

        # If ride was accepted, free the driver
        if ride.driver_id:
            driver_result = await db.execute(
                select(Drivers).where(Drivers.id == ride.driver_id)
            )
            driver = driver_result.scalar_one_or_none()
            if driver:
                driver.status = "online"

        ride.status = "cancelled"
        await db.commit()

        logger.info(f"Ride {ride.id} cancelled by user {current_user.id}")

        return {
            "success": True,
            "ride_id": ride.id,
            "status": "cancelled",
            "message": "Course annulée.",
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error cancelling ride: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/complete-ride/{ride_id}")
async def complete_ride(
    ride_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Termine une course et déclenche le reversement automatique encours → caisse.
    Appelé par le chauffeur ou le système quand la course est terminée.
    Idempotent : si la course est déjà 'completed', ne fait rien.
    Délègue au service ride_completion (source unique de vérité).
    """
    from services.ride_completion import complete_ride_and_transfer

    try:
        result = await complete_ride_and_transfer(
            db=db,
            ride_id=ride_id,
            release_gps=False,
        )

        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Course introuvable.")

        if result.get("error") == "invalid_status":
            raise HTTPException(status_code=400, detail=result["message"])

        await db.commit()

        logger.info(f"Ride {ride_id} completed by user {current_user.id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error completing ride: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")