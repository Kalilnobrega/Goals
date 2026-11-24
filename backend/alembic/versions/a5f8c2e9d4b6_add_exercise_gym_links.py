"""let an exercise share loads, records and progress across a chosen set of gyms

Revision ID: a5f8c2e9d4b6
Revises: d8e2b6f4a1c9
Create Date: 2026-11-25 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a5f8c2e9d4b6'
down_revision: Union[str, Sequence[str], None] = 'd8e2b6f4a1c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_exercise_gym_links',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('exercise_id', sa.Integer(), sa.ForeignKey('fitness_exercises.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('gym_id', sa.Integer(), sa.ForeignKey('fitness_gyms.id', ondelete='CASCADE'), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table('fitness_exercise_gym_links')
