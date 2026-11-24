"""let close friends send cheers to someone training live

Revision ID: f2d8b4c6a9e3
Revises: e9c2a6d8b3f1
Create Date: 2026-11-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2d8b4c6a9e3'
down_revision: Union[str, Sequence[str], None] = 'e9c2a6d8b3f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_live_cheers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('fitness_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_fitness_live_cheers_session_id', 'fitness_live_cheers', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_fitness_live_cheers_session_id', table_name='fitness_live_cheers')
    op.drop_table('fitness_live_cheers')
