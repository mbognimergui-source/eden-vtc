from core.database import Base
from datetime import datetime
from sqlalchemy import Column, Date, DateTime, Integer, String


class Vehicles(Base):
    __tablename__ = "vehicles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    fleet_id = Column(String, index=True, nullable=False)
    model = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    license_plate = Column(String, nullable=False)
    status = Column(String, nullable=True, default='available', server_default='available')
    km_counter = Column(Integer, nullable=True, default=0, server_default='0')
    next_maintenance_date = Column(Date, nullable=True)
    battery_level = Column(Integer, nullable=True, default=100, server_default='100')
    zone = Column(String, nullable=True, default='douala', server_default='douala')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)