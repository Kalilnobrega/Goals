"""add longest_before_today to streaks

Revision ID: 7d2e9a41c6b3
Revises: c48b3a1f2a54
Create Date: 2026-10-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7d2e9a41c6b3'
down_revision: Union[str, Sequence[str], None] = 'c48b3a1f2a54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('streaks', sa.Column('longest_before_today', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('streaks', 'longest_before_today')
