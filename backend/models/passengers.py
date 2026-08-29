from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Passengers(Base):
    __tablename__ = "passengers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    city = Column(String, nullable=True)
    wallet_balance = Column(Integer, nullable=True)
    has_pending_debt = Column(Boolean, nullable=True)
    debt_amount = Column(Integer, nullable=True)
    total_rides = Column(Integer, nullable=True)
    co2_saved = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)