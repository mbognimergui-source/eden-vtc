from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Feedbacks(Base):
    __tablename__ = "feedbacks"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    rating = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    message = Column(String, nullable=False)
    status = Column(String, nullable=True, default='pending', server_default='pending')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)