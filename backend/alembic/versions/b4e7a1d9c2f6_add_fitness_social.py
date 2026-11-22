"""add fitness social: profile visibility, friendships, blocks and reports

Revision ID: b4e7a1d9c2f6
Revises: f5c2a8d4e1b7
Create Date: 2026-11-22 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e7a1d9c2f6'
down_revision: Union[str, Sequence[str], None] = 'f5c2a8d4e1b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_profiles', sa.Column('visibility', sa.String(10), nullable=False, server_default='friends'))
    op.create_table(
        'fitness_friendships',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_low_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_high_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requester_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_low_id', 'user_high_id', name='uq_fitness_friendship_pair'),
    )
    op.create_index('ix_fitness_friendships_user_low_id', 'fitness_friendships', ['user_low_id'])
    op.create_index('ix_fitness_friendships_user_high_id', 'fitness_friendships', ['user_high_id'])
    op.create_table(
        'fitness_blocks',
        sa.Column('blocker_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('blocked_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_blocks_blocked_id', 'fitness_blocks', ['blocked_id'])
    op.create_table(
        'fitness_reports',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('reporter_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reported_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reason', sa.String(20), nullable=False),
        sa.Column('details', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_reports_reporter_id', 'fitness_reports', ['reporter_id'])
    op.create_index('ix_fitness_reports_reported_id', 'fitness_reports', ['reported_id'])


def downgrade() -> None:
    op.drop_table('fitness_reports')
    op.drop_table('fitness_blocks')
    op.drop_table('fitness_friendships')
    with op.batch_alter_table('fitness_profiles') as batch_op:
        batch_op.drop_column('visibility')
