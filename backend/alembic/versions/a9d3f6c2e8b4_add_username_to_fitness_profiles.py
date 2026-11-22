"""add username to fitness profiles

Revision ID: a9d3f6c2e8b4
Revises: e6a2c9f4b7d1
Create Date: 2026-11-22 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9d3f6c2e8b4'
down_revision: Union[str, Sequence[str], None] = 'e6a2c9f4b7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_profiles', sa.Column('username', sa.String(20), nullable=True))
    op.create_index('ix_fitness_profiles_username', 'fitness_profiles', ['username'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_fitness_profiles_username', table_name='fitness_profiles')
    with op.batch_alter_table('fitness_profiles') as batch_op:
        batch_op.drop_column('username')
