from models.base import Base
from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func


class User(Base):
    """Compte utilisateur EDEN VTC.

    Pour les passagers, l'identifiant provient de l'authentification par
    telephone (OTP SMS) : aucun email ni mot de passe n'est requis.
    """

    __tablename__ = "users"

    id = Column(String(255), primary_key=True, index=True)
    email = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    role = Column(String(50), default="user", nullable=False)  # user/driver/admin
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)