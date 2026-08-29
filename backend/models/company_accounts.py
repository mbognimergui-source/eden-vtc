from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Company_accounts(Base):
    __tablename__ = "company_accounts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    account_type = Column(String, nullable=False)
    balance = Column(Integer, nullable=False, default=0, server_default='0')
    label = Column(String, nullable=False)
    last_updated_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)