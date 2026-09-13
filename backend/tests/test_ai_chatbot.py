"""
Tests pour l'Assistant EDEN (routers/ai_chatbot.py), consommé par le widget
flottant AIChatbot.tsx (monté globalement dans App.tsx, y compris avant
connexion).

Couvre : la dégradation propre quand aucun fournisseur IA n'est configuré
(pas d'erreur 500, pas le message générique de panne), le contexte de
course active injecté pour un passager connecté, l'absence de contexte
pour un visiteur anonyme ou sans course active, et les suggestions
générées.
"""
import sys
import os
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.ai_chatbot import (  # noqa: E402
    ask_chatbot,
    _build_active_ride_context,
    _generate_suggestions,
    ChatRequest,
)
from schemas.aihub import GenTxtResponse  # noqa: E402


class FakeUserResponse:
    def __init__(self, user_id="user-1"):
        self.id = user_id


class FakePassenger:
    def __init__(self, passenger_id=1):
        self.id = passenger_id


class FakeRide:
    def __init__(self, status="in_progress", driver_id=None, estimated_price=2000, payment_method="wallet"):
        self.status = status
        self.pickup_address = "Bastos, Yaoundé"
        self.destination_address = "Centre-ville, Yaoundé"
        self.driver_id = driver_id
        self.estimated_price = estimated_price
        self.payment_method = payment_method


class FakeDriver:
    def __init__(self):
        self.first_name = "Jean"
        self.last_name = "Test"
        self.rating = 4.8


class FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeDb:
    def __init__(self, execute_results):
        self._results = list(execute_results)

    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)


class TestBuildActiveRideContext:
    @pytest.mark.asyncio
    async def test_returns_none_without_passenger_profile(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        assert await _build_active_ride_context(db, "user-1") is None

    @pytest.mark.asyncio
    async def test_returns_none_without_active_ride(self):
        db = FakeDb(execute_results=[FakeScalarResult(FakePassenger()), FakeScalarResult(None)])
        assert await _build_active_ride_context(db, "user-1") is None

    @pytest.mark.asyncio
    async def test_includes_ride_details_and_driver(self):
        db = FakeDb(execute_results=[
            FakeScalarResult(FakePassenger()),
            FakeScalarResult(FakeRide(status="accepted", driver_id=1)),
            FakeScalarResult(FakeDriver()),
        ])
        context = await _build_active_ride_context(db, "user-1")
        assert "accepted" in context
        assert "2000 FCFA" in context
        assert "Jean Test" in context


class TestAskChatbot:
    @pytest.mark.asyncio
    async def test_not_configured_returns_explicit_message_not_generic_failure(self):
        db = FakeDb(execute_results=[])
        payload = ChatRequest(messages=[{"role": "user", "content": "Bonjour"}])

        with patch("routers.ai_chatbot.AIHubService") as MockService:
            MockService.return_value.client = None
            result = await ask_chatbot(payload, db=db, current_user=None)

        assert result.configured is False
        assert "pas encore activé" in result.reply
        assert "problème technique" not in result.reply

    @pytest.mark.asyncio
    async def test_anonymous_visitor_gets_no_ride_context(self):
        db = FakeDb(execute_results=[])
        payload = ChatRequest(messages=[{"role": "user", "content": "Comment ça marche ?"}])

        with patch("routers.ai_chatbot.AIHubService") as MockService:
            instance = MockService.return_value
            instance.client = object()
            instance.gentxt = AsyncMock(return_value=GenTxtResponse(content="Voici comment ça marche.", model="gpt-5.4"))

            result = await ask_chatbot(payload, db=db, current_user=None)

        assert result.reply == "Voici comment ça marche."
        sent_request = instance.gentxt.await_args.args[0]
        assert not any("Contexte réel de la course" in m.content for m in sent_request.messages)

    @pytest.mark.asyncio
    async def test_authenticated_user_with_active_ride_gets_grounded_context(self):
        db = FakeDb(execute_results=[
            FakeScalarResult(FakePassenger()),
            FakeScalarResult(FakeRide(status="accepted")),
        ])
        payload = ChatRequest(messages=[{"role": "user", "content": "Où en est ma course ?"}])

        with patch("routers.ai_chatbot.AIHubService") as MockService:
            instance = MockService.return_value
            instance.client = object()
            instance.gentxt = AsyncMock(return_value=GenTxtResponse(content="Votre course est acceptée.", model="gpt-5.4"))

            result = await ask_chatbot(payload, db=db, current_user=FakeUserResponse())

        assert result.reply == "Votre course est acceptée."
        sent_request = instance.gentxt.await_args.args[0]
        assert any("accepted" in m.content for m in sent_request.messages)

    @pytest.mark.asyncio
    async def test_falls_back_to_generic_message_when_model_call_fails(self):
        db = FakeDb(execute_results=[])
        payload = ChatRequest(messages=[{"role": "user", "content": "Bonjour"}])

        with patch("routers.ai_chatbot.AIHubService") as MockService:
            instance = MockService.return_value
            instance.client = object()
            instance.gentxt = AsyncMock(side_effect=RuntimeError("provider timeout"))

            result = await ask_chatbot(payload, db=db, current_user=None)

        assert "problème technique" in result.reply
        assert result.suggestions == ["Réessayer", "Contacter le support", "Voir les FAQ"]


class TestGenerateSuggestions:
    def test_price_keywords(self):
        assert "tarifs" in " ".join(_generate_suggestions("C'est quel tarif ?")).lower()

    def test_active_ride_suggestions_when_no_keyword_matches(self):
        assert _generate_suggestions("merci beaucoup", has_active_ride=True) == [
            "Où en est ma course ?", "Annuler ma course", "Frais d'annulation"
        ]

    def test_default_suggestions_without_active_ride(self):
        assert _generate_suggestions("merci beaucoup", has_active_ride=False) == [
            "Commander une course", "Mon portefeuille", "Aide"
        ]
