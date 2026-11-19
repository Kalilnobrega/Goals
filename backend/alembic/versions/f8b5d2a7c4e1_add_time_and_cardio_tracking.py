"""add time and cardio tracking to exercises and sets

Revision ID: f8b5d2a7c4e1
Revises: e6a3c9f5b2d8
Create Date: 2026-11-19 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8b5d2a7c4e1'
down_revision: Union[str, Sequence[str], None] = 'e6a3c9f5b2d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TIMED = ['prancha', 'prancha-lateral']


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('tracking', sa.String(length=10), server_default='reps', nullable=False))
    op.add_column('fitness_session_exercises', sa.Column('tracking', sa.String(length=10), server_default='reps', nullable=False))
    op.add_column('fitness_sets', sa.Column('duration_seconds', sa.Integer(), nullable=True))
    op.add_column('fitness_sets', sa.Column('distance_km', sa.Numeric(6, 2), nullable=True))
    op.add_column('fitness_sets', sa.Column('speed_kmh', sa.Numeric(4, 1), nullable=True))
    op.add_column('fitness_sets', sa.Column('level', sa.Integer(), nullable=True))
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE fitness_exercises SET tracking = 'cardio' WHERE muscle_group = 'cardio'"))
    bind.execute(
        sa.text("UPDATE fitness_exercises SET tracking = 'time' WHERE user_id IS NULL AND slug IN :slugs")
        .bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': TIMED},
    )
    bind.execute(sa.text(
        "UPDATE fitness_session_exercises SET tracking = "
        "(SELECT tracking FROM fitness_exercises WHERE fitness_exercises.id = fitness_session_exercises.exercise_id) "
        "WHERE exercise_id IN (SELECT id FROM fitness_exercises WHERE tracking <> 'reps')"
    ))


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('level')
        batch_op.drop_column('speed_kmh')
        batch_op.drop_column('distance_km')
        batch_op.drop_column('duration_seconds')
    with op.batch_alter_table('fitness_session_exercises') as batch_op:
        batch_op.drop_column('tracking')
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('tracking')
