from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Rides(Base):
    __tablename__ = "rides"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    passenger_id = Column(Integer, index=True, nullable=True)
    driver_id = Column(Integer, index=True, nullable=True)
    vehicle_id = Column(Integer, index=True, nullable=True)
    status = Column(String, nullable=True, default='pending', server_default='pending')
    pickup_address = Column(String, nullable=False)
    pickup_lat = Column(Float, nullable=True)
    pickup_lng = Column(Float, nullable=True)
    destination_address = Column(String, nullable=False)
    destination_lat = Column(Float, nullable=True)
    destination_lng = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    duration_min = Column(Integer, nullable=True)
    estimated_price = Column(Integer, nullable=True)
    final_price = Column(Integer, nullable=True)
    payment_method = Column(String, nullable=True, default='wallet', server_default='wallet')
    payment_status = Column(String, nullable=True, default='pending', server_default='pending')
    rating = Column(Integer, nullable=True)
    comment = Column(String, nullable=True)
    is_scheduled = Column(Boolean, nullable=True, default=False, server_default='false')
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    km_start = Column(Integer, nullable=True)
    km_end = Column(Integer, nullable=True)
    co2_saved = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)