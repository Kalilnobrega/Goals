"""add removals so people removed from a challenge can't rejoin by link

Revision ID: c4d9a2e6f1b3
Revises: e7b1d4f9a2c6
Create Date: 2026-11-24 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d9a2e6f1b3'
down_revision: Union[str, Sequence[str], None] = 'e7b1d4f9a2c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_challenge_removals',
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('fitness_challenges.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('removed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_challenge_removals_user_id', 'fitness_challenge_removals', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_fitness_challenge_removals_user_id', table_name='fitness_challenge_removals')
    op.drop_table('fitness_challenge_removals')
