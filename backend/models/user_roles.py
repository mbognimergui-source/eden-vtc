from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class User_roles(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False, default='passenger', server_default='passenger')
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    granted_by = Column(String, nullable=True, default='', server_default='')
    permissions = Column(String, nullable=True, default='{}', server_default='{}')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)