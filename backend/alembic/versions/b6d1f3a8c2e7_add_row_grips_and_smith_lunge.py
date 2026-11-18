"""add row grip variations and smith lunge

Revision ID: b6d1f3a8c2e7
Revises: a4e9c7b2d8f5
Create Date: 2026-11-18 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b6d1f3a8c2e7'
down_revision: Union[str, Sequence[str], None] = 'a4e9c7b2d8f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROW_PRONATED = (['rhomboids', 'traps_mid', 'lats'], ['delts_rear', 'biceps'], ['brachialis', 'brachioradialis'])
ROW_SUPINATED = (['lats'], ['rhomboids', 'traps_mid', 'biceps'], ['delts_rear', 'brachialis'])
ROW_NEUTRAL = (['lats', 'rhomboids', 'traps_mid'], ['delts_rear', 'biceps', 'brachialis'], ['brachioradialis'])
BENT_SUPINATED = (['lats'], ['rhomboids', 'traps_mid', 'biceps', 'lower_back'], ['delts_rear', 'brachialis'])
LUNGE = (['vastus_lateralis', 'vastus_medialis', 'glute_max'], ['rectus_femoris', 'adductors', 'glute_med'], ['biceps_femoris'])

NEW_EXERCISES = [
    ('remada-baixa-aberta', 'Remada baixa pegada aberta', 'back', 'cable', ROW_PRONATED),
    ('remada-baixa-supinada', 'Remada baixa pegada supinada', 'back', 'cable', ROW_SUPINATED),
    ('remada-curvada-halteres', 'Remada curvada com halteres pegada neutra', 'back', 'dumbbell', ROW_NEUTRAL),
    ('remada-smith-supinada', 'Remada no Smith pegada supinada', 'back', 'smith', BENT_SUPINATED),
    ('remada-t-bar-pronada', 'Remada T-bar pegada pronada', 'back', 'plate_loaded', ROW_PRONATED),
    ('afundo-smith', 'Afundo no Smith', 'quads', 'smith', LUNGE),
]

RENAMED = {
    'remada-baixa': ('Remada baixa', 'Remada baixa pegada neutra'),
    'remada-curvada': ('Remada curvada', 'Remada curvada pegada pronada'),
    'remada-curvada-supinada': ('Remada curvada supinada', 'Remada curvada pegada supinada'),
    'remada-smith': ('Remada no Smith', 'Remada no Smith pegada pronada'),
    'remada-t-bar': ('Remada T-bar', 'Remada T-bar pegada neutra'),
}

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
