"""
Tests pour l'intégration Orange Money (OMAPI Merchant Payment).

Scénarios couverts :
1. services/orange_money.py : cycle complet token -> init -> pay -> status,
   mise en cache/renouvellement de l'access_token, gestion des erreurs
   (échec HTTP, payToken déjà utilisé, erreurs métier renvoyées en HTTP 200,
   token expiré/401 avec retry automatique).
2. routers/orange_money_payment.py : conversion de numéro, garde-fous
   PAYMENT_LIVE_MODE / configuration manquante, et surtout la logique de
   crédit du portefeuille (idempotence, imputation sur la dette) exécutée
   directement via _apply_confirmed_result (le vrai code, pas une
   réécriture de la logique dans le test).
"""
import sys
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import orange_money  # noqa: E402
from routers import orange_money_payment as omp  # noqa: E402


# === Fixtures et doublures ===

class FakeResponse:
    """Simule une httpx.Response minimale (seuls .status_code/.json()/.text sont utilisés)."""

    def __init__(self, status_code, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.text = text or str(self._json)

    def json(self):
        return self._json


class FakeAsyncClient:
    """Simule httpx.AsyncClient : .post() et .request() renvoient les
    réponses passées en séquence (une par appel, dans l'ordre)."""

    def __init__(self, post_responses=None, request_responses=None):
        self.post = AsyncMock(side_effect=post_responses or [])
        self.request = AsyncMock(side_effect=request_responses or [])


class FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeUpdateResult:
    """Simule le résultat d'un db.execute(update(...)) : seul .rowcount est utilisé."""

    def __init__(self, rowcount=1):
        self.rowcount = rowcount


class FakeDb:
    """Simule une AsyncSession : execute() renvoie une valeur préconfigurée,
    add()/commit()/refresh() sont enregistrés sans effet réel."""

    def __init__(self, execute_results=None):
        self._execute_results = list(execute_results or [])
        self.added = []
        self.committed = 0

    async def execute(self, *_args, **_kwargs):
        return self._execute_results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1

    async def rollback(self):
        pass

    async def refresh(self, _obj):
        pass


class FakePassenger:
    def __init__(self, passenger_id=1, wallet_balance=0, has_pending_debt=False, debt_amount=0, phone="+237690123456"):
        self.id = passenger_id
        self.wallet_balance = wallet_balance
        self.has_pending_debt = has_pending_debt
        self.debt_amount = debt_amount
        self.phone = phone


class FakePayment:
    def __init__(self, passenger_id=1, amount=5000, pay_token="MP_TEST_TOKEN", order_id="EDENVTC-TEST1", status="pending", credited=False, payment_id=1):
        self.id = payment_id
        self.passenger_id = passenger_id
        self.amount = amount
        self.pay_token = pay_token
        self.order_id = order_id
        self.status = status
        self.credited = credited
        self.provider_txn_id = None
        self.failure_reason = None


@pytest.fixture(autouse=True)
def reset_token_cache():
    """Le cache d'access_token est un état module-level partagé : on le vide
    avant et après chaque test pour éviter toute fuite entre tests."""
    orange_money._token_cache["access_token"] = None
    orange_money._token_cache["expires_at"] = 0.0
    yield
    orange_money._token_cache["access_token"] = None
    orange_money._token_cache["expires_at"] = 0.0


@pytest.fixture
def orange_money_env(monkeypatch):
    monkeypatch.setenv("ORANGE_MONEY_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("ORANGE_MONEY_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("ORANGE_MONEY_X_AUTH_TOKEN", "test-x-auth-token")
    monkeypatch.setenv("ORANGE_MONEY_MERCHANT_MSISDN", "691301143")
    monkeypatch.setenv("ORANGE_MONEY_MERCHANT_PIN", "2222")


TOKEN_SUCCESS = FakeResponse(200, {"access_token": "abc123", "token_type": "Bearer", "expires_in": 3600})


# === services/orange_money.py ===

class TestAccessToken:
    @pytest.mark.asyncio
    async def test_get_access_token_success(self, orange_money_env):
        client = FakeAsyncClient(post_responses=[TOKEN_SUCCESS])
        token = await orange_money.get_access_token(client)
        assert token == "abc123"
        client.post.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_access_token_is_cached(self, orange_money_env):
        client = FakeAsyncClient(post_responses=[TOKEN_SUCCESS])
        token1 = await orange_money.get_access_token(client)
        token2 = await orange_money.get_access_token(client)
        assert token1 == token2 == "abc123"
        # Un seul appel HTTP réel : le second a été servi depuis le cache.
        client.post.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_access_token_http_failure_raises(self, orange_money_env):
        client = FakeAsyncClient(post_responses=[FakeResponse(401, text="<xml fault/>")])
        with pytest.raises(orange_money.OrangeMoneyError):
            await orange_money.get_access_token(client)

    @pytest.mark.asyncio
    async def test_get_access_token_missing_field_raises(self, orange_money_env):
        client = FakeAsyncClient(post_responses=[FakeResponse(200, {"scope": "x"})])
        with pytest.raises(orange_money.OrangeMoneyError):
            await orange_money.get_access_token(client)


class TestInitTransaction:
    @pytest.mark.asyncio
    async def test_init_success_returns_pay_token(self, orange_money_env):
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS],
            request_responses=[
                FakeResponse(200, {"message": "ok", "data": {"payToken": "MP26060394A570E07E6C7185823B"}})
            ],
        )
        pay_token = await orange_money.init_transaction(client)
        assert pay_token == "MP26060394A570E07E6C7185823B"

    @pytest.mark.asyncio
    async def test_init_missing_pay_token_raises(self, orange_money_env):
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS],
            request_responses=[FakeResponse(200, {"message": "ok", "data": {}})],
        )
        with pytest.raises(orange_money.OrangeMoneyError):
            await orange_money.init_transaction(client)

    @pytest.mark.asyncio
    async def test_init_401_missing_xauth_raises(self, orange_money_env):
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS, TOKEN_SUCCESS],
            request_responses=[FakeResponse(401, {"status": 401}), FakeResponse(401, {"status": 401})],
        )
        with pytest.raises(orange_money.OrangeMoneyError):
            await orange_money.init_transaction(client)


class TestExecutePayment:
    @pytest.mark.asyncio
    async def test_pay_success_is_pending(self, orange_money_env):
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS],
            request_responses=[
                FakeResponse(
                    200,
                    {
                        "message": "Merchant payment successfully initiated",
                        "data": {
                            "id": 244548967,
                            "status": "PENDING",
                            "txnid": "MP260603.1445.A77929",
                            "inittxnstatus": "200",
                        },
                    },
                )
            ],
        )
        result = await orange_money.execute_payment(
            client,
            pay_token="MP_TOKEN",
            subscriber_msisdn="690123456",
            amount=5000,
            order_id="EDENVTC-1",
        )
        assert result["status"] == "PENDING"
        assert result["txnid"] == "MP260603.1445.A77929"

    @pytest.mark.asyncio
    async def test_pay_reused_paytoken_raises_409(self, orange_money_env):
        client = FakeAsyncClient(post_responses=[TOKEN_SUCCESS], request_responses=[FakeResponse(422, {})])
        with pytest.raises(orange_money.OrangeMoneyError) as exc_info:
            await orange_money.execute_payment(
                client, pay_token="MP_TOKEN", subscriber_msisdn="690123456", amount=5000, order_id="EDENVTC-1"
            )
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_pay_business_error_invalid_subscriber_raises(self, orange_money_env):
        """HTTP 200 mais inittxnstatus=0066111 (subscriberMsisdn invalide) doit être traité comme un échec."""
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS],
            request_responses=[
                FakeResponse(
                    200,
                    {"data": {"inittxnstatus": "0066111", "inittxnmessage": "Invalid subscriber number"}},
                )
            ],
        )
        with pytest.raises(orange_money.OrangeMoneyError) as exc_info:
            await orange_money.execute_payment(
                client, pay_token="MP_TOKEN", subscriber_msisdn="bad", amount=5000, order_id="EDENVTC-1"
            )
        assert "Invalid subscriber" in exc_info.value.message


class TestPaymentStatus:
    @pytest.mark.asyncio
    async def test_status_successful(self, orange_money_env):
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS],
            request_responses=[FakeResponse(200, {"data": {"status": "SUCCESSFULL", "txnid": "T1"}})],
        )
        data = await orange_money.get_payment_status(client, "MP_TOKEN")
        assert data["status"] == "SUCCESSFULL"

    @pytest.mark.asyncio
    async def test_401_triggers_single_token_refresh_then_succeeds(self, orange_money_env):
        """Un 401 sur un appel authentifié doit déclencher un seul
        renouvellement de token puis rejouer la requête avec succès."""
        client = FakeAsyncClient(
            post_responses=[TOKEN_SUCCESS, FakeResponse(200, {"access_token": "new-token", "expires_in": 3600})],
            request_responses=[FakeResponse(401, {}), FakeResponse(200, {"data": {"status": "PENDING"}})],
        )
        data = await orange_money.get_payment_status(client, "MP_TOKEN")
        assert data["status"] == "PENDING"
        assert client.post.await_count == 2  # token initial + renouvellement après le 401
        assert client.request.await_count == 2  # tentative initiale + rejeu


class TestPhoneNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("+237690123456", "690123456"),
            ("237690123456", "690123456"),
            ("690123456", "690123456"),
            ("+237 69 01 23 456", "690123456"),
        ],
    )
    def test_to_local_msisdn(self, raw, expected):
        assert orange_money.to_local_msisdn(raw) == expected


class TestConfiguration:
    def test_not_configured_when_env_missing(self, monkeypatch):
        for key in orange_money.REQUIRED_ENV_KEYS:
            monkeypatch.delenv(key, raising=False)
        assert orange_money.is_configured() is False
        assert set(orange_money.missing_config_keys()) == set(orange_money.REQUIRED_ENV_KEYS)

    def test_configured_when_all_env_present(self, orange_money_env):
        assert orange_money.is_configured() is True
        assert orange_money.missing_config_keys() == []


# === routers/orange_money_payment.py ===

class TestEnsureLiveAndConfigured:
    def test_raises_503_when_live_mode_off(self, monkeypatch, orange_money_env):
        monkeypatch.setenv("PAYMENT_LIVE_MODE", "false")
        with pytest.raises(Exception) as exc_info:
            omp._ensure_live_and_configured()
        assert exc_info.value.status_code == 503

    def test_raises_503_when_not_configured(self, monkeypatch):
        monkeypatch.setenv("PAYMENT_LIVE_MODE", "true")
        for key in orange_money.REQUIRED_ENV_KEYS:
            monkeypatch.delenv(key, raising=False)
        with pytest.raises(Exception) as exc_info:
            omp._ensure_live_and_configured()
        assert exc_info.value.status_code == 503

    def test_passes_when_live_and_configured(self, monkeypatch, orange_money_env):
        monkeypatch.setenv("PAYMENT_LIVE_MODE", "true")
        omp._ensure_live_and_configured()  # ne doit pas lever


class TestApplyConfirmedResult:
    """Le cœur de la sécurité du crédit de portefeuille : ne créditer
    qu'une fois, imputer la dette avant le solde, tracer la transaction."""

    @pytest.mark.asyncio
    async def test_credits_full_amount_when_no_debt(self):
        passenger = FakePassenger(wallet_balance=1000, has_pending_debt=False, debt_amount=0)
        payment = FakePayment(amount=5000)
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=1), FakeScalarResult(passenger)])

        new_balance = await omp._apply_confirmed_result(db, payment, provider_txn_id="TXN1")

        assert new_balance == 6000
        assert passenger.wallet_balance == 6000
        assert payment.status == "successful"
        assert payment.credited is True
        assert payment.provider_txn_id == "TXN1"
        assert db.committed == 1
        # Une ligne wallet_transactions de type topup a bien été journalisée.
        assert len(db.added) == 1
        assert db.added[0].type == "topup"
        assert db.added[0].amount == 5000
        assert db.added[0].reference == payment.pay_token

    @pytest.mark.asyncio
    async def test_topup_clears_debt_smaller_than_amount(self):
        """Rechargement de 5000 avec une dette de 2000 : la dette est
        épongée en premier, le reste (3000) crédite le solde."""
        passenger = FakePassenger(wallet_balance=0, has_pending_debt=True, debt_amount=2000)
        payment = FakePayment(amount=5000)
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=1), FakeScalarResult(passenger)])

        new_balance = await omp._apply_confirmed_result(db, payment, provider_txn_id="TXN2")

        assert new_balance == 3000
        assert passenger.debt_amount == 0
        assert passenger.has_pending_debt is False

    @pytest.mark.asyncio
    async def test_topup_smaller_than_debt_reduces_debt_only(self):
        """Rechargement de 1000 avec une dette de 5000 : le solde reste à 0,
        la dette est réduite d'autant, has_pending_debt reste vrai."""
        passenger = FakePassenger(wallet_balance=0, has_pending_debt=True, debt_amount=5000)
        payment = FakePayment(amount=1000)
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=1), FakeScalarResult(passenger)])

        new_balance = await omp._apply_confirmed_result(db, payment, provider_txn_id="TXN3")

        assert new_balance == 0
        assert passenger.wallet_balance == 0
        assert passenger.debt_amount == 4000
        assert passenger.has_pending_debt is True

    @pytest.mark.asyncio
    async def test_missing_passenger_does_not_crash(self):
        """Passager introuvable (cas limite) : ne doit pas lever, marque le
        paiement traité sans crédit fantôme."""
        payment = FakePayment(amount=5000)
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=1), FakeScalarResult(None)])

        new_balance = await omp._apply_confirmed_result(db, payment, provider_txn_id="TXN4")

        assert new_balance == 0
        assert payment.status == "successful"
        assert db.added == []  # aucune transaction fantôme créée

    @pytest.mark.asyncio
    async def test_losing_the_atomic_claim_credits_nothing(self):
        """Si un appel concurrent (webhook vs polling) a déjà remporté la
        réclamation (`credited` passé à True entre-temps), rowcount=0 : ne
        doit surtout pas créditer une seconde fois."""
        passenger = FakePassenger(wallet_balance=1000)
        payment = FakePayment(amount=5000)
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=0)])

        new_balance = await omp._apply_confirmed_result(db, payment, provider_txn_id="TXN-RACE")

        assert new_balance == 0
        assert passenger.wallet_balance == 1000  # inchangé
        assert db.added == []  # aucune transaction créée par le perdant de la course


class TestWebhookIdempotency:
    """Un même paiement SUCCESSFULL ne doit être crédité qu'une seule fois,
    que la confirmation arrive par polling ou par webhook."""

    @pytest.mark.asyncio
    async def test_webhook_skips_already_credited_payment(self):
        payment = FakePayment(amount=5000, status="successful", credited=True)
        db = FakeDb(execute_results=[FakeScalarResult(payment)])

        callback = omp.OrangeMoneyCallback(payToken=payment.pay_token, status="SUCCESSFULL", txnid="TXN5")
        result = await omp.orange_money_webhook(callback, db)

        assert result == {"received": True}
        assert db.added == []  # pas de second crédit
        assert db.committed == 0

    @pytest.mark.asyncio
    async def test_webhook_unknown_pay_token_is_ignored_safely(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        callback = omp.OrangeMoneyCallback(payToken="unknown", status="SUCCESSFULL", txnid="TXN6")

        result = await omp.orange_money_webhook(callback, db)

        assert result == {"received": True}
        assert db.added == []
