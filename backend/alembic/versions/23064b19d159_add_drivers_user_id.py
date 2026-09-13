"""add drivers.user_id (link driver record to its login account)

Revision ID: 23064b19d159
Revises: d4a1f6c9b2e3
Create Date: 2026-09-13 12:00:00.000000

Fixes a crash: routers/ride_dispatch.py's driver-facing endpoints
(available-rides, accept-ride) filter on Drivers.user_id to find "the
driver record for the currently logged-in user", but that column never
existed on the model — every call raised AttributeError before reaching
the database. Nullable: existing/demo driver rows are simply unlinked
until an admin sets this via the drivers entity endpoints.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '23064b19d159'
down_revision: Union[str, Sequence[str], None] = 'd4a1f6c9b2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('drivers', sa.Column('user_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_drivers_user_id'), 'drivers', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_drivers_user_id'), table_name='drivers')
    op.drop_column('drivers', 'user_id')
