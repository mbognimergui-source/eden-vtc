from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Orange_money_payments(Base):
    """Suivi des tentatives de paiement Orange Money (OMAPI).

    Distinct de `wallet_transactions`, qui n'enregistre que les mouvements
    de portefeuille confirmés : cette table trace le cycle de vie complet
    d'une demande de paiement côté fournisseur (pending -> successful/failed),
    y compris les tentatives jamais confirmées par le client. `credited`
    garantit qu'un même paiement Orange ne crédite le portefeuille qu'une
    seule fois, même si le statut est consulté plusieurs fois ou si le
    webhook Orange et le polling de statut arrivent tous les deux.
    """

    __tablename__ = "orange_money_payments"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    passenger_id = Column(Integer, index=True, nullable=False)
    purpose = Column(String, nullable=False, default="topup")  # "topup" | "debt_payment"
    order_id = Column(String, unique=True, index=True, nullable=False)
    pay_token = Column(String, unique=True, index=True, nullable=True)
    subscriber_msisdn = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | successful | failed
    provider_txn_id = Column(String, nullable=True)
    failure_reason = Column(String, nullable=True)
    credited = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
