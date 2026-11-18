"""add fitness goals

Revision ID: f2c8a4d6b9e1
Revises: e7b3d9f2a1c4
Create Date: 2026-11-18 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2c8a4d6b9e1'
down_revision: Union[str, Sequence[str], None] = 'e7b3d9f2a1c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_goals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('exercise_id', sa.Integer(), nullable=True),
        sa.Column('target_kg', sa.Numeric(6, 2), nullable=False),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('start_kg', sa.Numeric(6, 2), nullable=True),
        sa.Column('start_on', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['exercise_id'], ['fitness_exercises.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_fitness_goals_user_id'), 'fitness_goals', ['user_id'], unique=False)
    op.create_index(op.f('ix_fitness_goals_exercise_id'), 'fitness_goals', ['exercise_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_fitness_goals_exercise_id'), table_name='fitness_goals')
    op.drop_index(op.f('ix_fitness_goals_user_id'), table_name='fitness_goals')
    op.drop_table('fitness_goals')
