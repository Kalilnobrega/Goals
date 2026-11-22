"""add set techniques: plan per ficha exercise, kind and stages per set

Revision ID: e6a2c9f4b7d1
Revises: d4f8b2e6a9c3
Create Date: 2026-11-22 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6a2c9f4b7d1'
down_revision: Union[str, Sequence[str], None] = 'd4f8b2e6a9c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_workout_exercises', sa.Column('set_plan', sa.JSON(), nullable=True))
    op.add_column('fitness_session_exercises', sa.Column('set_plan', sa.JSON(), nullable=True))
    op.add_column('fitness_sets', sa.Column('kind', sa.String(12), nullable=False, server_default='normal'))
    op.add_column('fitness_sets', sa.Column('stages', sa.JSON(), nullable=True))
    op.add_column('fitness_sets', sa.Column('stage_volume_kg', sa.Numeric(10, 2), nullable=False, server_default=sa.text('0')))
    op.add_column('fitness_sets', sa.Column('stage_reps', sa.Integer(), nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('stage_reps')
        batch_op.drop_column('stage_volume_kg')
        batch_op.drop_column('stages')
        batch_op.drop_column('kind')
    with op.batch_alter_table('fitness_session_exercises') as batch_op:
        batch_op.drop_column('set_plan')
    with op.batch_alter_table('fitness_workout_exercises') as batch_op:
        batch_op.drop_column('set_plan')
