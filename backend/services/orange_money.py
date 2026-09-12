"""
Client Orange Money Cameroun — API Merchant Payment (OMAPI).

Documentation de référence : "Orange Cameroun API — Documentation de référence"
et "Guide Utilisateur OMAPI - SANDBOX". Base URL unique pour tous les
endpoints ; le flux complet (token -> init -> pay -> paymentstatus) est
séquentiel et le payToken généré à l'étape "init" relie toutes les étapes
suivantes.

Ce module ne touche jamais la base de données : il se contente d'appeler
l'API Orange et de renvoyer des données normalisées. Le crédit du portefeuille
et la persistance des tentatives de paiement sont gérés par
`routers/orange_money_payment.py`, qui est seul responsable de ne créditer un
portefeuille qu'une fois la transaction confirmée par Orange (jamais sur la
foi d'une valeur envoyée par le client).
"""

import asyncio
import base64
import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Identifiants requis pour considérer Orange Money comme "configuré". Repris
# tel quel par routers/payment_config.py pour l'indicateur live/test.
REQUIRED_ENV_KEYS = (
    "ORANGE_MONEY_CLIENT_ID",
    "ORANGE_MONEY_CLIENT_SECRET",
    "ORANGE_MONEY_X_AUTH_TOKEN",
    "ORANGE_MONEY_MERCHANT_MSISDN",
    "ORANGE_MONEY_MERCHANT_PIN",
)

DEFAULT_BASE_URL = "https://api-s1.orange.cm"
MP_INIT_PATH = "/omcoreapis/1.0.2/mp/init"
MP_PAY_PATH = "/omcoreapis/1.0.2/mp/pay"
MP_STATUS_PATH = "/omcoreapis/1.0.2/mp/paymentstatus/{pay_token}"
MP_PUSH_PATH = "/omcoreapis/1.0.2/mp/push/{pay_token}"

# Marge de sécurité avant expiration réelle du token (secondes) pour éviter
# d'utiliser un access_token expiré pile au moment de l'appel suivant.
TOKEN_EXPIRY_MARGIN_SECONDS = 30

STATUS_PENDING = "PENDING"
STATUS_SUCCESSFUL = "SUCCESSFULL"  # orthographe exacte renvoyée par l'API Orange
STATUS_FAILED = "FAILED"


class OrangeMoneyError(Exception):
    """Erreur lors d'un appel à l'API Orange Money."""

    def __init__(self, message: str, *, status_code: int = 502, orange_status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.orange_status = orange_status


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def is_configured() -> bool:
    """Vrai si toutes les variables d'environnement Orange Money sont renseignées."""
    return all(_env(key) for key in REQUIRED_ENV_KEYS)


def missing_config_keys() -> list[str]:
    return [key for key in REQUIRED_ENV_KEYS if not _env(key)]


def _base_url() -> str:
    return _env("ORANGE_MONEY_BASE_URL") or DEFAULT_BASE_URL


def to_local_msisdn(e164_phone: str) -> str:
    """Convertit un numéro E.164 (+237690123456) au format local attendu par
    OMAPI (690123456, sans indicatif pays)."""
    digits = "".join(ch for ch in e164_phone if ch.isdigit())
    if digits.startswith("237") and len(digits) > 9:
        digits = digits[3:]
    return digits


# --- Cache de l'access_token (partagé par tout le process) ------------------
#
# Un seul access_token est nécessaire pour tout le service à un instant donné
# (credentials applicatifs, pas par utilisateur) : on le met en cache pour
# éviter de repasser par /token à chaque paiement, et on protège son
# renouvellement par un verrou pour éviter des appels concurrents redondants.
_token_cache: dict[str, Any] = {"access_token": None, "expires_at": 0.0}
_token_lock = asyncio.Lock()


async def _fetch_access_token(client: httpx.AsyncClient) -> str:
    client_id = _env("ORANGE_MONEY_CLIENT_ID")
    client_secret = _env("ORANGE_MONEY_CLIENT_SECRET")
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")

    try:
        response = await client.post(
            f"{_base_url()}/token",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {basic}",
            },
            data={"grant_type": "client_credentials"},
        )
    except httpx.HTTPError as exc:
        raise OrangeMoneyError(f"Impossible de contacter Orange Money : {exc}") from exc

    if response.status_code != 200:
        # En cas d'erreur, Orange renvoie un fault XML (WSO2 CXF) et non du JSON.
        logger.error("Orange Money /token a échoué (HTTP %s): %s", response.status_code, response.text[:500])
        raise OrangeMoneyError(
            "Échec de l'authentification Orange Money.", status_code=502, orange_status=response.status_code
        )

    payload = response.json()
    access_token = payload.get("access_token")
    expires_in = payload.get("expires_in", 3600)
    if not access_token:
        raise OrangeMoneyError("Réponse Orange Money invalide : access_token manquant.")

    _token_cache["access_token"] = access_token
    _token_cache["expires_at"] = time.monotonic() + int(expires_in) - TOKEN_EXPIRY_MARGIN_SECONDS
    return access_token


async def get_access_token(client: httpx.AsyncClient, *, force_refresh: bool = False) -> str:
    """Retourne un access_token valide, en le renouvelant si nécessaire."""
    async with _token_lock:
        if not force_refresh and _token_cache["access_token"] and time.monotonic() < _token_cache["expires_at"]:
            return _token_cache["access_token"]
        return await _fetch_access_token(client)


def _auth_headers(access_token: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": _env("ORANGE_MONEY_X_AUTH_TOKEN"),
        "Authorization": f"Bearer {access_token}",
    }


async def _request_with_retry(
    client: httpx.AsyncClient, method: str, url: str, **kwargs
) -> httpx.Response:
    """Exécute une requête authentifiée ; si le token est rejeté (401), le
    renouvelle une fois puis rejoue la requête."""
    access_token = await get_access_token(client)
    headers = kwargs.pop("headers", {})
    headers.update(_auth_headers(access_token))

    try:
        response = await client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as exc:
        raise OrangeMoneyError(f"Impossible de contacter Orange Money : {exc}") from exc

    if response.status_code == 401:
        access_token = await get_access_token(client, force_refresh=True)
        headers.update(_auth_headers(access_token))
        try:
            response = await client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise OrangeMoneyError(f"Impossible de contacter Orange Money : {exc}") from exc

    return response


async def init_transaction(client: httpx.AsyncClient) -> str:
    """Étape 2 — initialise une transaction et retourne le payToken."""
    response = await _request_with_retry(client, "POST", f"{_base_url()}{MP_INIT_PATH}")

    if response.status_code != 200:
        logger.error("Orange Money mp/init a échoué (HTTP %s): %s", response.status_code, response.text[:500])
        raise OrangeMoneyError(
            "Échec de l'initialisation du paiement Orange Money.",
            status_code=502,
            orange_status=response.status_code,
        )

    payload = response.json()
    pay_token = (payload.get("data") or {}).get("payToken")
    if not pay_token:
        raise OrangeMoneyError("Réponse Orange Money invalide : payToken manquant.")
    return pay_token


async def execute_payment(
    client: httpx.AsyncClient,
    *,
    pay_token: str,
    subscriber_msisdn: str,
    amount: int,
    order_id: str,
    description: str = "Rechargement EDEN VTC",
    notif_url: Optional[str] = None,
) -> dict[str, Any]:
    """Étape 3 — déclenche le débit chez le client (subscriberMsisdn) au
    profit du marchand. Le statut renvoyé est toujours PENDING : le client
    doit confirmer sur son téléphone (push USSD/appli)."""
    body = {
        "subscriberMsisdn": subscriber_msisdn,
        "channelUserMsisdn": _env("ORANGE_MONEY_MERCHANT_MSISDN"),
        "amount": str(amount),
        "pin": _env("ORANGE_MONEY_MERCHANT_PIN"),
        "payToken": pay_token,
        "orderId": order_id,
        "description": description,
    }
    if notif_url:
        body["notifUrl"] = notif_url

    response = await _request_with_retry(client, "POST", f"{_base_url()}{MP_PAY_PATH}", json=body)

    if response.status_code == 422:
        raise OrangeMoneyError("Ce payToken a déjà été utilisé.", status_code=409, orange_status=422)

    if response.status_code != 200:
        logger.error("Orange Money mp/pay a échoué (HTTP %s): %s", response.status_code, response.text[:500])
        raise OrangeMoneyError(
            "Échec du déclenchement du paiement Orange Money.",
            status_code=502,
            orange_status=response.status_code,
        )

    payload = response.json()
    data = payload.get("data") or {}

    # Certaines erreurs métier sont renvoyées avec un HTTP 200 mais un code
    # inittxnstatus différent de "200" (ex. 0066111 = subscriberMsisdn
    # invalide, 99033 = channelUserMsisdn/initiateur invalide).
    init_status = str(data.get("inittxnstatus") or "")
    if init_status and init_status != "200":
        message = data.get("inittxnmessage") or "Paiement refusé par Orange Money."
        raise OrangeMoneyError(message, status_code=422, orange_status=int(init_status) if init_status.isdigit() else None)

    return data


async def get_payment_status(client: httpx.AsyncClient, pay_token: str) -> dict[str, Any]:
    """Étape 4 — interroge le statut courant d'une transaction."""
    url = f"{_base_url()}{MP_STATUS_PATH.format(pay_token=pay_token)}"
    response = await _request_with_retry(client, "GET", url)

    if response.status_code != 200:
        logger.error(
            "Orange Money mp/paymentstatus a échoué (HTTP %s): %s", response.status_code, response.text[:500]
        )
        raise OrangeMoneyError(
            "Échec de la vérification du statut Orange Money.",
            status_code=502,
            orange_status=response.status_code,
        )

    payload = response.json()
    return payload.get("data") or {}


async def push_payment(client: httpx.AsyncClient, pay_token: str) -> dict[str, Any]:
    """Étape 5 — relance (push USSD/SMS) un client qui n'a pas confirmé.
    Disponible uniquement en production selon la documentation Orange."""
    url = f"{_base_url()}{MP_PUSH_PATH.format(pay_token=pay_token)}"
    response = await _request_with_retry(client, "GET", url)

    if response.status_code != 200:
        logger.error("Orange Money mp/push a échoué (HTTP %s): %s", response.status_code, response.text[:500])
        raise OrangeMoneyError(
            "Échec de la relance du paiement Orange Money.",
            status_code=502,
            orange_status=response.status_code,
        )

    payload = response.json()
    return payload.get("data") or {}
