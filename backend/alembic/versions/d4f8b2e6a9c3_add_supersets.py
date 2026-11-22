"""add superset groups to workout and session exercises

Revision ID: d4f8b2e6a9c3
Revises: c1a4d7f2b5e8
Create Date: 2026-11-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f8b2e6a9c3'
down_revision: Union[str, Sequence[str], None] = 'c1a4d7f2b5e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_workout_exercises', sa.Column('superset', sa.Integer(), nullable=True))
    op.add_column('fitness_session_exercises', sa.Column('superset', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_session_exercises') as batch_op:
        batch_op.drop_column('superset')
    with op.batch_alter_table('fitness_workout_exercises') as batch_op:
        batch_op.drop_column('superset')
