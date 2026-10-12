"""add numeric goals and task weekdays

Revision ID: b5f1c8e2a7d4
Revises: 7d2e9a41c6b3
Create Date: 2026-10-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5f1c8e2a7d4'
down_revision: Union[str, Sequence[str], None] = '7d2e9a41c6b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('target_value', sa.Float(), nullable=True))
    op.add_column('goals', sa.Column('start_value', sa.Float(), nullable=True))
    op.add_column('goals', sa.Column('unit', sa.String(length=20), nullable=True))
    op.add_column('goals', sa.Column('numeric_mode', sa.String(length=10), nullable=True))
    op.add_column('tasks', sa.Column('recurrence_weekdays', sa.JSON(), nullable=True))
    op.add_column('goal_cycle_logs', sa.Column('target_value', sa.Float(), nullable=True))
    op.add_column('goal_cycle_logs', sa.Column('achieved_value', sa.Float(), nullable=True))
    op.create_table(
        'goal_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('note', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_goal_entries_goal_id'), 'goal_entries', ['goal_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_goal_entries_goal_id'), table_name='goal_entries')
    op.drop_table('goal_entries')
    op.drop_column('goal_cycle_logs', 'achieved_value')
    op.drop_column('goal_cycle_logs', 'target_value')
    op.drop_column('tasks', 'recurrence_weekdays')
    op.drop_column('goals', 'numeric_mode')
    op.drop_column('goals', 'unit')
    op.drop_column('goals', 'start_value')
    op.drop_column('goals', 'target_value')
