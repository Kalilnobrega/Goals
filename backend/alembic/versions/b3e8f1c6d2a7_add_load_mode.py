"""add total or per side load mode to workout and session exercises

Revision ID: b3e8f1c6d2a7
Revises: a9d4e7b2c5f1
Create Date: 2026-11-19 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3e8f1c6d2a7'
down_revision: Union[str, Sequence[str], None] = 'a9d4e7b2c5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_workout_exercises', sa.Column('load_mode', sa.String(length=5), nullable=True))
    op.add_column('fitness_session_exercises', sa.Column('load_mode', sa.String(length=5), nullable=True))


def downgrade() -> None:
    for table in ('fitness_session_exercises', 'fitness_workout_exercises'):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column('load_mode')
