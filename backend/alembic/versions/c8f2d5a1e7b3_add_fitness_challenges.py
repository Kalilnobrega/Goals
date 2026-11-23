"""add fitness challenges, members and invites

Revision ID: c8f2d5a1e7b3
Revises: b4e7a1d9c2f6
Create Date: 2026-11-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8f2d5a1e7b3'
down_revision: Union[str, Sequence[str], None] = 'b4e7a1d9c2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_challenges',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(60), nullable=False),
        sa.Column('description', sa.String(300), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=False),
        sa.Column('min_rule', sa.JSON(), nullable=True),
        sa.Column('invite_code', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_challenges_owner_id', 'fitness_challenges', ['owner_id'])
    op.create_index('ix_fitness_challenges_invite_code', 'fitness_challenges', ['invite_code'], unique=True)
    op.create_table(
        'fitness_challenge_members',
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('fitness_challenges.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_challenge_members_user_id', 'fitness_challenge_members', ['user_id'])
    op.create_table(
        'fitness_challenge_invites',
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('fitness_challenges.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('invited_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_challenge_invites_user_id', 'fitness_challenge_invites', ['user_id'])


def downgrade() -> None:
    op.drop_table('fitness_challenge_invites')
    op.drop_table('fitness_challenge_members')
    op.drop_table('fitness_challenges')
