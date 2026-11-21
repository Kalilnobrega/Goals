"""add optional time to body weight entries

Revision ID: b9e3f6a1c4d7
Revises: b7c2e5a8d1f4
Create Date: 2026-11-21 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9e3f6a1c4d7'
down_revision: Union[str, Sequence[str], None] = 'b7c2e5a8d1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_body_weights', sa.Column('measured_time', sa.Time(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_body_weights') as batch_op:
        batch_op.drop_column('measured_time')
