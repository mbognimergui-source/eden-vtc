# @File: backend/routers/ip_geolocation.py
# @Desc: API endpoint pour la géolocalisation IP avec triangulation multi-services
import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.ip_geolocation import geolocate_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/geolocation", tags=["geolocation"])


class GeolocateResponse(BaseModel):
    lat: float
    lng: float
    city: str
    country: str
    accuracy_km: float
    confidence: float
    sources_used: int
    sources_total: int
    method: str
    details: list


class GeolocateRequest(BaseModel):
    ip: Optional[str] = None  # Si None, utilise l'IP du client


@router.post("/locate", response_model=GeolocateResponse)
async def locate_by_ip(request: Request, data: GeolocateRequest = GeolocateRequest()):
    """
    Géolocalise l'utilisateur par son adresse IP avec triangulation multi-services.
    Interroge 4 services simultanément et combine les résultats pour une meilleure précision.
    
    - Si `ip` est fourni, géolocalise cette IP spécifique.
    - Sinon, détecte automatiquement l'IP du client via les headers de la requête.
    
    Retourne les coordonnées, la ville, le pays, la précision estimée et un score de confiance.
    """
    # Détecter l'IP du client si non fournie
    target_ip = data.ip
    if not target_ip:
        # Essayer les headers proxy courants
        target_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.headers.get("X-Real-IP", "")
            or request.headers.get("CF-Connecting-IP", "")
            or (request.client.host if request.client else None)
        )
        # Si c'est une IP locale, ne pas la passer aux services (ils détecteront l'IP publique)
        if target_ip and target_ip.startswith(("127.", "10.", "172.", "192.168.", "::1")):
            target_ip = None

    logger.info(f"Geolocation request for IP: {target_ip or 'auto-detect'}")

    result = await geolocate_ip(target_ip)

    return GeolocateResponse(
        lat=result.lat,
        lng=result.lng,
        city=result.city,
        country=result.country,
        accuracy_km=result.accuracy_km,
        confidence=result.confidence,
        sources_used=result.sources_used,
        sources_total=result.sources_total,
        method=result.method,
        details=result.details,
    )


@router.get("/locate", response_model=GeolocateResponse)
async def locate_by_ip_get(request: Request):
    """
    Version GET de l'endpoint de géolocalisation (sans body).
    Détecte automatiquement l'IP du client.
    """
    return await locate_by_ip(request, GeolocateRequest())