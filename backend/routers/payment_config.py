"""Indicateur de configuration des paiements EDEN VTC.

Tant qu'aucune clé d'API de paiement réelle (Orange Money / MTN MoMo) n'est
configurée côté serveur, l'environnement reste en mode test : les rechargements
et régularisations de dette sont simulés et aucun montant n'est réellement
débité.

Le mode réel n'est activé que si les deux conditions sont réunies :
  1. PAYMENT_LIVE_MODE=true
  2. au moins un fournisseur de paiement possède des identifiants complets

Cela évite d'annoncer un mode réel alors que l'intégration n'est pas branchée.
"""

import logging
import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/payment", tags=["payment-config"])
logger = logging.getLogger(__name__)

# Identifiants attendus par fournisseur. Un fournisseur est considéré comme
# configuré uniquement si TOUTES ses variables sont renseignées.
PROVIDER_ENV_KEYS: dict[str, tuple[str, ...]] = {
    "orange_money": (
        "ORANGE_MONEY_CLIENT_ID",
        "ORANGE_MONEY_CLIENT_SECRET",
        "ORANGE_MONEY_MERCHANT_ID",
    ),
    "mtn_momo": (
        "MTN_MOMO_SUBSCRIPTION_KEY",
        "MTN_MOMO_API_USER",
        "MTN_MOMO_API_KEY",
    ),
}


class PaymentProviderStatus(BaseModel):
    provider: str
    label: str
    configured: bool
    missing_keys: list[str]


class PaymentConfigResponse(BaseModel):
    live_mode: bool
    live_mode_requested: bool
    mode: str
    test_notice: str
    providers: list[PaymentProviderStatus]


PROVIDER_LABELS = {
    "orange_money": "Orange Money",
    "mtn_momo": "MTN MoMo",
}

TEST_NOTICE = (
    "Mode test — aucun paiement réel n'est débité. Les rechargements et "
    "régularisations de dette sont simulés en attendant l'activation de "
    "l'API Orange Money / MTN MoMo."
)

LIVE_NOTICE = "Mode réel — les paiements sont réellement débités."


def _env_flag(name: str) -> bool:
    """Lit un drapeau booléen depuis l'environnement."""
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _provider_status(provider: str, env_keys: tuple[str, ...]) -> PaymentProviderStatus:
    """Évalue la complétude des identifiants d'un fournisseur de paiement."""
    missing = [key for key in env_keys if not os.environ.get(key, "").strip()]
    return PaymentProviderStatus(
        provider=provider,
        label=PROVIDER_LABELS.get(provider, provider),
        configured=not missing,
        missing_keys=missing,
    )


def payment_live_mode() -> bool:
    """Indique si l'environnement peut réellement débiter un paiement."""
    if not _env_flag("PAYMENT_LIVE_MODE"):
        return False
    return any(
        _provider_status(provider, env_keys).configured
        for provider, env_keys in PROVIDER_ENV_KEYS.items()
    )


@router.get("/config", response_model=PaymentConfigResponse)
async def get_payment_config() -> PaymentConfigResponse:
    """Expose l'état de configuration des paiements (test ou réel).

    Aucune valeur secrète n'est renvoyée : uniquement les noms des variables
    manquantes, afin de diagnostiquer la configuration en un coup d'œil.
    """
    providers = [
        _provider_status(provider, env_keys) for provider, env_keys in PROVIDER_ENV_KEYS.items()
    ]
    live_requested = _env_flag("PAYMENT_LIVE_MODE")
    live = live_requested and any(p.configured for p in providers)

    if live_requested and not live:
        logger.warning(
            "PAYMENT_LIVE_MODE est activé mais aucun fournisseur de paiement n'est "
            "complètement configuré : l'application reste en mode test."
        )

    return PaymentConfigResponse(
        live_mode=live,
        live_mode_requested=live_requested,
        mode="live" if live else "test",
        test_notice=LIVE_NOTICE if live else TEST_NOTICE,
        providers=providers,
    )