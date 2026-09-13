from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String


class Sos_alerts(Base):
    """Alerte d'urgence déclenchée par un passager ou un chauffeur pendant
    une course, via le bouton SOS."""

    __tablename__ = "sos_alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    ride_id = Column(Integer, index=True, nullable=True)
    passenger_id = Column(Integer, index=True, nullable=True)
    driver_id = Column(Integer, index=True, nullable=True)
    triggered_by = Column(String, nullable=False)  # "passenger" ou "driver"
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(String, nullable=True, default="active", server_default="active")  # active | resolved
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
