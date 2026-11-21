"""add optional treadmill incline to cardio sets

Revision ID: c1a4d7f2b5e8
Revises: b9e3f6a1c4d7
Create Date: 2026-11-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a4d7f2b5e8'
down_revision: Union[str, Sequence[str], None] = 'b9e3f6a1c4d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_sets', sa.Column('incline_pct', sa.Numeric(3, 1), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('incline_pct')
