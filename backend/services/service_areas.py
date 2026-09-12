"""
Zones de service EDEN VTC — villes desservies à travers l'Afrique.

EDEN VTC a démarré à Douala, mais la table `country_tariffs` (tarifs, devise,
majorations) est déjà renseignée pour 25 pays et marquée `is_active=true` :
l'intention business de couvrir ces pays existait déjà, simplement sans être
reliée à la logique de commande. Ce module fait le lien : chaque ville
desservie est ancrée à un pays de `country_tariffs`, et une course n'est
acceptée que si (a) elle est à moins de `radius_km` d'une ville de la liste,
ET (b) le pays de cette ville est actif dans `country_tariffs`.

Désactiver un pays (`country_tariffs.is_active = false`) suffit donc à en
retirer la ville de la zone desservie, sans toucher au code — et à l'inverse,
ajouter une ville ici la rend disponible dès que son pays est actif.

Note : seule Douala dispose aujourd'hui de chauffeurs/véhicules de démonstration.
Une commande dans une autre ville de cette liste est acceptée (la zone
géographique est desservie) mais restera en attente tant qu'aucun chauffeur
n'y est réellement en ligne — exactement le même comportement qu'à Douala
sans chauffeur disponible.
"""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.country_tariffs import Country_tariffs


@dataclass(frozen=True)
class ServiceCity:
    name: str
    country_code: str
    country_name: str
    lat: float
    lng: float
    radius_km: float = 35.0


# Grandes villes d'Afrique — mêmes coordonnées que EDEN_CITIES côté frontend
# (frontend/src/lib/geolocation.ts), pour rester cohérent avec la détection
# de position et le biais de géocodage déjà utilisés par l'application.
SERVICE_CITIES: list[ServiceCity] = [
    ServiceCity("Douala", "CM", "Cameroun", 4.0511, 9.7679),
    ServiceCity("Yaoundé", "CM", "Cameroun", 3.8480, 11.5021),
    ServiceCity("Abidjan", "CI", "Côte d'Ivoire", 5.3600, -4.0083),
    ServiceCity("Dakar", "SN", "Sénégal", 14.7167, -17.4677),
    ServiceCity("Libreville", "GA", "Gabon", 0.4162, 9.4673),
    ServiceCity("Brazzaville", "CG", "Congo", -4.2634, 15.2429),
    ServiceCity("Kinshasa", "CD", "RD Congo", -4.4419, 15.2663),
    ServiceCity("Lomé", "TG", "Togo", 6.1725, 1.2314),
    ServiceCity("Cotonou", "BJ", "Bénin", 6.3703, 2.3912),
    ServiceCity("Bamako", "ML", "Mali", 12.6392, -8.0029),
    ServiceCity("Ouagadougou", "BF", "Burkina Faso", 12.3714, -1.5197),
    ServiceCity("Niamey", "NE", "Niger", 13.5137, 2.1098),
    ServiceCity("Conakry", "GN", "Guinée", 9.6412, -13.5784),
    ServiceCity("Bangui", "CF", "Centrafrique", 4.3947, 18.5582),
    ServiceCity("Ndjamena", "TD", "Tchad", 12.1348, 15.0557),
    ServiceCity("Accra", "GH", "Ghana", 5.6037, -0.1870),
    ServiceCity("Lagos", "NG", "Nigeria", 6.5244, 3.3792),
    ServiceCity("Nairobi", "KE", "Kenya", -1.2921, 36.8219),
    ServiceCity("Kampala", "UG", "Ouganda", 0.3476, 32.5825),
    ServiceCity("Kigali", "RW", "Rwanda", -1.9403, 29.8739),
    ServiceCity("Dar es Salaam", "TZ", "Tanzanie", -6.7924, 39.2083),
    ServiceCity("Luanda", "AO", "Angola", -8.8390, 13.2894),
    ServiceCity("Casablanca", "MA", "Maroc", 33.5731, -7.5898),
    ServiceCity("Tunis", "TN", "Tunisie", 36.8065, 10.1815),
    ServiceCity("Alger", "DZ", "Algérie", 36.7538, 3.0588),
]


async def _active_country_codes(db: AsyncSession) -> set[str]:
    result = await db.execute(select(Country_tariffs.country_code).where(Country_tariffs.is_active.is_(True)))
    return {row[0] for row in result.all()}


async def get_active_service_cities(db: AsyncSession) -> list[ServiceCity]:
    """Villes dont le pays est actif dans `country_tariffs`."""
    active_codes = await _active_country_codes(db)
    return [city for city in SERVICE_CITIES if city.country_code in active_codes]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math

    R = 6371.0
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_city(lat: float, lng: float, cities: list[ServiceCity]) -> Optional[tuple[ServiceCity, float]]:
    """Ville active la plus proche de (lat, lng), avec sa distance en km. None si `cities` est vide."""
    if not cities:
        return None
    ranked = sorted(cities, key=lambda c: _haversine_km(lat, lng, c.lat, c.lng))
    nearest = ranked[0]
    return nearest, _haversine_km(lat, lng, nearest.lat, nearest.lng)


def is_within_any_city(lat: float, lng: float, cities: list[ServiceCity]) -> bool:
    return any(_haversine_km(lat, lng, c.lat, c.lng) <= c.radius_km for c in cities)
