"""add fitness notifications

Revision ID: a7d2e9c4f6b1
Revises: f3c7a9e1b5d2
Create Date: 2026-11-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7d2e9c4f6b1'
down_revision: Union[str, Sequence[str], None] = 'f3c7a9e1b5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_notifications',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('fitness_posts.id', ondelete='CASCADE'), nullable=True),
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('fitness_challenges.id', ondelete='CASCADE'), nullable=True),
        sa.Column('comment_id', sa.Integer(), sa.ForeignKey('fitness_post_comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('detail', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_fitness_notifications_user_id', 'fitness_notifications', ['user_id'])
    op.create_index('ix_fitness_notifications_created_at', 'fitness_notifications', ['created_at'])


def downgrade() -> None:
    op.drop_table('fitness_notifications')
