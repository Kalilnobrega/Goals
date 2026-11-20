"""split the back into latissimus, infraspinatus and teres major for global exercises

Revision ID: c7a2e9d4f1b8
Revises: b3e8f1c6d2a7
Create Date: 2026-11-20 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7a2e9d4f1b8'
down_revision: Union[str, Sequence[str], None] = 'b3e8f1c6d2a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROWS = "m.muscle = 'delts_rear' AND m.role = 'secondary' AND m.exercise_id IN (SELECT exercise_id FROM fitness_exercise_muscles WHERE muscle = 'lats' AND role = 'primary')"
REAR = "m.muscle = 'delts_rear' AND m.role = 'primary'"

CLOSE_GRIP = [
    'puxada-neutra', 'puxada-supinada', 'puxada-supinada-articulada', 'puxada-neutra-articulada', 'puxada-unilateral',
    'barra-fixa-supinada', 'barra-fixa-supinada-assistida',
    'remada-baixa', 'remada-baixa-supinada', 'remada-articulada-neutra', 'remada-articulada-supinada',
    'remada-curvada-halteres', 'remada-curvada-supinada', 'remada-maquina-neutra', 'remada-maquina-supinada',
    'remada-smith-supinada', 'remada-t-bar', 'remada-cavalinho', 'remada-unilateral', 'remada-unilateral-cabo',
]
LATS = "m.muscle = 'lats' AND m.role = 'primary'"
CLOSE = "e.slug IN (" + ", ".join(f"'{slug}'" for slug in CLOSE_GRIP) + ")"

RULES = [
    ('teres_major', 'primary', f"{LATS} AND {CLOSE}"),
    ('teres_major', 'secondary', LATS),
    ('infraspinatus', 'primary', f"{REAR} AND e.slug = 'face-pull'"),
    ('infraspinatus', 'secondary', REAR),
    ('teres_major', 'auxiliary', REAR),
    ('infraspinatus', 'auxiliary', ROWS),
]


def upgrade() -> None:
    bind = op.get_bind()
    for muscle, role, condition in RULES:
        bind.execute(sa.text(
            "INSERT INTO fitness_exercise_muscles (exercise_id, muscle, role) "
            "SELECT DISTINCT m.exercise_id, :muscle, :role FROM fitness_exercise_muscles m "
            "JOIN fitness_exercises e ON e.id = m.exercise_id "
            f"WHERE e.user_id IS NULL AND {condition} "
            "AND NOT EXISTS (SELECT 1 FROM fitness_exercise_muscles x WHERE x.exercise_id = m.exercise_id AND x.muscle = :muscle)"
        ), {'muscle': muscle, 'role': role})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "DELETE FROM fitness_exercise_muscles WHERE muscle IN ('infraspinatus', 'teres_major')"
    ))
