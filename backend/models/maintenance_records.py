from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Maintenance_records(Base):
    __tablename__ = "maintenance_records"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    vehicle_id = Column(Integer, index=True, nullable=False)
    vehicle_fleet_id = Column(String, index=True, nullable=True)
    type = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, nullable=False)
    scheduled_date = Column(String, nullable=True)
    completed_date = Column(String, nullable=True)
    cost = Column(Integer, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)