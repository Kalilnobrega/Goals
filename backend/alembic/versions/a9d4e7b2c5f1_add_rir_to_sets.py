"""add optional reps in reserve to sets

Revision ID: a9d4e7b2c5f1
Revises: f8b5d2a7c4e1
Create Date: 2026-11-19 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9d4e7b2c5f1'
down_revision: Union[str, Sequence[str], None] = 'f8b5d2a7c4e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_sets', sa.Column('rir', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('rir')
