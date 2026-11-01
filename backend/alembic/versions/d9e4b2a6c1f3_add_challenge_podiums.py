"""add challenge podiums

Revision ID: d9e4b2a6c1f3
Revises: a8c3e5f7b9d1
Create Date: 2026-11-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e4b2a6c1f3'
down_revision: Union[str, Sequence[str], None] = 'a8c3e5f7b9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'challenge_podiums',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('cycle_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cycle_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['goal_groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('challenge_podiums', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_challenge_podiums_group_id'), ['group_id'], unique=False)

    op.create_table(
        'challenge_placements',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('podium_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('user_name', sa.String(), nullable=False),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('progress', sa.Float(), nullable=True),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['podium_id'], ['challenge_podiums.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('challenge_placements', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_challenge_placements_podium_id'), ['podium_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('challenge_placements', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_challenge_placements_podium_id'))
    op.drop_table('challenge_placements')
    with op.batch_alter_table('challenge_podiums', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_challenge_podiums_group_id'))
    op.drop_table('challenge_podiums')
