"""add close friends and weight sharing option

Revision ID: d9a3c7e2f4b8
Revises: c2f8b5d1e9a4
Create Date: 2026-11-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9a3c7e2f4b8'
down_revision: Union[str, Sequence[str], None] = 'c2f8b5d1e9a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_profiles', sa.Column('share_weight_close', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'fitness_close_friends',
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('friend_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_close_friends_friend_id', 'fitness_close_friends', ['friend_id'])


def downgrade() -> None:
    op.drop_table('fitness_close_friends')
    with op.batch_alter_table('fitness_profiles') as batch_op:
        batch_op.drop_column('share_weight_close')
