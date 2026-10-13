"""add position to goals and tasks

Revision ID: e3a7c9d1f5b2
Revises: b5f1c8e2a7d4
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a7c9d1f5b2'
down_revision: Union[str, Sequence[str], None] = 'b5f1c8e2a7d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('tasks', sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    op.execute(
        "UPDATE goals SET position = "
        "(SELECT COUNT(*) FROM goals g2 WHERE g2.user_id = goals.user_id AND g2.id < goals.id)"
    )
    op.execute(
        "UPDATE tasks SET position = "
        "(SELECT COUNT(*) FROM tasks t2 WHERE t2.goals_id = tasks.goals_id AND t2.id < tasks.id)"
    )


def downgrade() -> None:
    op.drop_column('tasks', 'position')
    op.drop_column('goals', 'position')
