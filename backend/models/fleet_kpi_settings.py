from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer


class Fleet_kpi_settings(Base):
    """Paramètres de la règle d'alerte flotte (« règle des -15 % »).

    Une seule ligne active est utilisée en pratique (la plus récente) ; le
    modèle autorise un historique pour ne jamais perdre trace d'un changement
    de seuil décidé par l'administration.
    """

    __tablename__ = "fleet_kpi_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    daily_target = Column(Integer, nullable=False, default=30000, server_default='30000')
    alert_threshold = Column(Integer, nullable=False, default=25500, server_default='25500')
    window_days = Column(Integer, nullable=False, default=90, server_default='90')
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
