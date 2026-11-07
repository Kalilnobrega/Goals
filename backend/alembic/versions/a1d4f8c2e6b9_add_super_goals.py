"""add super goals

Revision ID: a1d4f8c2e6b9
Revises: d9e4b2a6c1f3
Create Date: 2026-11-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1d4f8c2e6b9'
down_revision: Union[str, Sequence[str], None] = 'd9e4b2a6c1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'super_goals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=60), nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('super_goals', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_super_goals_user_id'), ['user_id'], unique=False)

    op.create_table(
        'super_goal_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('super_goal_id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['super_goal_id'], ['super_goals.id'], ),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'goal_id'),
    )
    with op.batch_alter_table('super_goal_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_super_goal_items_super_goal_id'), ['super_goal_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_super_goal_items_goal_id'), ['goal_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('super_goal_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_super_goal_items_goal_id'))
        batch_op.drop_index(batch_op.f('ix_super_goal_items_super_goal_id'))
    op.drop_table('super_goal_items')
    with op.batch_alter_table('super_goals', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_super_goals_user_id'))
    op.drop_table('super_goals')
