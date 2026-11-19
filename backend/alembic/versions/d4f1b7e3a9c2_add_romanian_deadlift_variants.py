"""add romanian deadlift dumbbell and bodyweight variants

Revision ID: d4f1b7e3a9c2
Revises: c2e8a5d1f7b3
Create Date: 2026-11-19 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f1b7e3a9c2'
down_revision: Union[str, Sequence[str], None] = 'c2e8a5d1f7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


HINGE = (['biceps_femoris', 'semitendinosus'], ['glute_max', 'lower_back'], ['adductors', 'forearm_flexors'])

NEW_EXERCISES = [
    ('stiff-romeno-halteres', 'Stiff romeno com halteres', 'hamstrings', 'dumbbell', HINGE),
    ('stiff-romeno-peso-corporal', 'Stiff romeno com peso corporal', 'hamstrings', 'bodyweight',
     (['biceps_femoris', 'semitendinosus'], ['glute_max'], ['lower_back', 'glute_med'])),
]

FAMILY = 'Stiff romeno'
FAMILY_SLUGS = ['stiff-romeno', 'stiff-romeno-halteres', 'stiff-romeno-peso-corporal']

exercises = sa.table(
    'fitness_exercises',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('muscle_group', sa.String),
    sa.column('equipment', sa.String),
    sa.column('family', sa.String),
)
exercise_muscles = sa.table(
    'fitness_exercise_muscles',
    sa.column('exercise_id', sa.Integer),
    sa.column('muscle', sa.String),
    sa.column('role', sa.String),
)


def by_slugs(sql: str):
    return sa.text(sql).bindparams(sa.bindparam('slugs', expanding=True))


def upgrade() -> None:
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text('SELECT slug FROM fitness_exercises WHERE slug IS NOT NULL'))}
    added = [item for item in NEW_EXERCISES if item[0] not in existing]
    op.bulk_insert(
        exercises,
        [{'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment, 'family': FAMILY} for slug, name, group, equipment, _ in added],
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
    bind.execute(by_slugs('UPDATE fitness_exercises SET family = :family WHERE user_id IS NULL AND slug IN :slugs'),
                 {'family': FAMILY, 'slugs': FAMILY_SLUGS})


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(by_slugs('UPDATE fitness_exercises SET family = NULL WHERE user_id IS NULL AND slug IN :slugs'), {'slugs': FAMILY_SLUGS})
    slugs = [item[0] for item in NEW_EXERCISES]
    bind.execute(by_slugs('DELETE FROM fitness_exercise_muscles WHERE exercise_id IN (SELECT id FROM fitness_exercises WHERE slug IN :slugs)'),
                 {'slugs': slugs})
    bind.execute(by_slugs('DELETE FROM fitness_exercises WHERE slug IN :slugs'), {'slugs': slugs})
