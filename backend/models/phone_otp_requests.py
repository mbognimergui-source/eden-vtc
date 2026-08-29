from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Phone_otp_requests(Base):
    __tablename__ = "phone_otp_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    phone = Column(String, nullable=False)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, nullable=True)
    consumed = Column(Boolean, nullable=True)
    request_ip = Column(String, nullable=True)
    delivery_status = Column(String, nullable=True)
    channel = Column(String, nullable=True)  # "sms" ou "whatsapp"
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)