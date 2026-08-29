from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Country_tariffs(Base):
    __tablename__ = "country_tariffs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    country_code = Column(String, nullable=False)
    country_name = Column(String, nullable=False)
    currency_code = Column(String, nullable=False)
    currency_symbol = Column(String, nullable=False)
    base_fare = Column(Integer, nullable=False)
    price_per_km = Column(Integer, nullable=False)
    price_per_min = Column(Integer, nullable=False)
    minimum_fare = Column(Integer, nullable=False)
    airport_surcharge = Column(Integer, nullable=True)
    night_multiplier = Column(Float, nullable=True, default=1.5, server_default='1.5')
    night_start_hour = Column(Integer, nullable=True, default=22, server_default='22')
    night_end_hour = Column(Integer, nullable=True, default=6, server_default='6')
    daily_target = Column(Integer, nullable=True)
    rounding_unit = Column(Integer, nullable=True, default=100, server_default='100')
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)