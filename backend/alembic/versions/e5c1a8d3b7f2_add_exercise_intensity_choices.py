"""add per user intensity choices for exercises

Revision ID: e5c1a8d3b7f2
Revises: d4b8f2a6c9e3
Create Date: 2026-11-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5c1a8d3b7f2'
down_revision: Union[str, Sequence[str], None] = 'd4b8f2a6c9e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_exercise_intensities',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exercise_id', sa.Integer(), sa.ForeignKey('fitness_exercises.id', ondelete='CASCADE'), nullable=False),
        sa.Column('intensity', sa.String(length=10), nullable=False),
        sa.UniqueConstraint('user_id', 'exercise_id', name='uq_fitness_exercise_intensities'),
    )
    op.create_index('ix_fitness_exercise_intensities_user_id', 'fitness_exercise_intensities', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_fitness_exercise_intensities_user_id', table_name='fitness_exercise_intensities')
    op.drop_table('fitness_exercise_intensities')
