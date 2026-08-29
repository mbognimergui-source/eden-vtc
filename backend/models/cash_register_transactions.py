from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Cash_register_transactions(Base):
    __tablename__ = "cash_register_transactions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    account_type = Column(String, nullable=False)
    operation = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    ride_id = Column(Integer, index=True, nullable=True)
    passenger_id = Column(Integer, index=True, nullable=True)
    description = Column(String, nullable=False)
    balance_after = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)