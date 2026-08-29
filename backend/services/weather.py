"""Majoration climat (pluie) — appel à une API météo gratuite, sans clé.

Utilise Open-Meteo (https://open-meteo.com), qui ne nécessite aucune clé
d'API — contrairement à Orange Money/MTN MoMo, ce point n'a donc pas besoin
d'attendre des identifiants pour fonctionner réellement en production.

Tolérance aux pannes : toute erreur réseau ou réponse inattendue retombe sur
un facteur neutre (1.0, "clear"). Une course ne doit jamais échouer à cause
d'une API météo indisponible — au pire, la majoration pluie n'est simplement
pas appliquée.
"""

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 3.0
CACHE_TTL_SECONDS = 600  # 10 minutes : la pluie ne change pas d'une course à l'autre

# Codes météo WMO (norme utilisée par Open-Meteo) signalant un orage
THUNDERSTORM_CODES = {95, 96, 99}

_cache: dict[str, tuple[float, dict]] = {}


def _cache_key(lat: float, lng: float) -> str:
    # Arrondi ~1km : assez précis pour une majoration météo, évite un appel par course
    return f"{round(lat, 2)}:{round(lng, 2)}"


def _classify(precipitation_mm: float, weather_code: Optional[int]) -> dict:
    is_storm = weather_code in THUNDERSTORM_CODES if weather_code is not None else False

    if is_storm or precipitation_mm > 8:
        return {"condition": "heavy_rain", "multiplier": 1.25}
    if precipitation_mm > 2:
        return {"condition": "moderate_rain", "multiplier": 1.15}
    if precipitation_mm > 0:
        return {"condition": "light_rain", "multiplier": 1.08}
    return {"condition": "clear", "multiplier": 1.0}


async def get_weather_factor(lat: Optional[float], lng: Optional[float]) -> dict:
    """Retourne la condition météo et le multiplicateur de prix applicable.

    Repli neutre si les coordonnées manquent ou si l'appel échoue.
    """
    neutral = {"condition": "unknown", "multiplier": 1.0, "source": "fallback"}
    if lat is None or lng is None:
        return neutral

    key = _cache_key(lat, lng)
    cached = _cache.get(key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(
                WEATHER_API_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "current": "precipitation,weather_code",
                    "timezone": "Africa/Douala",
                },
            )
            response.raise_for_status()
            payload = response.json()

        current = payload.get("current") or {}
        precipitation_mm = float(current.get("precipitation") or 0)
        weather_code = current.get("weather_code")

        result = _classify(precipitation_mm, weather_code)
        result["source"] = "open-meteo"
        result["precipitation_mm"] = precipitation_mm

        _cache[key] = (time.monotonic(), result)
        return result
    except Exception as exc:  # pragma: no cover - défensif, API tierce
        logger.warning("Appel météo impossible (%s), repli sur facteur neutre", exc)
        return neutral
