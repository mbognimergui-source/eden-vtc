"""EDEN Trust Score — score de confiance algorithmique par chauffeur.

Combine trois signaux déjà présents dans la base (note moyenne, expérience,
taux de courses menées à terme) en un score transparent à 0-100 accompagné
de ses facteurs explicites. Aucun appel externe, aucune clé API : le score
est disponible immédiatement pour chaque chauffeur, contrairement à un
assistant IA générative qui nécessiterait un fournisseur LLM configuré.

Affiché au passager pendant le suivi de course (`TrackRide.tsx`) pour lui
donner une raison concrète de faire confiance à son chauffeur — un argument
de sécurité/transparence que DiDi et Yango n'exposent pas sur ce marché.
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.drivers import Drivers
from models.rides import Rides

RATING_WEIGHT = 0.45
EXPERIENCE_WEIGHT = 0.20
RELIABILITY_WEIGHT = 0.35

# Nombre de courses à partir duquel le facteur "expérience" est à son maximum.
EXPERIENCE_FULL_MARKS_RIDES = 200


def _grade_for_score(score: int) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Très bon"
    if score >= 60:
        return "Bon"
    if score >= 40:
        return "Correct"
    return "À surveiller"


async def compute_driver_trust_score(db: AsyncSession, driver: Drivers) -> dict:
    """Calcule le score de confiance d'un chauffeur.

    - Note moyenne (45%) : reflet direct de la satisfaction des passagers.
    - Expérience (20%) : nombre de courses effectuées, plafonné.
    - Fiabilité (35%) : proportion de courses assignées à ce chauffeur qui se
      sont conclues par une arrivée à destination plutôt qu'une annulation.
      Un chauffeur sans historique conclu reçoit le bénéfice du doute (100%)
      plutôt qu'une pénalité pour absence de données.
    """
    rating = driver.rating or 0.0
    total_rides = driver.total_rides or 0

    result = await db.execute(
        select(Rides.status, func.count(Rides.id))
        .where(Rides.driver_id == driver.id, Rides.status.in_(("completed", "cancelled")))
        .group_by(Rides.status)
    )
    counts = dict(result.all())
    completed = counts.get("completed", 0)
    cancelled = counts.get("cancelled", 0)
    concluded = completed + cancelled

    rating_component = max(0.0, min(rating, 5.0)) / 5.0 * 100
    experience_component = min(total_rides / EXPERIENCE_FULL_MARKS_RIDES, 1.0) * 100
    reliability_component = (completed / concluded * 100) if concluded > 0 else 100.0

    overall = round(
        rating_component * RATING_WEIGHT
        + experience_component * EXPERIENCE_WEIGHT
        + reliability_component * RELIABILITY_WEIGHT
    )
    overall = max(0, min(100, overall))

    factors = [f"{rating:.1f}/5 sur {total_rides} course{'s' if total_rides != 1 else ''}"]
    if concluded > 0:
        factors.append(f"{round(reliability_component)}% des courses menées à terme ({completed}/{concluded})")
    else:
        factors.append("Pas encore d'historique de courses conclues")

    return {
        "score": overall,
        "grade": _grade_for_score(overall),
        "factors": factors,
    }
