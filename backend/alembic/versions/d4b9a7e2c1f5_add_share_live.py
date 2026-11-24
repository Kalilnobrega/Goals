"""let close friends follow a workout live unless the owner turns it off

Revision ID: d4b9a7e2c1f5
Revises: c6e1f9b3d2a8
Create Date: 2026-11-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4b9a7e2c1f5'
down_revision: Union[str, Sequence[str], None] = 'c6e1f9b3d2a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_profiles', sa.Column('share_live', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('fitness_profiles', 'share_live')
