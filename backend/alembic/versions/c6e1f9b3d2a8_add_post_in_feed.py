"""let workout posts and check-ins stay only in challenges

Revision ID: c6e1f9b3d2a8
Revises: b7d3e5a1c8f2
Create Date: 2026-11-25 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c6e1f9b3d2a8'
down_revision: Union[str, Sequence[str], None] = 'b7d3e5a1c8f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_posts', sa.Column('in_feed', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('fitness_posts', 'in_feed')
