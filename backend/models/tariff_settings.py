from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Tariff_settings(Base):
    __tablename__ = "tariff_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    base_fare = Column(Integer, nullable=True, default=500, server_default='500')
    price_per_km = Column(Integer, nullable=True, default=350, server_default='350')
    price_per_min = Column(Integer, nullable=True, default=50, server_default='50')
    minimum_fare = Column(Integer, nullable=True, default=1000, server_default='1000')
    airport_surcharge = Column(Integer, nullable=True, default=2000, server_default='2000')
    night_multiplier = Column(Float, nullable=True, default=1.5, server_default='1.5')
    night_start_hour = Column(Integer, nullable=True, default=22, server_default='22')
    night_end_hour = Column(Integer, nullable=True, default=6, server_default='6')
    co2_saved_per_km = Column(Float, nullable=True, default=120, server_default='120')
    daily_target = Column(Integer, nullable=True, default=30000, server_default='30000')
    alert_threshold_percent = Column(Integer, nullable=True, default=85, server_default='85')
    zone = Column(String, nullable=True, default='douala', server_default='douala')
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)