"""Majoration trafic — source unique de vérité côté serveur.

Contrairement au panneau trafic affiché au passager (simulation visuelle côté
frontend, à titre indicatif), le multiplicateur appliqué ici au prix facturé
est calculé côté serveur, de façon déterministe (pas d'aléatoire), pour rester
auditable : deux courses commandées à la même minute dans la même ville
reçoivent la même majoration.

Faute d'API de trafic temps réel encore souscrite, l'heuristique s'appuie sur
les plages horaires de pointe connues à Douala (mêmes plages que le panneau
trafic affiché côté passager, pour rester cohérent avec ce que l'utilisateur
voit à l'écran).
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

DOUALA_TZ = timezone(timedelta(hours=1))

# Multiplicateurs par niveau de congestion (plafonnés, cf. MAX_SURGE_MULTIPLIER en aval)
TRAFFIC_MULTIPLIERS = {
    "low": 1.0,
    "moderate": 1.05,
    "heavy": 1.12,
    "severe": 1.20,
}


def _traffic_level(local_dt: datetime) -> str:
    hour = local_dt.hour
    is_weekend = local_dt.weekday() >= 5  # samedi=5, dimanche=6

    is_morning_peak = 6 <= hour <= 9
    is_evening_peak = 16 <= hour <= 19
    is_lunch = 12 <= hour <= 14
    is_night = hour >= 22 or hour <= 5

    if is_weekend:
        # Trafic nettement plus fluide le week-end à Douala
        if is_night:
            return "low"
        return "moderate" if (is_morning_peak or is_evening_peak) else "low"

    if is_night:
        return "low"
    if is_morning_peak or is_evening_peak:
        return "severe" if hour in (7, 8, 17, 18) else "heavy"
    if is_lunch:
        return "moderate"
    return "low"


def get_traffic_factor(reference_time: Optional[datetime] = None) -> dict:
    """Retourne le niveau de trafic et le multiplicateur applicable au prix."""
    moment = reference_time or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local_dt = moment.astimezone(DOUALA_TZ)

    level = _traffic_level(local_dt)
    return {
        "level": level,
        "multiplier": TRAFFIC_MULTIPLIERS[level],
    }
