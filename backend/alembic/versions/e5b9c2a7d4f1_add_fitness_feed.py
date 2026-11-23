"""add fitness feed: posts, media, reactions and comments

Revision ID: e5b9c2a7d4f1
Revises: d1a6e3f8b2c9
Create Date: 2026-11-23 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5b9c2a7d4f1'
down_revision: Union[str, Sequence[str], None] = 'd1a6e3f8b2c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_posts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('fitness_sessions.id', ondelete='CASCADE'), nullable=True),
        sa.Column('caption', sa.String(500), nullable=True),
        sa.Column('activity', sa.String(40), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('session_id', name='uq_fitness_posts_session_id'),
    )
    op.create_index('ix_fitness_posts_user_id', 'fitness_posts', ['user_id'])
    op.create_index('ix_fitness_posts_created_at', 'fitness_posts', ['created_at'])
    op.create_table(
        'fitness_media',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('fitness_posts.id', ondelete='CASCADE'), nullable=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('storage_key', sa.String(200), nullable=False),
        sa.Column('content_type', sa.String(30), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('taken_on', sa.Date(), nullable=True),
        sa.Column('note', sa.String(140), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('storage_key', name='uq_fitness_media_storage_key'),
    )
    op.create_index('ix_fitness_media_user_id', 'fitness_media', ['user_id'])
    op.create_index('ix_fitness_media_post_id', 'fitness_media', ['post_id'])
    op.create_table(
        'fitness_post_reactions',
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('fitness_posts.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_post_reactions_user_id', 'fitness_post_reactions', ['user_id'])
    op.create_table(
        'fitness_post_comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('fitness_posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_post_comments_post_id', 'fitness_post_comments', ['post_id'])
    op.create_index('ix_fitness_post_comments_user_id', 'fitness_post_comments', ['user_id'])
    op.add_column('fitness_reports', sa.Column('post_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_reports') as batch_op:
        batch_op.drop_column('post_id')
    op.drop_table('fitness_post_comments')
    op.drop_table('fitness_post_reactions')
    op.drop_table('fitness_media')
    op.drop_table('fitness_posts')
