"""add gyms, the gym of each session and per exercise gym settings

Revision ID: f5c2a8d4e1b7
Revises: a9d3f6c2e8b4
Create Date: 2026-11-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5c2a8d4e1b7'
down_revision: Union[str, Sequence[str], None] = 'a9d3f6c2e8b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fitness_gyms',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(60), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_fitness_gyms_user_id', 'fitness_gyms', ['user_id'])
    op.create_table(
        'fitness_exercise_gym_settings',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('exercise_id', sa.Integer(), sa.ForeignKey('fitness_exercises.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('gym_specific', sa.Boolean(), nullable=False),
    )
    with op.batch_alter_table('fitness_sessions') as batch_op:
        batch_op.add_column(sa.Column('gym_id', sa.Integer(), sa.ForeignKey('fitness_gyms.id', name='fk_fitness_sessions_gym_id', ondelete='SET NULL'), nullable=True))
        batch_op.create_index('ix_fitness_sessions_gym_id', ['gym_id'])
    with op.batch_alter_table('fitness_profiles') as batch_op:
        batch_op.add_column(sa.Column('current_gym_id', sa.Integer(), sa.ForeignKey('fitness_gyms.id', name='fk_fitness_profiles_current_gym_id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('fitness_profiles') as batch_op:
        batch_op.drop_constraint('fk_fitness_profiles_current_gym_id', type_='foreignkey')
        batch_op.drop_column('current_gym_id')
    with op.batch_alter_table('fitness_sessions') as batch_op:
        batch_op.drop_index('ix_fitness_sessions_gym_id')
        batch_op.drop_constraint('fk_fitness_sessions_gym_id', type_='foreignkey')
        batch_op.drop_column('gym_id')
    op.drop_table('fitness_exercise_gym_settings')
    op.drop_table('fitness_gyms')
