"""add challenge chat messages and read marker

Revision ID: c2f8b5d1e9a4
Revises: b8e4f1a6c3d7
Create Date: 2026-11-24 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2f8b5d1e9a4'
down_revision: Union[str, Sequence[str], None] = 'b8e4f1a6c3d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_challenge_members', sa.Column('chat_read_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'fitness_challenge_messages',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('fitness_challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_challenge_messages_challenge_id', 'fitness_challenge_messages', ['challenge_id'])
    op.create_index('ix_fitness_challenge_messages_user_id', 'fitness_challenge_messages', ['user_id'])
    op.create_index('ix_fitness_challenge_messages_created_at', 'fitness_challenge_messages', ['created_at'])


def downgrade() -> None:
    op.drop_table('fitness_challenge_messages')
    with op.batch_alter_table('fitness_challenge_members') as batch_op:
        batch_op.drop_column('chat_read_at')
