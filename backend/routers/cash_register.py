# @File: backend/routers/cash_register.py
# @Desc: Gestion de la caisse centralisée EDEN VTC
# Deux comptes : "encours" (soldes wallets clients) et "caisse" (recettes validées)
# Reversement automatique à chaque validation de commande
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.company_accounts import Company_accounts
from models.cash_register_transactions import Cash_register_transactions
from models.passengers import Passengers
from models.wallet_transactions import Wallet_transactions
from models.rides import Rides
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/cash-register", tags=["cash_register"])


# === Schemas ===

class TopupRequest(BaseModel):
    """Rechargement wallet passager → crédite le compte encours"""
    passenger_id: int
    amount: int
    payment_method: str = "orange_money"
    reference: Optional[str] = None


class RidePaymentRequest(BaseModel):
    """Validation d'une course → débite encours, crédite caisse"""
    ride_id: int
    amount: int
    passenger_id: int


class ManualCashEntry(BaseModel):
    """Entrée manuelle en caisse (paiement cash direct)"""
    amount: int
    description: str
    ride_id: Optional[int] = None
    passenger_id: Optional[int] = None


# === Helper functions ===

async def get_or_create_account(db: AsyncSession, account_type: str) -> Company_accounts:
    """Get or create a company account."""
    result = await db.execute(
        select(Company_accounts).where(Company_accounts.account_type == account_type)
    )
    account = result.scalar_one_or_none()
    if not account:
        account = Company_accounts(
            account_type=account_type,
            balance=0,
            label=f"Compte {'des Encours' if account_type == 'encours' else 'Caisse'}",
            last_updated_reason="Création automatique",
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)
    return account


async def record_transaction(
    db: AsyncSession,
    account_type: str,
    operation: str,
    amount: int,
    description: str,
    balance_after: int,
    ride_id: Optional[int] = None,
    passenger_id: Optional[int] = None,
):
    """Record a cash register transaction."""
    txn = Cash_register_transactions(
        account_type=account_type,
        operation=operation,
        amount=amount,
        ride_id=ride_id,
        passenger_id=passenger_id,
        description=description,
        balance_after=balance_after,
    )
    db.add(txn)


# === Endpoints ===

@router.get("/accounts")
async def get_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retourne les soldes des deux comptes : encours et caisse.
    Calcule aussi le total encours réel (somme des wallets clients).
    """
    try:
        # Get both accounts
        encours = await get_or_create_account(db, "encours")
        caisse = await get_or_create_account(db, "caisse")

        # Calculate real encours from passenger wallets
        wallet_sum_result = await db.execute(
            select(func.coalesce(func.sum(Passengers.wallet_balance), 0))
        )
        real_encours = wallet_sum_result.scalar() or 0

        # Sync encours account with real wallet sum
        if encours.balance != real_encours:
            encours.balance = real_encours
            encours.last_updated_reason = "Synchronisation avec soldes wallets"
            await db.commit()
            await db.refresh(encours)

        return {
            "accounts": [
                {
                    "id": encours.id,
                    "type": "encours",
                    "label": encours.label,
                    "balance": encours.balance,
                    "description": "Somme des soldes des portefeuilles clients",
                    "last_updated_reason": encours.last_updated_reason,
                    "updated_at": str(encours.updated_at) if encours.updated_at else None,
                },
                {
                    "id": caisse.id,
                    "type": "caisse",
                    "label": caisse.label,
                    "balance": caisse.balance,
                    "description": "Recettes reversées après validation des commandes",
                    "last_updated_reason": caisse.last_updated_reason,
                    "updated_at": str(caisse.updated_at) if caisse.updated_at else None,
                },
            ],
            "total": encours.balance + caisse.balance,
            "real_encours_wallets": real_encours,
        }
    except Exception as e:
        logger.error(f"Error getting accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topup")
async def process_topup(
    data: TopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Rechargement wallet passager.
    → Crédite le wallet du passager
    → Crédite le compte encours (l'argent est dans le système)
    """
    try:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Le montant doit être positif")

        # Get passenger
        passenger_result = await db.execute(
            select(Passengers).where(Passengers.id == data.passenger_id)
        )
        passenger = passenger_result.scalar_one_or_none()
        if not passenger:
            raise HTTPException(status_code=404, detail="Passager introuvable")

        # Credit passenger wallet
        passenger.wallet_balance = (passenger.wallet_balance or 0) + data.amount

        # Credit encours account
        encours = await get_or_create_account(db, "encours")
        encours.balance = (encours.balance or 0) + data.amount
        encours.last_updated_reason = f"Rechargement wallet passager #{data.passenger_id}"

        # Record wallet transaction
        wallet_txn = Wallet_transactions(
            user_id=current_user.id,
            passenger_id=data.passenger_id,
            amount=data.amount,
            type="topup",
            payment_method=data.payment_method,
            reference=data.reference or f"TOPUP-{data.passenger_id}-{data.amount}",
            description=f"Rechargement {data.amount} FCFA via {data.payment_method}",
        )
        db.add(wallet_txn)

        # Record cash register transaction
        await record_transaction(
            db,
            account_type="encours",
            operation="credit",
            amount=data.amount,
            description=f"Rechargement wallet passager #{data.passenger_id} via {data.payment_method}",
            balance_after=encours.balance,
            passenger_id=data.passenger_id,
        )

        # Alerte pour rechargement important (> 100 000 FCFA)
        if data.amount >= 100000:
            try:
                from routers.cash_alerts import create_cash_alert
                await create_cash_alert(
                    db,
                    alert_type="large_transaction",
                    severity="info",
                    title="Rechargement important",
                    message=f"Rechargement de {data.amount} FCFA par passager #{data.passenger_id} via {data.payment_method}",
                    amount=data.amount,
                    passenger_id=data.passenger_id,
                    details={"payment_method": data.payment_method, "encours_balance": encours.balance},
                )
            except Exception as alert_err:
                logger.warning(f"Erreur alerte topup: {alert_err}")

        await db.commit()

        return {
            "success": True,
            "message": f"Rechargement de {data.amount} FCFA effectué",
            "wallet_balance": passenger.wallet_balance,
            "encours_balance": encours.balance,
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error processing topup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-ride-payment")
async def validate_ride_payment(
    data: RidePaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Validation d'une commande (course terminée).
    → Débite le wallet du passager (compte encours diminue)
    → Crédite le compte caisse (recette validée)
    C'est le transfert encours → caisse.
    """
    try:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Le montant doit être positif")

        # Get passenger
        passenger_result = await db.execute(
            select(Passengers).where(Passengers.id == data.passenger_id)
        )
        passenger = passenger_result.scalar_one_or_none()
        if not passenger:
            raise HTTPException(status_code=404, detail="Passager introuvable")

        # Get ride
        ride_result = await db.execute(
            select(Rides).where(Rides.id == data.ride_id)
        )
        ride = ride_result.scalar_one_or_none()
        if not ride:
            raise HTTPException(status_code=404, detail="Course introuvable")

        # Debit passenger wallet
        wallet_balance = passenger.wallet_balance or 0
        actual_debit = min(data.amount, wallet_balance)
        debt_amount = data.amount - actual_debit

        passenger.wallet_balance = wallet_balance - actual_debit
        if debt_amount > 0:
            passenger.has_pending_debt = True
            passenger.debt_amount = (passenger.debt_amount or 0) + debt_amount

        # Update ride payment status
        ride.final_price = data.amount
        ride.payment_status = "paid" if debt_amount == 0 else "debt"

        # Debit encours account (money leaves client wallets)
        encours = await get_or_create_account(db, "encours")
        encours.balance = max(0, (encours.balance or 0) - actual_debit)
        encours.last_updated_reason = f"Paiement course #{data.ride_id}"

        # Credit caisse account (revenue validated)
        caisse = await get_or_create_account(db, "caisse")
        caisse.balance = (caisse.balance or 0) + data.amount
        caisse.last_updated_reason = f"Recette course #{data.ride_id}"

        # Record wallet debit transaction
        wallet_txn = Wallet_transactions(
            user_id=current_user.id,
            passenger_id=data.passenger_id,
            amount=actual_debit,
            type="debit",
            reference=f"RIDE-{data.ride_id}",
            description=f"Paiement course #{data.ride_id} - {data.amount} FCFA",
        )
        db.add(wallet_txn)

        # Record cash register transactions
        await record_transaction(
            db,
            account_type="encours",
            operation="debit",
            amount=actual_debit,
            description=f"Débit wallet pour course #{data.ride_id}",
            balance_after=encours.balance,
            ride_id=data.ride_id,
            passenger_id=data.passenger_id,
        )
        await record_transaction(
            db,
            account_type="caisse",
            operation="credit",
            amount=data.amount,
            description=f"Recette validée course #{data.ride_id}",
            balance_after=caisse.balance,
            ride_id=data.ride_id,
            passenger_id=data.passenger_id,
        )

        await db.commit()

        return {
            "success": True,
            "message": f"Paiement de {data.amount} FCFA validé pour la course #{data.ride_id}",
            "ride_id": data.ride_id,
            "amount_debited": actual_debit,
            "debt_created": debt_amount,
            "wallet_balance": passenger.wallet_balance,
            "encours_balance": encours.balance,
            "caisse_balance": caisse.balance,
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error validating ride payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cash-entry")
async def manual_cash_entry(
    data: ManualCashEntry,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Entrée manuelle en caisse (paiement cash direct, sans wallet).
    → Crédite directement le compte caisse.
    → Déclenche une alerte si montant important.
    """
    try:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Le montant doit être positif")

        caisse = await get_or_create_account(db, "caisse")
        caisse.balance = (caisse.balance or 0) + data.amount
        caisse.last_updated_reason = data.description

        await record_transaction(
            db,
            account_type="caisse",
            operation="credit",
            amount=data.amount,
            description=data.description,
            balance_after=caisse.balance,
            ride_id=data.ride_id,
            passenger_id=data.passenger_id,
        )

        # Alerte pour entrée manuelle importante (> 100 000 FCFA)
        if data.amount >= 100000:
            try:
                from routers.cash_alerts import create_cash_alert
                await create_cash_alert(
                    db,
                    alert_type="manual_entry_large",
                    severity="warning",
                    title="Entrée manuelle importante",
                    message=f"Entrée manuelle de {data.amount} FCFA en caisse : {data.description}",
                    amount=data.amount,
                    ride_id=data.ride_id,
                    passenger_id=data.passenger_id,
                    details={"caisse_balance": caisse.balance, "description": data.description},
                )
            except Exception as alert_err:
                logger.warning(f"Erreur alerte cash-entry: {alert_err}")

        await db.commit()

        return {
            "success": True,
            "message": f"Entrée en caisse de {data.amount} FCFA enregistrée",
            "caisse_balance": caisse.balance,
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error recording cash entry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === Schema pour paiement de dette ===

class PayDebtRequest(BaseModel):
    """Paiement de dette par le passager (régularisation)"""
    amount: int
    payment_method: str = "orange_money"
    reference: Optional[str] = None


@router.post("/pay-debt")
async def pay_debt(
    data: PayDebtRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Régularisation de dette par le passager.
    Le passager paie tout ou partie de sa dette via mobile money.
    → Réduit la dette du passager
    → Crédite le compte caisse (l'argent entre réellement)
    → Enregistre la transaction wallet
    → Réinitialise has_pending_debt si dette = 0
    """
    try:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Le montant doit être positif")

        # Get passenger for current user
        passenger_result = await db.execute(
            select(Passengers).where(Passengers.user_id == current_user.id)
        )
        passenger = passenger_result.scalar_one_or_none()
        if not passenger:
            raise HTTPException(status_code=404, detail="Passager introuvable")

        current_debt = passenger.debt_amount or 0
        if current_debt <= 0:
            raise HTTPException(status_code=400, detail="Vous n'avez aucune dette à régulariser")

        # Cap payment at actual debt amount
        payment_amount = min(data.amount, current_debt)

        # Reduce debt
        new_debt = current_debt - payment_amount
        passenger.debt_amount = new_debt
        passenger.has_pending_debt = new_debt > 0

        # Credit caisse account (real money coming in)
        caisse = await get_or_create_account(db, "caisse")
        caisse.balance = (caisse.balance or 0) + payment_amount
        caisse.last_updated_reason = f"Régularisation dette passager #{passenger.id}"

        # Record wallet transaction
        wallet_txn = Wallet_transactions(
            user_id=current_user.id,
            passenger_id=passenger.id,
            amount=payment_amount,
            type="debt_payment",
            payment_method=data.payment_method,
            reference=data.reference or f"DEBT-{passenger.id}-{payment_amount}",
            description=f"Régularisation dette {payment_amount} FCFA via {data.payment_method}",
        )
        db.add(wallet_txn)

        # Record cash register transaction
        await record_transaction(
            db,
            account_type="caisse",
            operation="credit",
            amount=payment_amount,
            description=f"Régularisation dette passager #{passenger.id} via {data.payment_method}",
            balance_after=caisse.balance,
            passenger_id=passenger.id,
        )

        # Alert if debt fully cleared
        try:
            from routers.cash_alerts import create_cash_alert
            if new_debt == 0:
                await create_cash_alert(
                    db,
                    alert_type="debt_cleared",
                    severity="info",
                    title="Dette régularisée",
                    message=f"Passager #{passenger.id} a régularisé sa dette de {payment_amount} FCFA",
                    amount=payment_amount,
                    passenger_id=passenger.id,
                    details={"payment_method": data.payment_method, "previous_debt": current_debt},
                )
        except Exception as alert_err:
            logger.warning(f"Erreur alerte debt-payment: {alert_err}")

        await db.commit()

        return {
            "success": True,
            "message": f"Paiement de {payment_amount} FCFA effectué. "
                       + (f"Dette restante : {new_debt} FCFA" if new_debt > 0 else "Dette entièrement régularisée !"),
            "payment_amount": payment_amount,
            "remaining_debt": new_debt,
            "debt_cleared": new_debt == 0,
            "caisse_balance": caisse.balance,
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error paying debt: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions")
async def get_transactions(
    account_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Liste des mouvements de caisse (filtrable par type de compte).
    """
    try:
        query = select(Cash_register_transactions).order_by(
            Cash_register_transactions.created_at.desc()
        )
        if account_type:
            query = query.where(Cash_register_transactions.account_type == account_type)

        query = query.offset(offset).limit(limit)
        result = await db.execute(query)
        transactions = result.scalars().all()

        # Count total
        count_query = select(func.count(Cash_register_transactions.id))
        if account_type:
            count_query = count_query.where(Cash_register_transactions.account_type == account_type)
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        return {
            "transactions": [
                {
                    "id": t.id,
                    "account_type": t.account_type,
                    "operation": t.operation,
                    "amount": t.amount,
                    "ride_id": t.ride_id,
                    "passenger_id": t.passenger_id,
                    "description": t.description,
                    "balance_after": t.balance_after,
                    "created_at": str(t.created_at) if t.created_at else None,
                }
                for t in transactions
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Error getting transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Résumé financier : total encours, total caisse, nombre de transactions aujourd'hui.
    """
    try:
        encours = await get_or_create_account(db, "encours")
        caisse = await get_or_create_account(db, "caisse")

        # Sync encours with real wallet balances
        wallet_sum_result = await db.execute(
            select(func.coalesce(func.sum(Passengers.wallet_balance), 0))
        )
        real_encours = wallet_sum_result.scalar() or 0
        encours.balance = real_encours
        await db.commit()

        # Count today's transactions
        from datetime import date, datetime
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_count_result = await db.execute(
            select(func.count(Cash_register_transactions.id)).where(
                Cash_register_transactions.created_at >= today_start
            )
        )
        today_count = today_count_result.scalar() or 0

        # Today's revenue (caisse credits today)
        today_revenue_result = await db.execute(
            select(func.coalesce(func.sum(Cash_register_transactions.amount), 0)).where(
                Cash_register_transactions.account_type == "caisse",
                Cash_register_transactions.operation == "credit",
                Cash_register_transactions.created_at >= today_start,
            )
        )
        today_revenue = today_revenue_result.scalar() or 0

        return {
            "encours": real_encours,
            "caisse": caisse.balance,
            "total_fonds": real_encours + caisse.balance,
            "today_transactions": today_count,
            "today_revenue": today_revenue,
        }
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))