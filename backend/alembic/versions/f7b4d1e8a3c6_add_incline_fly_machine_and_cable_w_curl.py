"""add incline fly plate loaded machine and cable w bar curl

Revision ID: f7b4d1e8a3c6
Revises: e5a1c3f7d2b8
Create Date: 2026-11-18 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b4d1e8a3c6'
down_revision: Union[str, Sequence[str], None] = 'e5a1c3f7d2b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_EXERCISES = [
    ('crucifixo-inclinado-articulado', 'Crucifixo inclinado articulado', 'chest', 'plate_loaded',
     (['chest_upper'], ['chest_mid'], ['delts_front'])),
    ('rosca-polia-w', 'Rosca na polia com barra W', 'biceps', 'cable',
     (['biceps'], ['brachialis'], ['brachioradialis', 'forearm_flexors'])),
]

RENAMED = {'puxada-neutra': ('Puxada pegada neutra', 'Puxada pegada neutra (triângulo)')}

exercises = sa.table(
    'fitness_exercises',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('muscle_group', sa.String),
    sa.column('equipment', sa.String),
)
exercise_muscles = sa.table(
    'fitness_exercise_muscles',
    sa.column('exercise_id', sa.Integer),
    sa.column('muscle', sa.String),
    sa.column('role', sa.String),
)


def rename(bind, index: int):
    for slug, names in RENAMED.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET name = :name WHERE slug = :slug AND user_id IS NULL'),
            {'name': names[index], 'slug': slug},
        )


def upgrade() -> None:
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text('SELECT slug FROM fitness_exercises WHERE slug IS NOT NULL'))}
    added = [item for item in NEW_EXERCISES if item[0] not in existing]
    op.bulk_insert(
        exercises,
        [{'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment} for slug, name, group, equipment, _ in added],
    )
    ids = dict(bind.execute(sa.text('SELECT slug, id FROM fitness_exercises WHERE slug IS NOT NULL')).all())
    op.bulk_insert(
        exercise_muscles,
        [
            {'exercise_id': ids[slug], 'muscle': muscle, 'role': role}
            for slug, _, _, _, muscles in added
            for role, keys in zip(('primary', 'secondary', 'auxiliary'), muscles)
            for muscle in keys
        ],
    )
    rename(bind, 1)


def downgrade() -> None:
    bind = op.get_bind()
    rename(bind, 0)
    slugs = [item[0] for item in NEW_EXERCISES]
    expanding = sa.bindparam('slugs', expanding=True)
    bind.execute(
        sa.text(
            'DELETE FROM fitness_exercise_muscles WHERE exercise_id IN '
            '(SELECT id FROM fitness_exercises WHERE slug IN :slugs)'
        ).bindparams(expanding),
        {'slugs': slugs},
    )
    bind.execute(sa.text('DELETE FROM fitness_exercises WHERE slug IN :slugs').bindparams(expanding), {'slugs': slugs})
