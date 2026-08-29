from core.database import Base
from datetime import datetime
from sqlalchemy import Column, Date, DateTime, Float, Integer, String


class Drivers(Base):
    __tablename__ = "drivers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    status = Column(String, nullable=True, default='offline', server_default='offline')
    vehicle_id = Column(Integer, index=True, nullable=True)
    license_number = Column(String, nullable=True)
    rating = Column(Float, nullable=True, default=5.0, server_default='5.0')
    total_rides = Column(Integer, nullable=True, default=0, server_default='0')
    daily_earnings = Column(Integer, nullable=True, default=0, server_default='0')
    zone = Column(String, nullable=True, default='douala', server_default='douala')
    # Salariat (chauffeurs employés, pas de commission à la course)
    employee_id = Column(String, nullable=True)
    employment_type = Column(String, nullable=True, default='salaried', server_default='salaried')
    monthly_base_salary = Column(Integer, nullable=True, default=150000, server_default='150000')
    hire_date = Column(Date, nullable=True)
    payout_account = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)