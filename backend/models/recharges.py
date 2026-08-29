from core.database import Base
from datetime import datetime
from sqlalchemy import Column, Date, DateTime, Float, Integer, String


class Recharges(Base):
    __tablename__ = "recharges"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    driver_id = Column(Integer, index=True, nullable=True)
    vehicle_id = Column(Integer, index=True, nullable=False)
    station = Column(String, nullable=False)
    kwh = Column(Float, nullable=False)
    price_per_kwh = Column(Float, nullable=True, default=106, server_default='106')
    total_cost = Column(Integer, nullable=False)
    km_counter = Column(Integer, nullable=True)
    date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)