# @File: backend/services/ip_geolocation.py
# @Desc: Service de géolocalisation IP avec triangulation multi-services pour améliorer la précision
import logging
import asyncio
from typing import Optional
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# Rayon terrestre en km
EARTH_RADIUS_KM = 6371.0


@dataclass
class IPLocationResult:
    """Résultat d'un service de géolocalisation IP"""
    lat: float
    lng: float
    city: str
    country: str
    isp: str
    accuracy_km: float  # Rayon de précision estimé en km
    source: str
    confidence: float  # 0.0 à 1.0


@dataclass
class TriangulatedLocation:
    """Résultat triangulé à partir de plusieurs sources"""
    lat: float
    lng: float
    city: str
    country: str
    accuracy_km: float
    confidence: float  # Score de confiance global (0.0 à 1.0)
    sources_used: int
    sources_total: int
    method: str  # 'triangulated', 'single', 'fallback'
    details: list


async def _query_ip_api(client: httpx.AsyncClient, ip: Optional[str] = None) -> Optional[IPLocationResult]:
    """Service 1: ip-api.com (gratuit, bonne couverture Afrique, pas de clé requise)"""
    try:
        url = f"http://ip-api.com/json/{ip or ''}"
        params = {"fields": "lat,lon,city,country,isp,query,status,message", "lang": "fr"}
        res = await client.get(url, params=params, timeout=5.0)
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success" or (data.get("lat") and data.get("lon")):
                return IPLocationResult(
                    lat=data["lat"],
                    lng=data["lon"],
                    city=data.get("city", ""),
                    country=data.get("country", ""),
                    isp=data.get("isp", ""),
                    accuracy_km=25.0,  # Précision typique IP: ~25km en zone urbaine
                    source="ip-api.com",
                    confidence=0.7,
                )
    except Exception as e:
        logger.debug(f"ip-api.com failed: {e}")
    return None


async def _query_ipapi_co(client: httpx.AsyncClient, ip: Optional[str] = None) -> Optional[IPLocationResult]:
    """Service 2: ipapi.co (gratuit limité, bonne précision)"""
    try:
        url = f"https://ipapi.co/{ip + '/' if ip else ''}json/"
        res = await client.get(url, timeout=5.0)
        if res.status_code == 200:
            data = res.json()
            if data.get("latitude") and data.get("longitude") and not data.get("error"):
                return IPLocationResult(
                    lat=data["latitude"],
                    lng=data["longitude"],
                    city=data.get("city", ""),
                    country=data.get("country_name", ""),
                    isp=data.get("org", ""),
                    accuracy_km=20.0,
                    source="ipapi.co",
                    confidence=0.75,
                )
    except Exception as e:
        logger.debug(f"ipapi.co failed: {e}")
    return None


async def _query_ipwhois(client: httpx.AsyncClient, ip: Optional[str] = None) -> Optional[IPLocationResult]:
    """Service 3: ipwho.is (gratuit, pas de limite stricte)"""
    try:
        url = f"https://ipwho.is/{ip or ''}"
        res = await client.get(url, timeout=5.0)
        if res.status_code == 200:
            data = res.json()
            if data.get("success") and data.get("latitude") and data.get("longitude"):
                return IPLocationResult(
                    lat=data["latitude"],
                    lng=data["longitude"],
                    city=data.get("city", ""),
                    country=data.get("country", ""),
                    isp=data.get("connection", {}).get("isp", ""),
                    accuracy_km=30.0,
                    source="ipwho.is",
                    confidence=0.65,
                )
    except Exception as e:
        logger.debug(f"ipwho.is failed: {e}")
    return None


async def _query_ipinfo(client: httpx.AsyncClient, ip: Optional[str] = None) -> Optional[IPLocationResult]:
    """Service 4: ipinfo.io (gratuit limité, très bonne précision)"""
    try:
        url = f"https://ipinfo.io/{ip or 'json'}"
        if not ip:
            url = "https://ipinfo.io/json"
        res = await client.get(url, timeout=5.0, headers={"Accept": "application/json"})
        if res.status_code == 200:
            data = res.json()
            loc = data.get("loc", "")
            if loc and "," in loc:
                lat_str, lng_str = loc.split(",")
                return IPLocationResult(
                    lat=float(lat_str),
                    lng=float(lng_str),
                    city=data.get("city", ""),
                    country=data.get("country", ""),
                    isp=data.get("org", ""),
                    accuracy_km=15.0,  # ipinfo est généralement plus précis
                    source="ipinfo.io",
                    confidence=0.8,
                )
    except Exception as e:
        logger.debug(f"ipinfo.io failed: {e}")
    return None


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance en km entre deux points (formule de Haversine)"""
    import math
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def _triangulate_results(results: list[IPLocationResult]) -> TriangulatedLocation:
    """
    Triangule les résultats de plusieurs services IP pour améliorer la précision.
    Utilise une moyenne pondérée par la confiance de chaque source.
    Élimine les outliers (résultats trop éloignés de la médiane).
    """
    if not results:
        # Fallback ultime: Douala
        return TriangulatedLocation(
            lat=4.0511, lng=9.7679,
            city="Douala", country="Cameroun",
            accuracy_km=100.0, confidence=0.1,
            sources_used=0, sources_total=0,
            method="fallback", details=[],
        )

    if len(results) == 1:
        r = results[0]
        return TriangulatedLocation(
            lat=r.lat, lng=r.lng,
            city=r.city, country=r.country,
            accuracy_km=r.accuracy_km, confidence=r.confidence,
            sources_used=1, sources_total=1,
            method="single",
            details=[{"source": r.source, "lat": r.lat, "lng": r.lng, "confidence": r.confidence}],
        )

    # Étape 1: Calculer le centroïde initial (moyenne simple)
    avg_lat = sum(r.lat for r in results) / len(results)
    avg_lng = sum(r.lng for r in results) / len(results)

    # Étape 2: Éliminer les outliers (> 100km du centroïde)
    filtered = []
    for r in results:
        dist = _haversine_distance(avg_lat, avg_lng, r.lat, r.lng)
        if dist < 100.0:  # Garder seulement les résultats à moins de 100km
            filtered.append(r)

    # Si tous sont des outliers, garder celui avec la meilleure confiance
    if not filtered:
        best = max(results, key=lambda r: r.confidence)
        return TriangulatedLocation(
            lat=best.lat, lng=best.lng,
            city=best.city, country=best.country,
            accuracy_km=best.accuracy_km, confidence=best.confidence * 0.8,
            sources_used=1, sources_total=len(results),
            method="single",
            details=[{"source": r.source, "lat": r.lat, "lng": r.lng, "confidence": r.confidence} for r in results],
        )

    # Étape 3: Moyenne pondérée par la confiance
    total_weight = sum(r.confidence for r in filtered)
    weighted_lat = sum(r.lat * r.confidence for r in filtered) / total_weight
    weighted_lng = sum(r.lng * r.confidence for r in filtered) / total_weight

    # Étape 4: Calculer la dispersion (écart max entre les sources)
    max_spread = 0.0
    for r in filtered:
        dist = _haversine_distance(weighted_lat, weighted_lng, r.lat, r.lng)
        max_spread = max(max_spread, dist)

    # Étape 5: Score de confiance basé sur la cohérence
    # Plus les sources sont proches, plus la confiance est élevée
    if max_spread < 5.0:
        coherence_bonus = 0.95
    elif max_spread < 15.0:
        coherence_bonus = 0.85
    elif max_spread < 30.0:
        coherence_bonus = 0.7
    else:
        coherence_bonus = 0.5

    # Confiance finale = moyenne des confiances × bonus de cohérence
    avg_confidence = sum(r.confidence for r in filtered) / len(filtered)
    final_confidence = min(avg_confidence * coherence_bonus * (len(filtered) / len(results)), 0.95)

    # Précision estimée = min des précisions individuelles × facteur de cohérence
    best_accuracy = min(r.accuracy_km for r in filtered)
    final_accuracy = best_accuracy * (0.5 if max_spread < 10 else 0.8 if max_spread < 25 else 1.0)

    # Ville = celle du service le plus confiant
    best_source = max(filtered, key=lambda r: r.confidence)

    return TriangulatedLocation(
        lat=round(weighted_lat, 6),
        lng=round(weighted_lng, 6),
        city=best_source.city,
        country=best_source.country,
        accuracy_km=round(final_accuracy, 1),
        confidence=round(final_confidence, 3),
        sources_used=len(filtered),
        sources_total=len(results),
        method="triangulated",
        details=[{"source": r.source, "lat": r.lat, "lng": r.lng, "confidence": r.confidence} for r in results],
    )


async def geolocate_ip(ip: Optional[str] = None) -> TriangulatedLocation:
    """
    Géolocalise une adresse IP en interrogeant plusieurs services simultanément
    et en triangulant les résultats pour une meilleure précision.
    
    Args:
        ip: Adresse IP à géolocaliser. Si None, utilise l'IP du client.
    
    Returns:
        TriangulatedLocation avec coordonnées, ville, confiance et détails.
    """
    async with httpx.AsyncClient() as client:
        # Interroger tous les services en parallèle
        tasks = [
            _query_ipinfo(client, ip),
            _query_ipapi_co(client, ip),
            _query_ip_api(client, ip),
            _query_ipwhois(client, ip),
        ]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filtrer les résultats valides
    results: list[IPLocationResult] = []
    for r in raw_results:
        if isinstance(r, IPLocationResult):
            results.append(r)

    logger.info(f"IP geolocation: {len(results)}/{len(tasks)} services responded for IP={ip or 'self'}")

    return _triangulate_results(results)