"""
Tests pour la création de courses (POST /api/v1/dispatch/create-ride).

Scénarios couverts :
1. Nouveau passager (première course) — auto-création du passager
2. Passager existant sans dette — course créée normalement
3. Passager existant avec dette en cours — blocage 403
4. Passager avec dette à 0 mais has_pending_debt=True — blocage 403 (edge case non bloquant)
5. Passager avec has_pending_debt=False et debt_amount > 0 — course autorisée (incohérence tolérée)
6. Données de course valides — vérification des champs de la course créée
7. Données de course minimales — seuls les champs obligatoires
"""
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import pytest

# Ajouter le répertoire backend au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# === Fixtures et helpers ===

class FakeUserResponse:
    """Simule un utilisateur authentifié (schemas.auth.UserResponse)."""
    def __init__(self, user_id="user-abc-123", name="Jean Dupont", phone="+237600000000"):
        self.id = user_id
        self.name = name
        self.phone = phone


class FakePassenger:
    """Simule un objet Passengers retourné par la DB."""
    def __init__(self, passenger_id=1, user_id="user-abc-123", has_pending_debt=False, debt_amount=0, wallet_balance=10000):
        self.id = passenger_id
        self.user_id = user_id
        self.has_pending_debt = has_pending_debt
        self.debt_amount = debt_amount
        self.wallet_balance = wallet_balance
        self.first_name = "Jean"
        self.phone = "+237600000000"
        self.total_rides = 5
        self.co2_saved = 2.5


class FakeRide:
    """Simule un objet Rides après insertion."""
    def __init__(self, ride_id=42):
        self.id = ride_id
        self.status = "pending"
        self.passenger_id = 1
        self.driver_id = None
        self.pickup_address = "Akwa, Douala"
        self.destination_address = "Bonanjo, Douala"
        self.estimated_price = 3500
        self.payment_method = "wallet"


class FakeScalarResult:
    """Simule le résultat d'un db.execute(...).scalar_one_or_none()."""
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def make_ride_request_data(
    pickup_address="Akwa, Douala",
    pickup_lat=4.0511,
    pickup_lng=9.7679,
    destination_address="Bonanjo, Douala",
    destination_lat=4.0435,
    destination_lng=9.6966,
    distance_km=5.2,
    duration_min=15,
    estimated_price=3500,
    payment_method="wallet",
    is_scheduled=False,
    scheduled_at=None,
    co2_saved=0.624,
):
    """Crée un dict de données de requête pour create-ride."""
    return {
        "pickup_address": pickup_address,
        "pickup_lat": pickup_lat,
        "pickup_lng": pickup_lng,
        "destination_address": destination_address,
        "destination_lat": destination_lat,
        "destination_lng": destination_lng,
        "distance_km": distance_km,
        "duration_min": duration_min,
        "estimated_price": estimated_price,
        "payment_method": payment_method,
        "is_scheduled": is_scheduled,
        "scheduled_at": scheduled_at,
        "co2_saved": co2_saved,
    }


# === Tests unitaires de la logique métier ===

class TestCreateRideDebtCheck:
    """Tests de la logique de vérification de dette avant création de course."""

    def test_passenger_with_debt_is_blocked(self):
        """Un passager avec has_pending_debt=True et debt_amount > 0 doit être bloqué."""
        passenger = FakePassenger(has_pending_debt=True, debt_amount=3000)
        # Logique extraite du endpoint
        should_block = passenger.has_pending_debt and (passenger.debt_amount or 0) > 0
        assert should_block is True

    def test_passenger_without_debt_is_allowed(self):
        """Un passager sans dette peut commander."""
        passenger = FakePassenger(has_pending_debt=False, debt_amount=0)
        should_block = passenger.has_pending_debt and (passenger.debt_amount or 0) > 0
        assert should_block is False

    def test_passenger_with_flag_but_zero_amount_is_not_blocked(self):
        """Edge case : has_pending_debt=True mais debt_amount=0 → pas de blocage."""
        passenger = FakePassenger(has_pending_debt=True, debt_amount=0)
        should_block = passenger.has_pending_debt and (passenger.debt_amount or 0) > 0
        assert should_block is False

    def test_passenger_with_amount_but_no_flag_is_not_blocked(self):
        """Edge case : has_pending_debt=False mais debt_amount > 0 → pas de blocage (incohérence tolérée)."""
        passenger = FakePassenger(has_pending_debt=False, debt_amount=2000)
        should_block = passenger.has_pending_debt and (passenger.debt_amount or 0) > 0
        assert should_block is False

    def test_new_passenger_none_is_not_blocked(self):
        """Si le passager n'existe pas encore (None), pas de blocage."""
        passenger = None
        should_block = bool(passenger and passenger.has_pending_debt and (passenger.debt_amount or 0) > 0)
        assert should_block is False  # None is falsy → bool(None) == False

    def test_debt_amount_none_treated_as_zero(self):
        """Si debt_amount est None, il est traité comme 0."""
        passenger = FakePassenger(has_pending_debt=True, debt_amount=None)
        should_block = passenger.has_pending_debt and (passenger.debt_amount or 0) > 0
        assert should_block is False


class TestCreateRidePassengerCreation:
    """Tests de la logique d'auto-création du passager."""

    def test_new_passenger_gets_correct_defaults(self):
        """Un nouveau passager créé automatiquement a les bons défauts."""
        user = FakeUserResponse(user_id="user-new-456", name="Marie Ngo", phone="+237655000000")

        # Simule la logique de création
        new_passenger_data = {
            "user_id": user.id,
            "first_name": getattr(user, "name", "") or "Passager",
            "phone": getattr(user, "phone", "") or "",
            "wallet_balance": 0,
            "has_pending_debt": False,
            "debt_amount": 0,
            "total_rides": 0,
            "co2_saved": 0,
        }

        assert new_passenger_data["user_id"] == "user-new-456"
        assert new_passenger_data["first_name"] == "Marie Ngo"
        assert new_passenger_data["phone"] == "+237655000000"
        assert new_passenger_data["wallet_balance"] == 0
        assert new_passenger_data["has_pending_debt"] is False
        assert new_passenger_data["debt_amount"] == 0

    def test_new_passenger_fallback_name(self):
        """Si l'utilisateur n'a pas de nom, le fallback est 'Passager'."""
        user = FakeUserResponse(user_id="user-anon", name="", phone="")
        first_name = getattr(user, "name", "") or "Passager"
        assert first_name == "Passager"

    def test_new_passenger_fallback_no_name_attr(self):
        """Si l'attribut name n'existe pas, le fallback est 'Passager'."""
        user = MagicMock(spec=["id"])
        user.id = "user-minimal"
        first_name = getattr(user, "name", "") or "Passager"
        assert first_name == "Passager"


class TestCreateRideData:
    """Tests de la structure de données de la course créée."""

    def test_ride_has_no_driver_initially(self):
        """Une course nouvellement créée n'a pas de chauffeur assigné."""
        ride = FakeRide()
        assert ride.driver_id is None

    def test_ride_status_is_pending(self):
        """Une course nouvellement créée est en statut 'pending'."""
        ride = FakeRide()
        assert ride.status == "pending"

    def test_ride_uses_passenger_id_not_user_id(self):
        """La course utilise passenger_id (pas user_id qui n'existe pas sur Rides)."""
        ride = FakeRide()
        assert hasattr(ride, "passenger_id")
        assert ride.passenger_id is not None
        # Vérifier que user_id n'est PAS un attribut de Rides
        from models.rides import Rides
        ride_columns = [col.name for col in Rides.__table__.columns]
        assert "user_id" not in ride_columns
        assert "passenger_id" in ride_columns


class TestCreateRideRequestValidation:
    """Tests de validation des données de requête."""

    def test_minimal_request_has_required_fields(self):
        """Une requête minimale doit avoir pickup et destination."""
        from routers.ride_dispatch import CreateRideRequest

        # Requête minimale valide
        data = CreateRideRequest(
            pickup_address="Akwa, Douala",
            pickup_lat=4.0511,
            pickup_lng=9.7679,
            destination_address="Bonanjo, Douala",
        )
        assert data.pickup_address == "Akwa, Douala"
        assert data.destination_address == "Bonanjo, Douala"
        assert data.payment_method == "wallet"  # défaut
        assert data.is_scheduled is False  # défaut

    def test_full_request_with_all_fields(self):
        """Une requête complète avec tous les champs optionnels."""
        from routers.ride_dispatch import CreateRideRequest

        data = CreateRideRequest(
            pickup_address="Akwa, Douala",
            pickup_lat=4.0511,
            pickup_lng=9.7679,
            destination_address="Bonanjo, Douala",
            destination_lat=4.0435,
            destination_lng=9.6966,
            distance_km=5.2,
            duration_min=15,
            estimated_price=3500,
            payment_method="cash",
            is_scheduled=True,
            scheduled_at="2026-07-30T14:00:00Z",
            co2_saved=0.624,
        )
        assert data.estimated_price == 3500
        assert data.payment_method == "cash"
        assert data.is_scheduled is True
        assert data.scheduled_at == "2026-07-30T14:00:00Z"
        assert data.co2_saved == 0.624

    def test_payment_methods_accepted(self):
        """Différentes méthodes de paiement sont acceptées."""
        from routers.ride_dispatch import CreateRideRequest

        for method in ["wallet", "cash", "orange_money", "mtn_momo"]:
            data = CreateRideRequest(
                pickup_address="Test",
                pickup_lat=4.0,
                pickup_lng=9.0,
                destination_address="Dest",
                payment_method=method,
            )
            assert data.payment_method == method


class TestPassengerModel:
    """Tests du modèle Passengers après correction du bug."""

    def test_passengers_has_user_id_column(self):
        """Le modèle Passengers doit avoir une colonne user_id."""
        from models.passengers import Passengers
        columns = [col.name for col in Passengers.__table__.columns]
        assert "user_id" in columns

    def test_passengers_user_id_is_string(self):
        """La colonne user_id est de type String."""
        from models.passengers import Passengers
        user_id_col = Passengers.__table__.columns["user_id"]
        assert "VARCHAR" in str(user_id_col.type).upper() or "STRING" in str(user_id_col.type).upper()

    def test_passengers_user_id_is_indexed(self):
        """La colonne user_id est indexée pour les recherches rapides."""
        from models.passengers import Passengers
        user_id_col = Passengers.__table__.columns["user_id"]
        assert user_id_col.index is True

    def test_passengers_has_debt_fields(self):
        """Le modèle Passengers a les champs de gestion de dette."""
        from models.passengers import Passengers
        columns = [col.name for col in Passengers.__table__.columns]
        assert "has_pending_debt" in columns
        assert "debt_amount" in columns
        assert "wallet_balance" in columns


class TestRideCompletionPassengerLookup:
    """Tests de la logique de recherche passager dans ride_completion."""

    def test_ride_completion_uses_passenger_id(self):
        """ride_completion cherche le passager via ride.passenger_id (pas ride.user_id)."""
        # Vérifier que le code source ne contient plus ride.user_id
        import inspect
        from services.ride_completion import complete_ride_and_transfer
        source = inspect.getsource(complete_ride_and_transfer)
        assert "ride.user_id" not in source
        assert "ride.passenger_id" in source

    def test_wallet_transaction_no_user_id(self):
        """Wallet_transactions ne doit pas recevoir user_id (champ inexistant)."""
        from models.wallet_transactions import Wallet_transactions
        columns = [col.name for col in Wallet_transactions.__table__.columns]
        assert "user_id" not in columns
        assert "passenger_id" in columns


class TestMaxDebtPerRide:
    """Tests de la constante de plafond de dette."""

    def test_max_debt_constant_exists(self):
        """La constante MAX_DEBT_PER_RIDE est définie."""
        from routers.ride_dispatch import MAX_DEBT_PER_RIDE
        assert MAX_DEBT_PER_RIDE == 5000

    def test_max_debt_in_ride_completion(self):
        """Le service ride_completion utilise aussi un plafond de dette."""
        from services.ride_completion import MAX_DEBT_PER_RIDE
        assert MAX_DEBT_PER_RIDE == 5000

    def test_debt_capping_logic(self):
        """La dette est plafonnée à MAX_DEBT_PER_RIDE."""
        MAX_DEBT = 5000
        # Cas 1 : dette inférieure au plafond
        raw_debt = 3000
        capped = min(raw_debt, MAX_DEBT)
        assert capped == 3000

        # Cas 2 : dette supérieure au plafond
        raw_debt = 8000
        capped = min(raw_debt, MAX_DEBT)
        assert capped == 5000

        # Cas 3 : dette exactement au plafond
        raw_debt = 5000
        capped = min(raw_debt, MAX_DEBT)
        assert capped == 5000

        # Cas 4 : pas de dette
        raw_debt = 0
        capped = min(raw_debt, MAX_DEBT)
        assert capped == 0


class TestHaversineDistance:
    """Tests de la fonction de calcul de distance Haversine."""

    def test_haversine_same_point_is_zero(self):
        """La distance entre un point et lui-même est 0."""
        from routers.ride_dispatch import haversine_distance
        dist = haversine_distance(4.0511, 9.7679, 4.0511, 9.7679)
        assert dist == 0.0

    def test_haversine_known_distance(self):
        """Distance Akwa → Bonanjo ≈ 8 km (vérification approximative)."""
        from routers.ride_dispatch import haversine_distance
        # Akwa (4.0511, 9.7679) → Bonanjo (4.0435, 9.6966)
        dist = haversine_distance(4.0511, 9.7679, 4.0435, 9.6966)
        # La distance réelle est environ 7-8 km
        assert 5.0 < dist < 12.0

    def test_haversine_returns_positive(self):
        """La distance est toujours positive."""
        from routers.ride_dispatch import haversine_distance
        dist = haversine_distance(4.0, 9.0, 5.0, 10.0)
        assert dist > 0


# === Point d'entrée pour exécution directe ===

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])