"""index foreign keys used by goal and task lookups

Revision ID: b7e2c9d4f1a3
Revises: a1d4f8c2e6b9
Create Date: 2026-11-07 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b7e2c9d4f1a3'
down_revision: Union[str, Sequence[str], None] = 'a1d4f8c2e6b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ('ix_goals_user_id', 'goals', 'user_id'),
    ('ix_tasks_goals_id', 'tasks', 'goals_id'),
    ('ix_task_completions_task_id', 'task_completions', 'task_id'),
    ('ix_goal_cycle_logs_goal_id', 'goal_cycle_logs', 'goal_id'),
]


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.create_index(name, table, [column], unique=False)


def downgrade() -> None:
    for name, table, _ in INDEXES:
        op.drop_index(name, table_name=table)
