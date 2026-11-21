"""split back grip families into wide and close variants and add neutral pull-ups and new seated row and T-bar grips

Revision ID: a5c8e2f4b7d1
Revises: a3f7c1e9d5b2
Create Date: 2026-11-20 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a5c8e2f4b7d1'
down_revision: Union[str, Sequence[str], None] = 'a3f7c1e9d5b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


WIDTHS = {
    'barra-fixa': ('Barra fixa aberta', 'Barra fixa aberta pegada pronada', 'Barra fixa', 'Barra fixa'),
    'barra-fixa-assistida': ('Barra fixa aberta', 'Barra fixa aberta assistida pegada pronada', 'Barra fixa', 'Barra fixa assistida'),
    'barra-fixa-supinada': ('Barra fixa fechada', 'Barra fixa fechada pegada supinada', 'Barra fixa', 'Barra fixa supinada'),
    'barra-fixa-supinada-assistida': ('Barra fixa fechada', 'Barra fixa fechada assistida pegada supinada', 'Barra fixa', 'Barra fixa supinada assistida'),
    'puxada-frontal': ('Puxada frontal aberta', 'Puxada frontal aberta pegada pronada', 'Puxada frontal', 'Puxada frontal'),
    'puxada-articulada': ('Puxada frontal aberta', 'Puxada frontal aberta articulada pegada pronada', 'Puxada frontal', 'Puxada articulada'),
    'puxada-neutra-aberta': ('Puxada frontal aberta', 'Puxada frontal aberta pegada neutra', 'Puxada frontal', 'Puxada pegada neutra'),
    'puxada-neutra': ('Puxada frontal fechada', 'Puxada frontal fechada pegada neutra', None, 'Puxada pegada neutra (triângulo)'),
    'puxada-neutra-articulada': ('Puxada frontal fechada', 'Puxada frontal fechada articulada pegada neutra', 'Puxada frontal', 'Puxada pegada neutra articulada'),
    'puxada-supinada': ('Puxada frontal fechada', 'Puxada frontal fechada pegada supinada', 'Puxada frontal', 'Puxada pegada supinada'),
    'puxada-supinada-articulada': ('Puxada frontal fechada', 'Puxada frontal fechada articulada pegada supinada', 'Puxada frontal', 'Puxada pegada supinada articulada'),
    'remada-baixa-aberta': ('Remada baixa aberta', 'Remada baixa aberta pegada pronada', 'Remada baixa', 'Remada baixa pegada aberta'),
    'remada-baixa': ('Remada baixa fechada', 'Remada baixa fechada pegada neutra', 'Remada baixa', 'Remada baixa pegada neutra'),
    'remada-baixa-supinada': ('Remada baixa fechada', 'Remada baixa fechada pegada supinada', 'Remada baixa', 'Remada baixa pegada supinada'),
    'remada-curvada': ('Remada curvada aberta', 'Remada curvada aberta pegada pronada', 'Remada curvada', 'Remada curvada pegada pronada'),
    'remada-smith': ('Remada curvada aberta', 'Remada curvada aberta no Smith pegada pronada', 'Remada curvada', 'Remada no Smith pegada pronada'),
    'remada-curvada-halteres': ('Remada curvada fechada', 'Remada curvada fechada com halteres pegada neutra', 'Remada curvada', 'Remada curvada com halteres pegada neutra'),
    'remada-curvada-supinada': ('Remada curvada fechada', 'Remada curvada fechada pegada supinada', 'Remada curvada', 'Remada curvada pegada supinada'),
    'remada-smith-supinada': ('Remada curvada fechada', 'Remada curvada fechada no Smith pegada supinada', 'Remada curvada', 'Remada no Smith pegada supinada'),
    'remada-maquina-pronada': ('Remada na máquina aberta', 'Remada na máquina aberta pegada pronada', 'Remada na máquina', 'Remada na máquina pegada pronada'),
    'remada-articulada-pronada': ('Remada na máquina aberta', 'Remada articulada aberta pegada pronada', 'Remada na máquina', 'Remada articulada pegada pronada'),
    'remada-maquina-neutra': ('Remada na máquina fechada', 'Remada na máquina fechada pegada neutra', 'Remada na máquina', 'Remada na máquina pegada neutra'),
    'remada-articulada-neutra': ('Remada na máquina fechada', 'Remada articulada fechada pegada neutra', 'Remada na máquina', 'Remada articulada pegada neutra'),
    'remada-maquina-supinada': ('Remada na máquina fechada', 'Remada na máquina fechada pegada supinada', 'Remada na máquina', 'Remada na máquina pegada supinada'),
    'remada-articulada-supinada': ('Remada na máquina fechada', 'Remada articulada fechada pegada supinada', 'Remada na máquina', 'Remada articulada pegada supinada'),
    'remada-t-bar-pronada': ('Remada T-bar aberta', 'Remada T-bar aberta pegada pronada', 'Remada T-bar', 'Remada T-bar pegada pronada'),
    'remada-t-bar': ('Remada T-bar fechada', 'Remada T-bar fechada pegada neutra', 'Remada T-bar', 'Remada T-bar pegada neutra'),
}

NEUTRAL_PULL_UP = [('lats', 'primary'), ('teres_major', 'primary'), ('brachialis', 'secondary'), ('biceps', 'secondary'), ('rhomboids', 'secondary'), ('traps_mid', 'auxiliary'), ('delts_rear', 'auxiliary')]

WIDE_NEUTRAL_ROW = [
    ('rhomboids', 'primary'), ('traps_mid', 'primary'), ('lats', 'primary'), ('delts_rear', 'secondary'), ('brachialis', 'secondary'),
    ('biceps', 'secondary'), ('teres_major', 'secondary'), ('brachioradialis', 'auxiliary'), ('infraspinatus', 'auxiliary'),
]

CLOSE_SUPINATED_ROW = [
    ('lats', 'primary'), ('teres_major', 'primary'), ('rhomboids', 'secondary'), ('traps_mid', 'secondary'), ('biceps', 'secondary'),
    ('brachialis', 'auxiliary'), ('delts_rear', 'auxiliary'),
]

NEW_EXERCISES = [
    ('barra-fixa-neutra', 'Barra fixa fechada pegada neutra', 'bodyweight', 'Barra fixa fechada', 'neutral', 0.95, NEUTRAL_PULL_UP + [('abs_rectus', 'auxiliary')]),
    ('barra-fixa-neutra-assistida', 'Barra fixa fechada assistida pegada neutra', 'machine', 'Barra fixa fechada', 'neutral', None, NEUTRAL_PULL_UP),
    ('remada-baixa-aberta-neutra', 'Remada baixa aberta pegada neutra', 'cable', 'Remada baixa aberta', 'neutral', None, WIDE_NEUTRAL_ROW),
    ('remada-t-bar-aberta-neutra', 'Remada T-bar aberta pegada neutra', 'plate_loaded', 'Remada T-bar aberta', 'neutral', None, WIDE_NEUTRAL_ROW),
    ('remada-t-bar-supinada', 'Remada T-bar fechada pegada supinada', 'plate_loaded', 'Remada T-bar fechada', 'supinated', None, CLOSE_SUPINATED_ROW),
]


def apply(family_index: int, name_index: int) -> None:
    bind = op.get_bind()
    for slug, values in WIDTHS.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET family = :family, name = :name WHERE user_id IS NULL AND slug = :slug'),
            {'family': values[family_index], 'name': values[name_index], 'slug': slug},
        )


def upgrade() -> None:
    apply(0, 1)
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text('SELECT slug FROM fitness_exercises WHERE slug IS NOT NULL'))}
    for slug, name, equipment, family, grip, factor, muscles in NEW_EXERCISES:
        if slug in existing:
            continue
        exercise_id = bind.execute(
            sa.text(
                "INSERT INTO fitness_exercises (slug, name, muscle_group, equipment, is_unilateral, family, grip, bodyweight_factor, tracking, intensity) "
                "VALUES (:slug, :name, 'back', :equipment, false, :family, :grip, :factor, 'reps', 'high') RETURNING id"
            ),
            {'slug': slug, 'name': name, 'equipment': equipment, 'family': family, 'grip': grip, 'factor': factor},
        ).scalar_one()
        for muscle, role in muscles:
            bind.execute(
                sa.text('INSERT INTO fitness_exercise_muscles (exercise_id, muscle, role) VALUES (:exercise_id, :muscle, :role)'),
                {'exercise_id': exercise_id, 'muscle': muscle, 'role': role},
            )


def downgrade() -> None:
    bind = op.get_bind()
    slugs = [item[0] for item in NEW_EXERCISES]
    bind.execute(
        sa.text('DELETE FROM fitness_exercise_muscles WHERE exercise_id IN (SELECT id FROM fitness_exercises WHERE user_id IS NULL AND slug IN :slugs)')
        .bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': slugs},
    )
    bind.execute(
        sa.text('DELETE FROM fitness_exercises WHERE user_id IS NULL AND slug IN :slugs').bindparams(sa.bindparam('slugs', expanding=True)),
        {'slugs': slugs},
    )
    apply(2, 3)
