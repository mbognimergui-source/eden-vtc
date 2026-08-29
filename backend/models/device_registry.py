from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Device_registry(Base):
    __tablename__ = "device_registry"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    device_fingerprint = Column(String, nullable=False)
    passenger_id = Column(Integer, index=True, nullable=True)
    has_debt_flag = Column(Boolean, nullable=True, default=False, server_default='false')
    debt_amount_at_register = Column(Integer, nullable=True, default=0, server_default='0')
    install_count = Column(Integer, nullable=True, default=1, server_default='1')
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    is_blocked = Column(Boolean, nullable=True, default=False, server_default='false')
    block_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)