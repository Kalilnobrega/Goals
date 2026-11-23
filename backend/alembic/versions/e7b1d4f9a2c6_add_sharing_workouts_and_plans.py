"""add sharing of workouts and plans in posts and to friends

Revision ID: e7b1d4f9a2c6
Revises: d9a3c7e2f4b8
Create Date: 2026-11-25 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7b1d4f9a2c6'
down_revision: Union[str, Sequence[str], None] = 'd9a3c7e2f4b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fitness_posts', sa.Column('shared_kind', sa.String(10), nullable=True))
    op.add_column('fitness_posts', sa.Column('shared', sa.JSON(), nullable=True))
    op.create_table(
        'fitness_shared_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('message', sa.String(300), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_shared_items_sender_id', 'fitness_shared_items', ['sender_id'])
    op.create_index('ix_fitness_shared_items_recipient_id', 'fitness_shared_items', ['recipient_id'])
    with op.batch_alter_table('fitness_notifications') as batch_op:
        batch_op.add_column(sa.Column('share_id', sa.Integer(), sa.ForeignKey('fitness_shared_items.id', name='fk_fitness_notifications_share_id', ondelete='CASCADE'), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_notifications') as batch_op:
        batch_op.drop_constraint('fk_fitness_notifications_share_id', type_='foreignkey')
        batch_op.drop_column('share_id')
    op.drop_table('fitness_shared_items')
    with op.batch_alter_table('fitness_posts') as batch_op:
        batch_op.drop_column('shared')
        batch_op.drop_column('shared_kind')
