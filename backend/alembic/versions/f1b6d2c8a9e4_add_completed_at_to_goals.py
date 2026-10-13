"""add completed_at to goals

Revision ID: f1b6d2c8a9e4
Revises: e3a7c9d1f5b2
Create Date: 2026-10-13 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1b6d2c8a9e4'
down_revision: Union[str, Sequence[str], None] = 'e3a7c9d1f5b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    completed = bind.execute(
        sa.text("SELECT id, \"create\" FROM goals WHERE status = 'COMPLETED'")
    ).fetchall()
    for goal_id, created in completed:
        last_task = bind.execute(
            sa.text(
                "SELECT MAX(tc.completed_at) FROM task_completions tc "
                "JOIN tasks t ON t.id = tc.task_id WHERE t.goals_id = :id"
            ),
            {"id": goal_id},
        ).scalar()
        last_entry = bind.execute(
            sa.text("SELECT MAX(created_at) FROM goal_entries WHERE goal_id = :id"),
            {"id": goal_id},
        ).scalar()
        moments = [m for m in (last_task, last_entry) if m is not None]
        completed_at = max(moments) if moments else created
        bind.execute(
            sa.text("UPDATE goals SET completed_at = :at WHERE id = :id"),
            {"at": completed_at, "id": goal_id},
        )


def downgrade() -> None:
    op.drop_column('goals', 'completed_at')
