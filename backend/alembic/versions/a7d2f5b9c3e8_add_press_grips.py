"""add pronated and neutral grips to chest and shoulder presses

Revision ID: a7d2f5b9c3e8
Revises: a5c8e2f4b7d1
Create Date: 2026-11-21 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7d2f5b9c3e8'
down_revision: Union[str, Sequence[str], None] = 'a5c8e2f4b7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FAMILIES = ['Supino reto', 'Supino inclinado', 'Supino declinado', 'Desenvolvimento']

CHEST = {'triceps_lateral': 'secondary', 'triceps_medial': 'secondary', 'triceps_long': 'auxiliary'}
SHOULDERS = {'delts_side': 'auxiliary'}

NEUTRAL = [
    ('supino-reto-halteres-neutra', 'Supino reto com halteres pegada neutra', 'supino-reto-halteres', CHEST),
    ('supino-maquina-neutra', 'Supino reto na máquina pegada neutra', 'supino-maquina', CHEST),
    ('supino-articulado-neutra', 'Supino reto articulado pegada neutra', 'supino-articulado', CHEST),
    ('supino-inclinado-halteres-neutra', 'Supino inclinado com halteres pegada neutra', 'supino-inclinado-halteres', CHEST),
    ('supino-inclinado-maquina-neutra', 'Supino inclinado na máquina pegada neutra', 'supino-inclinado-maquina', CHEST),
    ('supino-inclinado-articulado-neutra', 'Supino inclinado articulado pegada neutra', 'supino-inclinado-articulado', CHEST),
    ('supino-declinado-halteres-neutra', 'Supino declinado com halteres pegada neutra', 'supino-declinado-halteres', CHEST),
    ('supino-declinado-articulado-neutra', 'Supino declinado articulado pegada neutra', 'supino-declinado-articulado', CHEST),
    ('desenvolvimento-neutra', 'Desenvolvimento com halteres pegada neutra', 'desenvolvimento', SHOULDERS),
    ('desenvolvimento-maquina-neutra', 'Desenvolvimento na máquina pegada neutra', 'desenvolvimento-maquina', SHOULDERS),
    ('desenvolvimento-articulado-neutra', 'Desenvolvimento articulado pegada neutra', 'desenvolvimento-articulado', SHOULDERS),
]


def upgrade() -> None:
    op.get_bind().execute(
        sa.text("UPDATE fitness_exercises SET grip = 'pronated' WHERE user_id IS NULL AND family IN :families")
        .bindparams(sa.bindparam('families', expanding=True)),
        {'families': FAMILIES},
    )
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text('SELECT slug FROM fitness_exercises WHERE slug IS NOT NULL'))}
    for slug, name, source, overrides in NEUTRAL:
        if slug in existing:
            continue
        base = bind.execute(
            sa.text('SELECT id, muscle_group, equipment, family, bodyweight_factor, tracking, intensity FROM fitness_exercises WHERE user_id IS NULL AND slug = :slug'),
            {'slug': source},
        ).mappings().one_or_none()
        if base is None:
            continue
        exercise_id = bind.execute(
            sa.text(
                "INSERT INTO fitness_exercises (slug, name, muscle_group, equipment, is_unilateral, family, grip, bodyweight_factor, tracking, intensity) "
                "VALUES (:slug, :name, :muscle_group, :equipment, false, :family, 'neutral', :bodyweight_factor, :tracking, :intensity) RETURNING id"
            ),
            {'slug': slug, 'name': name, **{key: base[key] for key in ('muscle_group', 'equipment', 'family', 'bodyweight_factor', 'tracking', 'intensity')}},
        ).scalar_one()
        muscles = bind.execute(
            sa.text('SELECT muscle, role FROM fitness_exercise_muscles WHERE exercise_id = :id ORDER BY id'),
            {'id': base['id']},
        ).all()
        roles = {muscle: overrides.get(muscle, role) for muscle, role in muscles}
        roles.update({muscle: role for muscle, role in overrides.items() if muscle not in roles})
        for muscle, role in roles.items():
            bind.execute(
                sa.text('INSERT INTO fitness_exercise_muscles (exercise_id, muscle, role) VALUES (:exercise_id, :muscle, :role)'),
                {'exercise_id': exercise_id, 'muscle': muscle, 'role': role},
            )


def downgrade() -> None:
    bind = op.get_bind()
    slugs = [item[0] for item in NEUTRAL]
    bind.execute(
        sa.text('DELETE FROM fitness_exercise_muscles WHERE exercise_id IN (SELECT id FROM fitness_exercises WHERE user_id IS NULL AND slug IN :slugs)')
        .bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': slugs},
    )
    bind.execute(
        sa.text('DELETE FROM fitness_exercises WHERE user_id IS NULL AND slug IN :slugs').bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': slugs},
    )
    bind.execute(
        sa.text('UPDATE fitness_exercises SET grip = NULL WHERE user_id IS NULL AND family IN :families')
        .bindparams(sa.bindparam('families', expanding=True)),
        {'families': FAMILIES},
    )
