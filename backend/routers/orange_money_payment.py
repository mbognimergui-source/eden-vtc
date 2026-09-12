# @File: backend/routers/orange_money_payment.py
# @Desc: Rechargement de portefeuille via Orange Money (OMAPI Merchant Payment)
"""
Paiement réel du portefeuille passager via Orange Money.

Règle de sécurité, identique à `services/pricing.py` pour les courses : le
portefeuille n'est JAMAIS crédité sur la foi d'une valeur envoyée par le
client. Il n'est crédité que lorsque Orange Money confirme lui-même la
transaction (statut "SUCCESSFULL"), via le polling de statut ou le webhook
`notifUrl`. Le flag `credited` sur `Orange_money_payments` garantit qu'un
paiement confirmé ne crédite le portefeuille qu'une seule fois.

Tant que `PAYMENT_LIVE_MODE` n'est pas activé et Orange Money configuré (cf.
`routers/payment_config.py`), ces endpoints refusent la requête : le
rechargement simulé côté frontend (mode démo) reste inchangé.
"""

import logging
import os
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.orange_money_payments import Orange_money_payments
from models.passengers import Passengers
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services import orange_money

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments/orange-money", tags=["orange-money-payment"])

MIN_TOPUP_AMOUNT = 500
MAX_TOPUP_AMOUNT = 500_000


class TopupRequest(BaseModel):
    amount: int = Field(..., gt=0)


class TopupResponse(BaseModel):
    order_id: str
    pay_token: str
    status: str
    message: str


class PaymentStatusResponse(BaseModel):
    order_id: str
    status: str
    amount: int
    credited: bool
    new_balance: Optional[int] = None
    failure_reason: Optional[str] = None


class OrangeMoneyCallback(BaseModel):
    payToken: str
    status: str
    message: Optional[str] = None
    txnid: Optional[str] = None


def _ensure_live_and_configured() -> None:
    """Refuse la requête tant que PAYMENT_LIVE_MODE + Orange Money ne sont pas
    tous les deux opérationnels — cf. routers/payment_config.py."""
    live_requested = os.environ.get("PAYMENT_LIVE_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
    if not live_requested:
        raise HTTPException(
            status_code=503,
            detail="Le paiement réel n'est pas activé (PAYMENT_LIVE_MODE). Utilisez le rechargement simulé.",
        )
    if not orange_money.is_configured():
        missing = ", ".join(orange_money.missing_config_keys())
        raise HTTPException(
            status_code=503,
            detail=f"Orange Money n'est pas complètement configuré (variables manquantes : {missing}).",
        )


async def _get_passenger(db: AsyncSession, current_user: UserResponse) -> Passengers:
    result = await db.execute(select(Passengers).where(Passengers.user_id == current_user.id))
    passenger = result.scalar_one_or_none()
    if not passenger:
        raise HTTPException(status_code=404, detail="Profil passager introuvable.")
    return passenger


@router.post("/topup", response_model=TopupResponse)
async def initiate_topup(
    data: TopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Démarre un rechargement Orange Money réel : le client recevra une
    invite (USSD/app) sur son téléphone pour confirmer le débit. Le
    portefeuille n'est crédité qu'après confirmation (voir /status et
    /webhook)."""
    _ensure_live_and_configured()

    if data.amount < MIN_TOPUP_AMOUNT or data.amount > MAX_TOPUP_AMOUNT:
        raise HTTPException(
            status_code=422,
            detail=f"Montant invalide. Doit être compris entre {MIN_TOPUP_AMOUNT} et {MAX_TOPUP_AMOUNT} FCFA.",
        )

    passenger = await _get_passenger(db, current_user)
    subscriber_msisdn = orange_money.to_local_msisdn(passenger.phone)
    if len(subscriber_msisdn) != 9:
        raise HTTPException(
            status_code=422,
            detail="Numéro de téléphone invalide pour un paiement Orange Money (format attendu : 6XXXXXXXX).",
        )

    order_id = f"EDENVTC-{uuid.uuid4().hex[:16].upper()}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            pay_token = await orange_money.init_transaction(client)
            payment_data = await orange_money.execute_payment(
                client,
                pay_token=pay_token,
                subscriber_msisdn=subscriber_msisdn,
                amount=data.amount,
                order_id=order_id,
                description="Rechargement portefeuille EDEN VTC",
            )
        except orange_money.OrangeMoneyError as exc:
            logger.error("Échec du rechargement Orange Money pour passager %s : %s", passenger.id, exc.message)
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    payment = Orange_money_payments(
        passenger_id=passenger.id,
        purpose="topup",
        order_id=order_id,
        pay_token=pay_token,
        subscriber_msisdn=subscriber_msisdn,
        amount=data.amount,
        status="pending",
        provider_txn_id=payment_data.get("txnid"),
    )
    db.add(payment)
    await db.commit()

    return TopupResponse(
        order_id=order_id,
        pay_token=pay_token,
        status="pending",
        message="Confirmez le paiement sur votre téléphone Orange Money.",
    )


async def _apply_confirmed_result(db: AsyncSession, payment: Orange_money_payments, *, provider_txn_id: Optional[str]) -> int:
    """Crédite le portefeuille pour un paiement confirmé SUCCESSFULL, une
    seule fois (idempotent via `credited`). Retourne le nouveau solde."""
    passenger_result = await db.execute(select(Passengers).where(Passengers.id == payment.passenger_id))
    passenger = passenger_result.scalar_one_or_none()
    if not passenger:
        logger.error("Passager %s introuvable pour créditer le paiement %s", payment.passenger_id, payment.order_id)
        payment.status = "successful"
        payment.provider_txn_id = provider_txn_id
        await db.commit()
        return 0

    balance = passenger.wallet_balance or 0
    debt_amount = passenger.debt_amount or 0
    has_debt = bool(passenger.has_pending_debt) and debt_amount > 0

    if has_debt:
        if payment.amount >= debt_amount:
            new_balance = balance + (payment.amount - debt_amount)
            new_debt = 0
            new_has_debt = False
        else:
            new_balance = balance
            new_debt = debt_amount - payment.amount
            new_has_debt = True
    else:
        new_balance = balance + payment.amount
        new_debt = debt_amount
        new_has_debt = False

    passenger.wallet_balance = new_balance
    passenger.debt_amount = new_debt
    passenger.has_pending_debt = new_has_debt

    db.add(
        Wallet_transactions(
            passenger_id=passenger.id,
            amount=payment.amount,
            type="topup",
            payment_method="orange_money",
            reference=payment.pay_token,
            description=f"Rechargement Orange Money (order {payment.order_id})",
        )
    )

    payment.status = "successful"
    payment.credited = True
    payment.provider_txn_id = provider_txn_id

    await db.commit()
    return new_balance


@router.get("/status/{order_id}", response_model=PaymentStatusResponse)
async def check_topup_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Interroge (et, le cas échéant, applique) le statut courant d'un
    rechargement Orange Money. Le frontend appelle cet endpoint en polling en
    attendant la confirmation du client sur son téléphone."""
    passenger = await _get_passenger(db, current_user)

    result = await db.execute(
        select(Orange_money_payments).where(
            Orange_money_payments.order_id == order_id,
            Orange_money_payments.passenger_id == passenger.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable.")

    if payment.status == "pending":
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                data = await orange_money.get_payment_status(client, payment.pay_token)
            except orange_money.OrangeMoneyError as exc:
                logger.error("Échec de la vérification du statut pour %s : %s", order_id, exc.message)
                raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

        provider_status = data.get("status")
        if provider_status == orange_money.STATUS_SUCCESSFUL and not payment.credited:
            await _apply_confirmed_result(db, payment, provider_txn_id=data.get("txnid"))
        elif provider_status == orange_money.STATUS_FAILED:
            payment.status = "failed"
            payment.failure_reason = data.get("confirmtxnmessage") or data.get("inittxnmessage") or "Paiement refusé ou expiré."
            await db.commit()

    await db.refresh(payment)
    passenger_result = await db.execute(select(Passengers).where(Passengers.id == payment.passenger_id))
    fresh_passenger = passenger_result.scalar_one_or_none()

    return PaymentStatusResponse(
        order_id=payment.order_id,
        status=payment.status,
        amount=payment.amount,
        credited=payment.credited,
        new_balance=fresh_passenger.wallet_balance if payment.credited and fresh_passenger else None,
        failure_reason=payment.failure_reason,
    )


@router.post("/webhook")
async def orange_money_webhook(data: OrangeMoneyCallback, db: AsyncSession = Depends(get_db)):
    """Callback `notifUrl` appelé par Orange Money quand le client confirme
    (ou rejette) la transaction sur son téléphone. Endpoint public par
    nature (Orange ne peut pas s'authentifier avec un JWT applicatif) :
    seule une correspondance avec un payToken de paiement déjà initié côté
    serveur est vérifiée. Toujours répondre 200 pour éviter des relances
    inutiles côté Orange, même si le payToken est inconnu."""
    result = await db.execute(
        select(Orange_money_payments).where(Orange_money_payments.pay_token == data.payToken)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        logger.warning("Webhook Orange Money reçu pour un payToken inconnu : %s", data.payToken)
        return {"received": True}

    if data.status == orange_money.STATUS_SUCCESSFUL and not payment.credited:
        await _apply_confirmed_result(db, payment, provider_txn_id=data.txnid)
    elif data.status == orange_money.STATUS_FAILED and payment.status == "pending":
        payment.status = "failed"
        payment.failure_reason = data.message or "Paiement refusé ou expiré."
        await db.commit()

    return {"received": True}
