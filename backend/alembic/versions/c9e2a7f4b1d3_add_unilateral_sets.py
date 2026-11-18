"""add unilateral exercises and set sides

Revision ID: c9e2a7f4b1d3
Revises: b6d1f3a8c2e7
Create Date: 2026-11-18 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9e2a7f4b1d3'
down_revision: Union[str, Sequence[str], None] = 'b6d1f3a8c2e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UNILATERAL = [
    'remada-unilateral', 'remada-unilateral-cabo', 'puxada-unilateral', 'triceps-unilateral-cabo', 'triceps-coice',
    'rosca-concentrada', 'rosca-bayesiana', 'agachamento-bulgaro', 'afundo', 'afundo-smith', 'passada',
    'subida-banco', 'panturrilha-unilateral', 'abducao-cabo', 'aducao-cabo', 'coice-cabo', 'coice-maquina',
]


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('is_unilateral', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('fitness_workout_exercises', sa.Column('unilateral', sa.Boolean(), nullable=True))
    op.add_column('fitness_session_exercises', sa.Column('unilateral', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('fitness_sets', sa.Column('side', sa.String(length=5), nullable=True))
    op.get_bind().execute(
        sa.text('UPDATE fitness_exercises SET is_unilateral = true WHERE user_id IS NULL AND slug IN :slugs')
        .bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': UNILATERAL},
    )


def downgrade() -> None:
    with op.batch_alter_table('fitness_sets') as batch_op:
        batch_op.drop_column('side')
    with op.batch_alter_table('fitness_session_exercises') as batch_op:
        batch_op.drop_column('unilateral')
    with op.batch_alter_table('fitness_workout_exercises') as batch_op:
        batch_op.drop_column('unilateral')
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('is_unilateral')
