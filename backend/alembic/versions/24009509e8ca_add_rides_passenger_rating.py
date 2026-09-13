"""add rides.passenger_rating/passenger_comment (bidirectional post-ride rating)

Revision ID: 24009509e8ca
Revises: 23064b19d159
Create Date: 2026-09-14 09:00:00.000000

`rides.rating`/`rides.comment` only ever captured the passenger's rating of
the driver. Adds the mirror columns so the driver can rate the passenger
too, matching the two-way rating flow standard ride-hailing apps rely on
for trust/quality signals in both directions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24009509e8ca'
down_revision: Union[str, Sequence[str], None] = '23064b19d159'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('rides', sa.Column('passenger_rating', sa.Integer(), nullable=True))
    op.add_column('rides', sa.Column('passenger_comment', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('rides', 'passenger_comment')
    op.drop_column('rides', 'passenger_rating')
