# @File: backend/routers/ai_chatbot.py
# @Desc: API route for AI chatbot assistant (passenger support)
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional

from core.database import get_db
from dependencies.auth import get_optional_user
from models.drivers import Drivers
from models.passengers import Passengers
from models.rides import Rides
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/chatbot", tags=["chatbot"])

ACTIVE_RIDE_STATUSES = ("pending", "accepted", "in_progress")

SYSTEM_PROMPT = """Tu es l'assistant virtuel EDEN VTC, une application de VTC 100% électrique au Cameroun (Douala, Yaoundé et autres villes africaines).

Tu aides les passagers avec :
- Estimation de prix des courses (base 500 FCFA + 350 FCFA/km + 50 FCFA/min)
- Aide à la réservation
- Informations sur le service (véhicules électriques, zones couvertes)
- Statut des courses en cours
- Gestion du portefeuille (rechargement, solde)
- Questions fréquentes

Règles :
- Réponds toujours en français sauf si le passager parle anglais
- Sois concis, amical et professionnel
- Monnaie : FCFA (pas de décimales)
- Si tu ne sais pas, oriente vers le support humain
- Ne donne jamais d'informations personnelles sur d'autres utilisateurs
- Mentionne que EDEN VTC est 100% électrique et écologique
- N'invente jamais un statut de course, un prix exact ou une position de
  chauffeur que tu ne connais pas : appuie-toi uniquement sur le contexte de
  course fourni ci-dessous s'il est présent, sinon dis que tu ne sais pas et
  invite le passager à consulter l'écran de suivi
- Tu ne traites et ne confirmes jamais toi-même un paiement, une annulation
  ou une réservation : tu guides le passager vers le bon écran pour le faire"""


class ChatRequest(BaseModel):
    messages: List[dict]  # [{"role": "user"|"assistant", "content": "..."}]
    context: Optional[str] = None  # optional context (current ride status, etc.)


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str]
    configured: bool = True


async def _build_active_ride_context(db: AsyncSession, user_id: str) -> Optional[str]:
    """Résumé factuel de la course active du passager connecté (s'il y en a
    une), pour ancrer les réponses sur des données réelles plutôt que de
    laisser le modèle deviner un statut ou un prix. Rien n'est exposé à un
    visiteur non authentifié."""
    passenger_result = await db.execute(select(Passengers).where(Passengers.user_id == user_id))
    passenger = passenger_result.scalar_one_or_none()
    if not passenger:
        return None

    ride_result = await db.execute(
        select(Rides)
        .where(Rides.passenger_id == passenger.id, Rides.status.in_(ACTIVE_RIDE_STATUSES))
        .order_by(Rides.created_at.desc())
        .limit(1)
    )
    ride = ride_result.scalar_one_or_none()
    if not ride:
        return None

    lines = [
        f"Statut de la course : {ride.status}",
        f"Départ : {ride.pickup_address}",
        f"Destination : {ride.destination_address}",
    ]
    if ride.estimated_price:
        lines.append(f"Prix estimé : {ride.estimated_price} FCFA")
    if ride.payment_method:
        lines.append(f"Mode de paiement : {ride.payment_method}")

    if ride.driver_id:
        driver_result = await db.execute(select(Drivers).where(Drivers.id == ride.driver_id))
        driver = driver_result.scalar_one_or_none()
        if driver:
            lines.append(f"Chauffeur assigné : {driver.first_name} {driver.last_name}, note {driver.rating}/5")

    return "\n".join(lines)


@router.post("/ask", response_model=ChatResponse)
async def ask_chatbot(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """AI chatbot for passenger assistance.

    Accessible sans connexion (le widget est affiché avant login) : un
    utilisateur connecté avec une course active reçoit en plus des réponses
    ancrées sur cette course réelle."""
    service = AIHubService()
    if not service.client:
        # Fournisseur IA non configuré sur cette instance : message explicite
        # plutôt que le message d'erreur générique ci-dessous, pour que ce
        # soit distinguable d'une vraie panne côté admin/logs.
        return ChatResponse(
            reply=(
                "L'assistant IA n'est pas encore activé sur cette instance "
                "(aucun fournisseur IA configuré). Un administrateur peut "
                "l'activer depuis les paramètres."
            ),
            suggestions=["Commander une course", "Mon portefeuille", "Aide"],
            configured=False,
        )

    try:
        # Build messages with system prompt
        messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]

        ride_context = None
        if current_user:
            ride_context = await _build_active_ride_context(db, current_user.id)
        if ride_context:
            messages.append(ChatMessage(
                role="system",
                content=f"Contexte réel de la course active du passager :\n{ride_context}",
            ))
        # Add context if explicitly provided by the caller
        if data.context:
            messages.append(ChatMessage(role="system", content=f"Contexte actuel : {data.context}"))

        # Add conversation history (last 10 messages max)
        for msg in data.messages[-10:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append(ChatMessage(role=role, content=content))

        request = GenTxtRequest(
            messages=messages,
            model="gpt-5.4",
        )

        response = await service.gentxt(request)
        reply = response.content.strip()

        # Generate contextual suggestions
        last_message = data.messages[-1].get("content", "") if data.messages else ""
        suggestions = _generate_suggestions(last_message, has_active_ride=bool(ride_context))

        return ChatResponse(reply=reply, suggestions=suggestions)

    except Exception as e:
        logging.error(f"Chatbot error: {e}")
        return ChatResponse(
            reply="Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants ou contacter le support EDEN VTC.",
            suggestions=["Réessayer", "Contacter le support", "Voir les FAQ"]
        )


def _generate_suggestions(last_message: str, has_active_ride: bool = False) -> List[str]:
    """Generate contextual quick suggestions based on conversation"""
    last_lower = last_message.lower()

    if any(word in last_lower for word in ["prix", "coût", "combien", "tarif"]):
        return ["Estimer une course", "Voir les tarifs", "Promotions en cours"]
    elif any(word in last_lower for word in ["réserver", "commander", "course"]):
        return ["Commander maintenant", "Programmer une course", "Courses favorites"]
    elif any(word in last_lower for word in ["portefeuille", "solde", "recharger", "payer"]):
        return ["Voir mon solde", "Recharger", "Historique des paiements"]
    elif any(word in last_lower for word in ["chauffeur", "attente", "arrivée"]):
        return ["Suivre ma course", "Contacter le chauffeur", "Annuler la course"]
    elif has_active_ride:
        return ["Où en est ma course ?", "Annuler ma course", "Frais d'annulation"]
    else:
        return ["Commander une course", "Mon portefeuille", "Aide"]