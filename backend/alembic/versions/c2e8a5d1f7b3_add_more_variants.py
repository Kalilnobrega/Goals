"""add more exercise variants, families and unilateral defaults

Revision ID: c2e8a5d1f7b3
Revises: b9d6f3a1c8e5
Create Date: 2026-11-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2e8a5d1f7b3'
down_revision: Union[str, Sequence[str], None] = 'b9d6f3a1c8e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PULLDOWN = (['lats'], ['biceps', 'rhomboids', 'traps_mid'], ['brachialis', 'delts_rear', 'forearm_flexors'])
NEUTRAL_PULLDOWN = (['lats'], ['rhomboids', 'traps_mid', 'brachialis', 'biceps'], ['delts_rear'])
SUPINATED_PULLDOWN = (['lats'], ['biceps', 'rhomboids'], ['brachialis', 'traps_mid'])
WRIST_FLEXION = (['forearm_flexors'], [], [])
WRIST_EXTENSION = (['forearm_extensors'], ['brachioradialis'], [])
REVERSE_CURL = (['brachioradialis', 'brachialis'], ['biceps'], ['forearm_extensors'])
KNEE_EXTENSION = (['rectus_femoris', 'vastus_lateralis', 'vastus_medialis'], [], [])
GOOD_MORNING = (['biceps_femoris', 'semitendinosus'], ['glute_max', 'lower_back'], ['adductors'])

NEW_EXERCISES = [
    ('paralela-peito', 'Paralela com foco em peito', 'chest', 'bodyweight', None, False,
     (['chest_lower'], ['triceps_lateral', 'triceps_medial', 'delts_front'], ['chest_mid', 'triceps_long'])),
    ('barra-fixa-supinada-assistida', 'Barra fixa supinada assistida', 'back', 'machine', 'Barra fixa supinada', False,
     (['lats'], ['biceps', 'brachialis'], ['rhomboids', 'traps_mid'])),
    ('puxada-neutra-aberta', 'Puxada pegada neutra', 'back', 'cable', 'Puxada pegada neutra', False, NEUTRAL_PULLDOWN),
    ('puxada-neutra-articulada', 'Puxada pegada neutra articulada', 'back', 'plate_loaded', 'Puxada pegada neutra', False, NEUTRAL_PULLDOWN),
    ('puxada-supinada-articulada', 'Puxada pegada supinada articulada', 'back', 'plate_loaded', 'Puxada pegada supinada', False, SUPINATED_PULLDOWN),
    ('flexao-punho-cabo', 'Flexão de punho no cabo', 'forearms', 'cable', 'Flexão de punho', False, WRIST_FLEXION),
    ('flexao-punho-halteres', 'Flexão de punho com halteres', 'forearms', 'dumbbell', 'Flexão de punho', False, WRIST_FLEXION),
    ('extensao-punho-cabo', 'Extensão de punho no cabo', 'forearms', 'cable', 'Extensão de punho', False, WRIST_EXTENSION),
    ('extensao-punho-halteres', 'Extensão de punho com halteres', 'forearms', 'dumbbell', 'Extensão de punho', False, WRIST_EXTENSION),
    ('rosca-inversa-cabo', 'Rosca inversa no cabo', 'forearms', 'cable', 'Rosca inversa', False, REVERSE_CURL),
    ('rosca-inversa-halteres', 'Rosca inversa com halteres', 'forearms', 'dumbbell', 'Rosca inversa', False, REVERSE_CURL),
    ('cadeira-extensora-articulada', 'Cadeira extensora articulada', 'quads', 'plate_loaded', 'Cadeira extensora', False, KNEE_EXTENSION),
    ('leg-press-90', 'Leg press 90°', 'quads', 'plate_loaded', None, False,
     (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris'], ['glute_max', 'adductors'], ['biceps_femoris'])),
    ('bom-dia', 'Bom dia', 'hamstrings', 'barbell', 'Bom dia', False, GOOD_MORNING),
    ('bom-dia-smith', 'Bom dia no Smith', 'hamstrings', 'smith', 'Bom dia', False, GOOD_MORNING),
    ('agachamento-sumo-barra', 'Agachamento sumô com barra', 'adductors', 'barbell', 'Agachamento sumô', False,
     (['adductors', 'glute_max'], ['vastus_lateralis', 'vastus_medialis'], ['biceps_femoris', 'semitendinosus', 'lower_back'])),
]

FAMILIES = {
    'Barra fixa supinada': ['barra-fixa-supinada'],
    'Puxada pegada supinada': ['puxada-supinada'],
    'Flexão de punho': ['flexao-punho'],
    'Extensão de punho': ['extensao-punho'],
    'Rosca inversa': ['rosca-inversa'],
    'Cadeira extensora': ['cadeira-extensora'],
    'Agachamento sumô': ['agachamento-sumo'],
}

CLEARED_FAMILIES = ['leg-press', 'leg-press-horizontal']

RENAMED = {'leg-press': ('Leg press', 'Leg press 45°')}

UNILATERAL = ['triceps-frances', 'triceps-frances-cabo', 'elevacao-quadril-cabo']

ROLE_CHANGES = [('leg-press-horizontal', 'glute_max', 'secondary', 'primary')]

exercises = sa.table(
    'fitness_exercises',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('muscle_group', sa.String),
    sa.column('equipment', sa.String),
    sa.column('family', sa.String),
    sa.column('is_unilateral', sa.Boolean),
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
        [
            {'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment, 'family': family, 'is_unilateral': unilateral}
            for slug, name, group, equipment, family, unilateral, _ in added
        ],
    )
    ids = dict(bind.execute(sa.text('SELECT slug, id FROM fitness_exercises WHERE slug IS NOT NULL')).all())
    op.bulk_insert(
        exercise_muscles,
        [
            {'exercise_id': ids[slug], 'muscle': muscle, 'role': role}
            for slug, *_, muscles in added
            for role, keys in zip(('primary', 'secondary', 'auxiliary'), muscles)
            for muscle in keys
        ],
    )
    for family, slugs in FAMILIES.items():
        bind.execute(by_slugs('UPDATE fitness_exercises SET family = :family WHERE user_id IS NULL AND slug IN :slugs'),
                     {'family': family, 'slugs': slugs})
    bind.execute(by_slugs('UPDATE fitness_exercises SET family = NULL WHERE user_id IS NULL AND slug IN :slugs'),
                 {'slugs': CLEARED_FAMILIES})
    for slug, (_, new) in RENAMED.items():
        bind.execute(sa.text('UPDATE fitness_exercises SET name = :name WHERE slug = :slug AND user_id IS NULL'), {'name': new, 'slug': slug})
    bind.execute(by_slugs('UPDATE fitness_exercises SET is_unilateral = true WHERE user_id IS NULL AND slug IN :slugs'),
                 {'slugs': UNILATERAL})
    change_roles(bind, 3)


def change_roles(bind, index: int):
    for change in ROLE_CHANGES:
        bind.execute(
            sa.text(
                'UPDATE fitness_exercise_muscles SET role = :role WHERE muscle = :muscle AND exercise_id IN '
                '(SELECT id FROM fitness_exercises WHERE slug = :slug AND user_id IS NULL)'
            ),
            {'role': change[index], 'muscle': change[1], 'slug': change[0]},
        )


def downgrade() -> None:
    bind = op.get_bind()
    change_roles(bind, 2)
    bind.execute(by_slugs('UPDATE fitness_exercises SET is_unilateral = false WHERE user_id IS NULL AND slug IN :slugs'),
                 {'slugs': UNILATERAL})
    for slug, (old, _) in RENAMED.items():
        bind.execute(sa.text('UPDATE fitness_exercises SET name = :name WHERE slug = :slug AND user_id IS NULL'), {'name': old, 'slug': slug})
    bind.execute(by_slugs("UPDATE fitness_exercises SET family = 'Leg press' WHERE user_id IS NULL AND slug IN :slugs"),
                 {'slugs': CLEARED_FAMILIES})
    bind.execute(by_slugs('UPDATE fitness_exercises SET family = NULL WHERE user_id IS NULL AND slug IN :slugs'),
                 {'slugs': [slug for slugs in FAMILIES.values() for slug in slugs]})
    slugs = [item[0] for item in NEW_EXERCISES]
    bind.execute(by_slugs('DELETE FROM fitness_exercise_muscles WHERE exercise_id IN (SELECT id FROM fitness_exercises WHERE slug IN :slugs)'),
                 {'slugs': slugs})
    bind.execute(by_slugs('DELETE FROM fitness_exercises WHERE slug IN :slugs'), {'slugs': slugs})
