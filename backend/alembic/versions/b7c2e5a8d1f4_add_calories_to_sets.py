"""add optional calories to cardio sets

Revision ID: b7c2e5a8d1f4
Revises: b5a8d1f4e7c2
Create Date: 2026-11-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c2e5a8d1f4'
down_revision: Union[str, Sequence[str], None] = 'b5a8d1f4e7c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_sets', sa.Column('calories', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('calories')
