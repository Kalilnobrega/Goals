"""add smith bulgarian split squat and glute focused hyperextension

Revision ID: a8c5e2f9d4b7
Revises: f7b4d1e8a3c6
Create Date: 2026-11-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c5e2f9d4b7'
down_revision: Union[str, Sequence[str], None] = 'f7b4d1e8a3c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_EXERCISES = [
    ('agachamento-bulgaro-smith', 'Agachamento búlgaro no Smith', 'quads', 'smith', True,
     (['vastus_lateralis', 'vastus_medialis', 'glute_max'], ['rectus_femoris', 'adductors', 'glute_med'], ['biceps_femoris'])),
    ('banco-romano-gluteo', 'Banco romano com foco em glúteo', 'glutes', 'bodyweight', False,
     (['glute_max'], ['biceps_femoris', 'semitendinosus'], ['lower_back'])),
]

RENAMED = {'peck-deck': ('Peck deck', 'Voador (peck deck)')}

exercises = sa.table(
    'fitness_exercises',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('muscle_group', sa.String),
    sa.column('equipment', sa.String),
    sa.column('is_unilateral', sa.Boolean),
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
        [
            {'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment, 'is_unilateral': unilateral}
            for slug, name, group, equipment, unilateral, _ in added
        ],
    )
    ids = dict(bind.execute(sa.text('SELECT slug, id FROM fitness_exercises WHERE slug IS NOT NULL')).all())
    op.bulk_insert(
        exercise_muscles,
        [
            {'exercise_id': ids[slug], 'muscle': muscle, 'role': role}
            for slug, _, _, _, _, muscles in added
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
