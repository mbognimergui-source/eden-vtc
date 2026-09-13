"""
Service de complétion de course avec transfert encours → caisse.
Source unique de vérité pour le reversement automatique.
Idempotent : si la course est déjà 'completed', retourne sans rien faire.
Déclenche des alertes admin pour les mouvements importants.
"""
import logging
from typing import Optional

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.rides import Rides
from models.drivers import Drivers
from models.passengers import Passengers
from models.company_accounts import Company_accounts
from models.cash_register_transactions import Cash_register_transactions
from models.wallet_transactions import Wallet_transactions

logger = logging.getLogger(__name__)

# Seuils d'alerte
LARGE_TRANSACTION_THRESHOLD = 50000  # FCFA
LOW_ENCOURS_THRESHOLD = 10000  # FCFA

# Plafond de dette par course (FCFA)
MAX_DEBT_PER_RIDE = 5000


async def complete_ride_and_transfer(
    db: AsyncSession,
    ride_id: int,
    release_gps: bool = False,
) -> dict:
    """
    Termine une course et effectue le transfert encours → caisse.

    Args:
        db: session DB async
        ride_id: identifiant de la course
        release_gps: si True, libère aussi la position GPS du véhicule

    Returns:
        dict avec success, message, payment info, already_completed flag
    """
    # Libérer GPS si demandé
    if release_gps:
        from models.vehicle_positions import Vehicle_positions
        result = await db.execute(
            select(Vehicle_positions).where(Vehicle_positions.ride_id == ride_id)
        )
        position = result.scalar_one_or_none()
        if position:
            position.ride_id = None
            position.status = "idle"

    # Charger la course
    ride_result = await db.execute(
        select(Rides).where(Rides.id == ride_id)
    )
    ride = ride_result.scalar_one_or_none()

    if not ride:
        return {
            "success": False,
            "message": "Course introuvable.",
            "ride_id": ride_id,
            "error": "not_found",
        }

    # Idempotent : déjà terminée
    if ride.status == "completed":
        return {
            "success": True,
            "ride_id": ride.id,
            "status": "completed",
            "message": "Course déjà terminée.",
            "already_completed": True,
            "payment": None,
        }

    # Seules les courses accepted/in_progress peuvent être terminées
    if ride.status not in ("accepted", "in_progress"):
        return {
            "success": False,
            "ride_id": ride.id,
            "status": ride.status,
            "message": f"Impossible de terminer une course en statut '{ride.status}'.",
            "error": "invalid_status",
        }

    # Réclamation atomique : la clause WHERE revérifie le statut au moment de
    # l'écriture elle-même, pas seulement au SELECT ci-dessus. Sans ça, deux
    # appels concurrents (double-tap, retry après timeout, webhook + polling)
    # peuvent tous les deux passer les vérifications de statut ci-dessus puis
    # exécuter le débit wallet / crédit caisse deux fois pour la même course.
    # Une seule requête concurrente peut affecter la ligne ; l'autre sait
    # qu'elle a perdu la course et s'arrête sans rien débiter/créditer.
    claim_result = await db.execute(
        update(Rides).where(Rides.id == ride_id, Rides.status == ride.status).values(status="completed")
    )
    if claim_result.rowcount == 0:
        await db.rollback()
        refreshed = await db.execute(select(Rides).where(Rides.id == ride_id))
        current = refreshed.scalar_one_or_none()
        return {
            "success": True,
            "ride_id": ride_id,
            "status": current.status if current else "unknown",
            "message": "Course déjà terminée par une requête concurrente.",
            "already_completed": True,
            "payment": None,
        }

    # Marquer comme terminée (déjà fait en base par la réclamation ci-dessus ;
    # mise à jour de l'objet en mémoire pour le reste de la fonction).
    ride.status = "completed"

    # Libérer le chauffeur
    if ride.driver_id:
        driver_result = await db.execute(
            select(Drivers).where(Drivers.id == ride.driver_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            driver.status = "online"

    # === Transfert encours → caisse ===
    # Sécurité : le montant facturé est TOUJOURS recalculé côté serveur depuis
    # la distance, la durée et les paramètres tarifaires en base. Le prix
    # indicatif transmis par le client (`estimated_price`) n'est jamais débité
    # tel quel ; il ne sert que de repli si le recalcul est impossible.
    from services.pricing import quote_price_for_ride

    price_breakdown: Optional[dict] = None
    try:
        quote = await quote_price_for_ride(db, ride)
        amount = quote["amount"]
        price_breakdown = quote["breakdown"]
        if ride.estimated_price and int(ride.estimated_price) != amount:
            logger.info(
                "Course #%s : prix recalculé serveur=%s FCFA (indicatif client=%s FCFA)",
                ride_id,
                amount,
                ride.estimated_price,
            )
    except Exception as pricing_err:
        logger.error(
            "Course #%s : recalcul tarifaire impossible (%s), repli sur le dernier montant connu",
            ride_id,
            pricing_err,
        )
        amount = ride.final_price or ride.estimated_price or 0

    payment_info: Optional[dict] = None

    if amount > 0:
        # Trouver le passager via passenger_id de la course
        passenger_result = await db.execute(
            select(Passengers).where(Passengers.id == ride.passenger_id)
        )
        passenger = passenger_result.scalar_one_or_none()

        # Débit wallet passager
        # Règle métier : la dette est plafonnée à MAX_DEBT_PER_RIDE (5 000 FCFA) par course
        actual_debit = 0
        debt_amount = 0
        if passenger:
            wallet_balance = passenger.wallet_balance or 0
            actual_debit = min(amount, wallet_balance)
            raw_debt = amount - actual_debit
            # Plafonner la dette à 5 000 FCFA maximum
            debt_amount = min(raw_debt, MAX_DEBT_PER_RIDE)
            passenger.wallet_balance = wallet_balance - actual_debit
            if debt_amount > 0:
                passenger.has_pending_debt = True
                passenger.debt_amount = (passenger.debt_amount or 0) + debt_amount

        # Mise à jour course
        ride.final_price = amount
        ride.payment_status = "paid" if debt_amount == 0 else "debt"

        # Comptes entreprise
        encours_result = await db.execute(
            select(Company_accounts).where(Company_accounts.account_type == "encours")
        )
        encours = encours_result.scalar_one_or_none()
        if not encours:
            encours = Company_accounts(
                account_type="encours", balance=0, label="Compte des Encours",
                last_updated_reason="Création automatique"
            )
            db.add(encours)
            await db.flush()

        caisse_result = await db.execute(
            select(Company_accounts).where(Company_accounts.account_type == "caisse")
        )
        caisse = caisse_result.scalar_one_or_none()
        if not caisse:
            caisse = Company_accounts(
                account_type="caisse", balance=0, label="Compte Caisse",
                last_updated_reason="Création automatique"
            )
            db.add(caisse)
            await db.flush()

        # Mouvements comptables
        encours.balance = max(0, (encours.balance or 0) - actual_debit)
        encours.last_updated_reason = f"Paiement course #{ride_id}"
        caisse.balance = (caisse.balance or 0) + amount
        caisse.last_updated_reason = f"Recette course #{ride_id}"

        # Transaction wallet
        if passenger and actual_debit > 0:
            wallet_txn = Wallet_transactions(
                passenger_id=passenger.id,
                amount=actual_debit,
                type="debit",
                reference=f"RIDE-{ride_id}",
                description=f"Paiement course #{ride_id} - {amount} FCFA",
            )
            db.add(wallet_txn)

        # Transactions caisse
        encours_txn = Cash_register_transactions(
            account_type="encours",
            operation="debit",
            amount=actual_debit,
            ride_id=ride_id,
            passenger_id=passenger.id if passenger else None,
            description=f"Débit wallet pour course #{ride_id}",
            balance_after=encours.balance,
        )
        db.add(encours_txn)

        caisse_txn = Cash_register_transactions(
            account_type="caisse",
            operation="credit",
            amount=amount,
            ride_id=ride_id,
            passenger_id=passenger.id if passenger else None,
            description=f"Recette validée course #{ride_id}",
            balance_after=caisse.balance,
        )
        db.add(caisse_txn)

        payment_info = {
            "amount": amount,
            "currency": "XAF",
            "actual_debit": actual_debit,
            "debt_created": debt_amount,
            "caisse_balance": caisse.balance,
            "price_source": "server",
            "price_breakdown": price_breakdown,
        }

    # === Alertes admin pour mouvements importants ===
    try:
        from routers.cash_alerts import create_cash_alert

        if amount > 0:
            # Alerte transaction importante (> 50 000 FCFA)
            if amount >= LARGE_TRANSACTION_THRESHOLD:
                await create_cash_alert(
                    db,
                    alert_type="large_transaction",
                    severity="warning",
                    title="Transaction importante",
                    message=f"Course #{ride_id} : reversement de {amount} FCFA en caisse",
                    amount=amount,
                    ride_id=ride_id,
                    passenger_id=passenger.id if passenger else None,
                    details={"caisse_balance": caisse.balance, "type": "ride_completion"},
                )

            # Alerte dette créée
            if debt_amount > 0:
                severity = "critical" if debt_amount >= LARGE_TRANSACTION_THRESHOLD else "warning"
                await create_cash_alert(
                    db,
                    alert_type="debt_created",
                    severity=severity,
                    title="Dette passager créée",
                    message=f"Passager #{passenger.id if passenger else '?'} : dette de {debt_amount} FCFA (course #{ride_id})",
                    amount=debt_amount,
                    ride_id=ride_id,
                    passenger_id=passenger.id if passenger else None,
                    details={"total_debt": passenger.debt_amount if passenger else 0},
                )

            # Alerte encours bas
            if encours.balance < LOW_ENCOURS_THRESHOLD:
                await create_cash_alert(
                    db,
                    alert_type="low_encours",
                    severity="critical",
                    title="Encours très bas",
                    message=f"Le compte encours est à {encours.balance} FCFA (seuil : {LOW_ENCOURS_THRESHOLD} FCFA)",
                    amount=encours.balance,
                    details={"threshold": LOW_ENCOURS_THRESHOLD},
                )
    except Exception as alert_err:
        # Ne pas bloquer la complétion de course si les alertes échouent
        logger.warning(f"Erreur lors de la création des alertes: {alert_err}")

    logger.info(f"Course #{ride_id} terminée, transfert caisse effectué: {payment_info}")

    return {
        "success": True,
        "ride_id": ride.id,
        "status": "completed",
        "message": "Course terminée et recette reversée en caisse",
        "already_completed": False,
        "payment": payment_info,
    }