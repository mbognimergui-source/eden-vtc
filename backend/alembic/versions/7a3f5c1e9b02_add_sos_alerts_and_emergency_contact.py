"""add sos_alerts table and passengers.emergency_contact_*

Revision ID: 7a3f5c1e9b02
Revises: 24009509e8ca
Create Date: 2026-09-13 16:00:00.000000

Ajoute le bouton SOS : une table `sos_alerts` pour journaliser chaque
déclenchement (par le passager ou le chauffeur) avec la position au moment
de l'alerte, et deux colonnes sur `passengers` pour le contact de confiance
prévenu automatiquement.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a3f5c1e9b02'
down_revision: Union[str, Sequence[str], None] = '24009509e8ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('passengers', sa.Column('emergency_contact_name', sa.String(), nullable=True))
    op.add_column('passengers', sa.Column('emergency_contact_phone', sa.String(), nullable=True))

    op.create_table(
        'sos_alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ride_id', sa.Integer(), nullable=True),
        sa.Column('passenger_id', sa.Integer(), nullable=True),
        sa.Column('driver_id', sa.Integer(), nullable=True),
        sa.Column('triggered_by', sa.String(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='active'),
        sa.Column('resolved_by', sa.String(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sos_alerts_id'), 'sos_alerts', ['id'], unique=False)
    op.create_index(op.f('ix_sos_alerts_ride_id'), 'sos_alerts', ['ride_id'], unique=False)
    op.create_index(op.f('ix_sos_alerts_passenger_id'), 'sos_alerts', ['passenger_id'], unique=False)
    op.create_index(op.f('ix_sos_alerts_driver_id'), 'sos_alerts', ['driver_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_sos_alerts_driver_id'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_passenger_id'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_ride_id'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_id'), table_name='sos_alerts')
    op.drop_table('sos_alerts')
    op.drop_column('passengers', 'emergency_contact_phone')
    op.drop_column('passengers', 'emergency_contact_name')
