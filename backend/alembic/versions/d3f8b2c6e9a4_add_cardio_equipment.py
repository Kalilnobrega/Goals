"""move cardio machines to their own equipment

Revision ID: d3f8b2c6e9a4
Revises: c9e2a7f4b1d3
Create Date: 2026-11-18 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3f8b2c6e9a4'
down_revision: Union[str, Sequence[str], None] = 'c9e2a7f4b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE fitness_exercises SET equipment = 'cardio' WHERE muscle_group = 'cardio' AND equipment = 'machine'"))
    bind.execute(sa.text("UPDATE fitness_session_exercises SET equipment = 'cardio' WHERE muscle_group = 'cardio' AND equipment = 'machine'"))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE fitness_exercises SET equipment = 'machine' WHERE equipment = 'cardio'"))
    bind.execute(sa.text("UPDATE fitness_session_exercises SET equipment = 'machine' WHERE equipment = 'cardio'"))
