from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Wallet_transactions(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    passenger_id = Column(Integer, index=True, nullable=True)
    amount = Column(Integer, nullable=False)
    type = Column(String, nullable=False)
    payment_method = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)