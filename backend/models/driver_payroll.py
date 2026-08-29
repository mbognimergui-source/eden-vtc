from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Driver_payroll(Base):
    """Bulletin de paie mensuel d'un chauffeur salarié EDEN VTC.

    Un enregistrement par (chauffeur, année, mois). Le salaire de base vient de
    `drivers.monthly_base_salary` au moment de la génération ; la prime de
    performance récompense les jours où la recette du chauffeur a atteint
    l'objectif journalier (30 000 FCFA par défaut), sans jamais transformer le
    salarié en indépendant à la commission.
    """

    __tablename__ = "driver_payroll"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    driver_id = Column(Integer, index=True, nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)

    base_salary = Column(Integer, nullable=False, default=0, server_default='0')
    worked_days = Column(Integer, nullable=True, default=0, server_default='0')
    daily_target = Column(Integer, nullable=True, default=30000, server_default='30000')
    days_target_met = Column(Integer, nullable=True, default=0, server_default='0')
    total_ride_revenue = Column(Integer, nullable=True, default=0, server_default='0')
    performance_bonus = Column(Integer, nullable=True, default=0, server_default='0')
    deductions = Column(Integer, nullable=True, default=0, server_default='0')
    deduction_reason = Column(String, nullable=True)
    net_pay = Column(Integer, nullable=False, default=0, server_default='0')

    status = Column(String, nullable=True, default='draft', server_default='draft')  # draft, validated, paid
    payment_reference = Column(String, nullable=True)
    validated_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
