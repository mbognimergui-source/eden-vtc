"""add payroll, fleet kpi settings, driver salary fields

Revision ID: d4a1f6c9b2e3
Revises: 6c6d1778fac1
Create Date: 2026-08-29 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a1f6c9b2e3'
down_revision: Union[str, Sequence[str], None] = '6c6d1778fac1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### Salariat chauffeurs ###
    op.add_column('drivers', sa.Column('employee_id', sa.String(), nullable=True))
    op.add_column('drivers', sa.Column('employment_type', sa.String(), server_default='salaried', nullable=True))
    op.add_column('drivers', sa.Column('monthly_base_salary', sa.Integer(), server_default='150000', nullable=True))
    op.add_column('drivers', sa.Column('hire_date', sa.Date(), nullable=True))
    op.add_column('drivers', sa.Column('payout_account', sa.String(), nullable=True))

    # ### Bulletins de paie ###
    op.create_table(
        'driver_payroll',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('driver_id', sa.Integer(), nullable=False),
        sa.Column('period_year', sa.Integer(), nullable=False),
        sa.Column('period_month', sa.Integer(), nullable=False),
        sa.Column('base_salary', sa.Integer(), server_default='0', nullable=False),
        sa.Column('worked_days', sa.Integer(), server_default='0', nullable=True),
        sa.Column('daily_target', sa.Integer(), server_default='30000', nullable=True),
        sa.Column('days_target_met', sa.Integer(), server_default='0', nullable=True),
        sa.Column('total_ride_revenue', sa.Integer(), server_default='0', nullable=True),
        sa.Column('performance_bonus', sa.Integer(), server_default='0', nullable=True),
        sa.Column('deductions', sa.Integer(), server_default='0', nullable=True),
        sa.Column('deduction_reason', sa.String(), nullable=True),
        sa.Column('net_pay', sa.Integer(), server_default='0', nullable=False),
        sa.Column('status', sa.String(), server_default='draft', nullable=True),
        sa.Column('payment_reference', sa.String(), nullable=True),
        sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_driver_payroll_id'), 'driver_payroll', ['id'], unique=False)
    op.create_index(op.f('ix_driver_payroll_driver_id'), 'driver_payroll', ['driver_id'], unique=False)

    # ### Paramètres de l'alerte flotte (règle -15%) ###
    op.create_table(
        'fleet_kpi_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('daily_target', sa.Integer(), server_default='30000', nullable=False),
        sa.Column('alert_threshold', sa.Integer(), server_default='25500', nullable=False),
        sa.Column('window_days', sa.Integer(), server_default='90', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_fleet_kpi_settings_id'), 'fleet_kpi_settings', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_fleet_kpi_settings_id'), table_name='fleet_kpi_settings')
    op.drop_table('fleet_kpi_settings')

    op.drop_index(op.f('ix_driver_payroll_driver_id'), table_name='driver_payroll')
    op.drop_index(op.f('ix_driver_payroll_id'), table_name='driver_payroll')
    op.drop_table('driver_payroll')

    op.drop_column('drivers', 'payout_account')
    op.drop_column('drivers', 'hire_date')
    op.drop_column('drivers', 'monthly_base_salary')
    op.drop_column('drivers', 'employment_type')
    op.drop_column('drivers', 'employee_id')
