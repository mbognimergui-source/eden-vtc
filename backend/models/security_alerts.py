from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Security_alerts(Base):
    __tablename__ = "security_alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    source_ip = Column(String, nullable=True)
    target_path = Column(String, nullable=True)
    description = Column(String, nullable=False)
    details = Column(String, nullable=True)
    is_resolved = Column(Boolean, nullable=True)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)