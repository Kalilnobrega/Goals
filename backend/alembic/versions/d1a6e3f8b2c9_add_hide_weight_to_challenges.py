"""add hide weight option to fitness challenges

Revision ID: d1a6e3f8b2c9
Revises: c8f2d5a1e7b3
Create Date: 2026-11-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1a6e3f8b2c9'
down_revision: Union[str, Sequence[str], None] = 'c8f2d5a1e7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_challenges', sa.Column('hide_weight', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('fitness_challenges') as batch_op:
        batch_op.drop_column('hide_weight')
