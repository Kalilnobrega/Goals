"""add note to session exercises

Revision ID: e7b3d9f2a1c4
Revises: c3f9a2d7e5b1
Create Date: 2026-11-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7b3d9f2a1c4'
down_revision: Union[str, Sequence[str], None] = 'c3f9a2d7e5b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_session_exercises', sa.Column('note', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('fitness_session_exercises', 'note')
