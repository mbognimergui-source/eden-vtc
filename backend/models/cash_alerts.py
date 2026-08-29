from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB


class Cash_alerts(Base):
    __tablename__ = "cash_alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    amount = Column(Integer, nullable=True)
    ride_id = Column(Integer, index=True, nullable=True)
    passenger_id = Column(Integer, index=True, nullable=True)
    details = Column(JSONB, nullable=True)
    is_read = Column(Boolean, nullable=True, default=False, server_default='false')
    is_resolved = Column(Boolean, nullable=True, default=False, server_default='false')
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)