"""mark more default exercises as unilateral

Revision ID: e5a1c3f7d2b8
Revises: d3f8b2c6e9a4
Create Date: 2026-11-18 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a1c3f7d2b8'
down_revision: Union[str, Sequence[str], None] = 'd3f8b2c6e9a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SLUGS = ['pull-around', 'elevacao-lateral-cabo', 'rosca-scott-halter', 'prancha-lateral']


def mark(value: bool):
    op.get_bind().execute(
        sa.text('UPDATE fitness_exercises SET is_unilateral = :value WHERE user_id IS NULL AND slug IN :slugs')
        .bindparams(sa.bindparam('slugs', expanding=True)),
        {'value': value, 'slugs': SLUGS},
    )


def upgrade() -> None:
    mark(True)


def downgrade() -> None:
    mark(False)
