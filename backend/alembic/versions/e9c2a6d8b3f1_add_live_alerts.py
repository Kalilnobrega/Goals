"""let close friends ask to be told when someone starts a workout

Revision ID: e9c2a6d8b3f1
Revises: d4b9a7e2c1f5
Create Date: 2026-11-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e9c2a6d8b3f1'
down_revision: Union[str, Sequence[str], None] = 'd4b9a7e2c1f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_live_alerts',
        sa.Column('watcher_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    )
    op.create_index('ix_fitness_live_alerts_owner_id', 'fitness_live_alerts', ['owner_id'])


def downgrade() -> None:
    op.drop_index('ix_fitness_live_alerts_owner_id', table_name='fitness_live_alerts')
    op.drop_table('fitness_live_alerts')
