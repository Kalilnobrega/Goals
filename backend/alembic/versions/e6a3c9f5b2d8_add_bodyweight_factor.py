"""add the share of body weight lifted by bodyweight exercises

Revision ID: e6a3c9f5b2d8
Revises: d4f1b7e3a9c2
Create Date: 2026-11-19 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6a3c9f5b2d8'
down_revision: Union[str, Sequence[str], None] = 'd4f1b7e3a9c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FACTORS = {
    0.95: ['mergulho', 'paralela-peito', 'barra-fixa', 'barra-fixa-supinada'],
    0.65: ['flexao'],
    0.5: ['banco-romano', 'banco-romano-gluteo', 'stiff-romeno-peso-corporal'],
    0.4: ['ponte-gluteo'],
    0.35: ['elevacao-pernas'],
    0.3: ['abdominal-supra', 'abdominal-infra', 'abdominal-obliquo', 'rotacao-russa'],
    0.0: ['prancha', 'prancha-lateral'],
}


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('bodyweight_factor', sa.Numeric(3, 2), nullable=True))
    bind = op.get_bind()
    for factor, slugs in FACTORS.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET bodyweight_factor = :factor WHERE user_id IS NULL AND slug IN :slugs')
            .bindparams(sa.bindparam('slugs', expanding=True)),
            {'factor': factor, 'slugs': slugs},
        )


def downgrade() -> None:
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('bodyweight_factor')
