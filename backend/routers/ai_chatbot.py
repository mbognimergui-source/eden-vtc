# @File: backend/routers/ai_chatbot.py
# @Desc: API route for AI chatbot assistant (passenger support)
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional

from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage

router = APIRouter(prefix="/api/v1/chatbot", tags=["chatbot"])

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
- Mentionne que EDEN VTC est 100% électrique et écologique"""


class ChatRequest(BaseModel):
    messages: List[dict]  # [{"role": "user"|"assistant", "content": "..."}]
    context: Optional[str] = None  # optional context (current ride status, etc.)


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str]


@router.post("/ask", response_model=ChatResponse)
async def ask_chatbot(
    data: ChatRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """AI chatbot for passenger assistance"""
    try:
        service = AIHubService()

        # Build messages with system prompt
        messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]

        # Add context if provided
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
        suggestions = _generate_suggestions(data.messages[-1].get("content", "") if data.messages else "")

        return ChatResponse(reply=reply, suggestions=suggestions)

    except Exception as e:
        logging.error(f"Chatbot error: {e}")
        return ChatResponse(
            reply="Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants ou contacter le support EDEN VTC.",
            suggestions=["Réessayer", "Contacter le support", "Voir les FAQ"]
        )


def _generate_suggestions(last_message: str) -> List[str]:
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
    else:
        return ["Commander une course", "Mon portefeuille", "Aide"]