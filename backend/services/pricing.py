"""
Tarification EDEN VTC — source unique de vérité côté serveur.

Règle de sécurité : le prix envoyé par le client (`estimated_price`) n'est
JAMAIS utilisé pour débiter le portefeuille ni pour créditer la caisse. Il est
uniquement conservé à titre indicatif pour comparaison/audit.

Le montant facturé est toujours recalculé ici à partir :
  - de la distance (recalculée depuis les coordonnées GPS quand elles sont
    disponibles, sinon depuis la distance transmise, plafonnée),
  - de la durée estimée,
  - des paramètres tarifaires en base (`tariff_settings`),
  - des majorations applicables (nuit, aéroport),
  - du tarif minimum et de l'arrondi monétaire FCFA.
"""

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.tariff_settings import Tariff_settings
from services.traffic import get_traffic_factor
from services.weather import get_weather_factor

logger = logging.getLogger(__name__)

# Fuseau d'exploitation : Africa/Douala (UTC+1, sans heure d'été)
DOUALA_TZ = timezone(timedelta(hours=1))

# Vitesse moyenne urbaine retenue pour estimer la durée (km/h)
AVERAGE_SPEED_KMH = 25.0

# Arrondi monétaire FCFA
ROUNDING_STEP_FCFA = 100

# Garde-fous : bornes de plausibilité d'une course urbaine
MAX_DISTANCE_KM = 200.0
MAX_DURATION_MIN = 300

# Garde-fou : majoration combinée trafic × météo plafonnée (pas de dérive type
# "surge" incontrôlée) — cohérent avec les autres bornes de sécurité ci-dessus.
MAX_CONDITIONS_MULTIPLIER = 1.35

# Valeurs de repli si aucun tarif n'est configuré en base
DEFAULT_TARIFF = {
    "base_fare": 500,
    "price_per_km": 350,
    "price_per_min": 50,
    "minimum_fare": 1000,
    "airport_surcharge": 2000,
    "night_multiplier": 1.5,
    "night_start_hour": 22,
    "night_end_hour": 6,
    "zone": "douala",
}

# Mots-clés déclenchant la majoration aéroport
AIRPORT_KEYWORDS = ("aeroport", "aéroport", "airport", "aerodrome", "aérodrome")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance orthodromique entre deux points, en kilomètres."""
    earth_radius_km = 6371.0
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    return earth_radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _round_fcfa(amount: float) -> int:
    """Arrondi au multiple de 100 FCFA supérieur le plus proche."""
    if amount <= 0:
        return 0
    return int(math.ceil(amount / ROUNDING_STEP_FCFA) * ROUNDING_STEP_FCFA)


def _is_airport_trip(*addresses: Optional[str]) -> bool:
    """Vrai si l'un des libellés d'adresse désigne un aéroport."""
    for address in addresses:
        if not address:
            continue
        lowered = address.lower()
        if any(keyword in lowered for keyword in AIRPORT_KEYWORDS):
            return True
    return False


def _is_night(reference: Optional[datetime], start_hour: int, end_hour: int) -> bool:
    """Vrai si l'heure locale de Douala tombe dans la plage nuit."""
    moment = reference or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local_hour = moment.astimezone(DOUALA_TZ).hour

    if start_hour == end_hour:
        return False
    if start_hour < end_hour:
        return start_hour <= local_hour < end_hour
    # Plage à cheval sur minuit (ex. 22h → 6h)
    return local_hour >= start_hour or local_hour < end_hour


async def get_active_tariff(db: AsyncSession, zone: Optional[str] = None) -> dict:
    """Charge le tarif actif en base, avec repli sur les valeurs par défaut."""
    tariff_row = None
    try:
        stmt = select(Tariff_settings).where(Tariff_settings.is_active.is_(True))
        if zone:
            stmt = stmt.where(Tariff_settings.zone == zone)
        result = await db.execute(stmt.order_by(Tariff_settings.id.desc()).limit(1))
        tariff_row = result.scalar_one_or_none()

        if not tariff_row and zone:
            fallback = await db.execute(
                select(Tariff_settings)
                .where(Tariff_settings.is_active.is_(True))
                .order_by(Tariff_settings.id.desc())
                .limit(1)
            )
            tariff_row = fallback.scalar_one_or_none()
    except Exception as exc:  # pragma: no cover - défensif
        logger.warning("Lecture des tarifs impossible, repli sur les valeurs par défaut: %s", exc)

    tariff = dict(DEFAULT_TARIFF)
    if tariff_row:
        for key in DEFAULT_TARIFF:
            value = getattr(tariff_row, key, None)
            if value is not None:
                tariff[key] = value
        tariff["tariff_id"] = tariff_row.id
        tariff["tariff_name"] = tariff_row.name
    else:
        tariff["tariff_id"] = None
        tariff["tariff_name"] = "Tarif par défaut"

    return tariff


def _resolve_distance_km(
    pickup_lat: Optional[float],
    pickup_lng: Optional[float],
    destination_lat: Optional[float],
    destination_lng: Optional[float],
    client_distance_km: Optional[float],
) -> tuple[float, str]:
    """
    Détermine la distance facturable et sa provenance.

    Priorité au calcul serveur depuis les coordonnées GPS. La distance
    transmise par le client ne sert que de repli et reste plafonnée.
    """
    if None not in (pickup_lat, pickup_lng, destination_lat, destination_lng):
        geo_km = haversine_km(pickup_lat, pickup_lng, destination_lat, destination_lng)
        if geo_km > 0:
            # Facteur de sinuosité : la route réelle est plus longue que l'orthodromie
            return min(geo_km * 1.3, MAX_DISTANCE_KM), "server_gps"

    if client_distance_km and client_distance_km > 0:
        return min(float(client_distance_km), MAX_DISTANCE_KM), "client_fallback"

    return 0.0, "unavailable"


def compute_price(
    tariff: dict,
    distance_km: float,
    duration_min: Optional[int] = None,
    is_airport: bool = False,
    reference_time: Optional[datetime] = None,
    traffic_factor: Optional[dict] = None,
    weather_factor: Optional[dict] = None,
) -> dict:
    """Calcule le montant facturable à partir d'un tarif et d'une distance.

    `traffic_factor` et `weather_factor` (voir `services/traffic.py` et
    `services/weather.py`) sont calculés côté serveur par l'appelant — jamais
    fournis par le client — et appliqués comme majorations combinées,
    plafonnées par `MAX_CONDITIONS_MULTIPLIER`.
    """
    distance_km = max(0.0, min(float(distance_km or 0), MAX_DISTANCE_KM))

    if duration_min and duration_min > 0:
        billable_duration = min(int(duration_min), MAX_DURATION_MIN)
    else:
        billable_duration = int(round((distance_km / AVERAGE_SPEED_KMH) * 60)) if distance_km else 0
        billable_duration = min(billable_duration, MAX_DURATION_MIN)

    base_fare = int(tariff.get("base_fare") or 0)
    distance_component = distance_km * int(tariff.get("price_per_km") or 0)
    duration_component = billable_duration * int(tariff.get("price_per_min") or 0)

    subtotal = base_fare + distance_component + duration_component

    night = _is_night(
        reference_time,
        int(tariff.get("night_start_hour") or 22),
        int(tariff.get("night_end_hour") or 6),
    )
    night_multiplier = float(tariff.get("night_multiplier") or 1.0) if night else 1.0
    subtotal *= night_multiplier

    traffic_factor = traffic_factor or {"level": "low", "multiplier": 1.0}
    weather_factor = weather_factor or {"condition": "unknown", "multiplier": 1.0}
    conditions_multiplier = min(
        float(traffic_factor.get("multiplier") or 1.0) * float(weather_factor.get("multiplier") or 1.0),
        MAX_CONDITIONS_MULTIPLIER,
    )
    subtotal *= conditions_multiplier

    airport_surcharge = int(tariff.get("airport_surcharge") or 0) if is_airport else 0
    subtotal += airport_surcharge

    minimum_fare = int(tariff.get("minimum_fare") or 0)
    total = max(subtotal, minimum_fare)

    return {
        "amount": _round_fcfa(total),
        "currency": "XAF",
        "breakdown": {
            "base_fare": base_fare,
            "distance_km": round(distance_km, 2),
            "distance_component": _round_fcfa(distance_component),
            "duration_min": billable_duration,
            "duration_component": _round_fcfa(duration_component),
            "night_multiplier": night_multiplier,
            "is_night": night,
            "traffic_level": traffic_factor.get("level"),
            "traffic_multiplier": traffic_factor.get("multiplier"),
            "weather_condition": weather_factor.get("condition"),
            "weather_multiplier": weather_factor.get("multiplier"),
            "conditions_multiplier": round(conditions_multiplier, 3),
            "airport_surcharge": airport_surcharge,
            "minimum_fare_applied": total == minimum_fare and minimum_fare > subtotal - 1,
        },
        "tariff_id": tariff.get("tariff_id"),
        "tariff_name": tariff.get("tariff_name"),
    }


async def quote_ride_price(
    db: AsyncSession,
    pickup_address: Optional[str],
    pickup_lat: Optional[float],
    pickup_lng: Optional[float],
    destination_address: Optional[str],
    destination_lat: Optional[float],
    destination_lng: Optional[float],
    client_distance_km: Optional[float] = None,
    client_duration_min: Optional[int] = None,
    zone: Optional[str] = None,
    reference_time: Optional[datetime] = None,
) -> dict:
    """Calcule le prix serveur d'une course à partir des données de trajet."""
    tariff = await get_active_tariff(db, zone=zone)
    distance_km, distance_source = _resolve_distance_km(
        pickup_lat, pickup_lng, destination_lat, destination_lng, client_distance_km
    )

    traffic_factor = get_traffic_factor(reference_time)
    weather_factor = await get_weather_factor(pickup_lat, pickup_lng)

    quote = compute_price(
        tariff=tariff,
        distance_km=distance_km,
        duration_min=client_duration_min,
        is_airport=_is_airport_trip(pickup_address, destination_address),
        reference_time=reference_time,
        traffic_factor=traffic_factor,
        weather_factor=weather_factor,
    )
    quote["distance_source"] = distance_source
    return quote


async def quote_price_for_ride(db: AsyncSession, ride: Any) -> dict:
    """Recalcule le prix serveur d'une course déjà enregistrée."""
    return await quote_ride_price(
        db=db,
        pickup_address=getattr(ride, "pickup_address", None),
        pickup_lat=getattr(ride, "pickup_lat", None),
        pickup_lng=getattr(ride, "pickup_lng", None),
        destination_address=getattr(ride, "destination_address", None),
        destination_lat=getattr(ride, "destination_lat", None),
        destination_lng=getattr(ride, "destination_lng", None),
        client_distance_km=getattr(ride, "distance_km", None),
        client_duration_min=getattr(ride, "duration_min", None),
        reference_time=getattr(ride, "created_at", None),
    )