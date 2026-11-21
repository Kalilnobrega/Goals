"""mark every chest portion on chest exercises

Revision ID: b1e4c7a9d2f6
Revises: a7d2f5b9c3e8
Create Date: 2026-11-21 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1e4c7a9d2f6'
down_revision: Union[str, Sequence[str], None] = 'a7d2f5b9c3e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ADDED = {
    'crossover-polia-baixa': ['chest_lower'],
    'crucifixo-polia-declinado': ['chest_upper'],
    'crucifixo-inclinado': ['chest_lower'],
    'crucifixo-inclinado-articulado': ['chest_lower'],
    'crucifixo-polia-inclinado': ['chest_lower'],
    'paralela-peito': ['chest_upper'],
    'supino-declinado': ['chest_upper'],
    'supino-declinado-articulado': ['chest_upper'],
    'supino-declinado-articulado-neutra': ['chest_upper'],
    'supino-declinado-halteres': ['chest_upper'],
    'supino-declinado-halteres-neutra': ['chest_upper'],
    'supino-declinado-smith': ['chest_upper'],
    'supino-inclinado': ['chest_lower'],
    'supino-inclinado-articulado': ['chest_lower'],
    'supino-inclinado-articulado-neutra': ['chest_lower'],
    'supino-inclinado-halteres': ['chest_lower'],
    'supino-inclinado-halteres-neutra': ['chest_lower'],
    'supino-inclinado-maquina': ['chest_lower'],
    'supino-inclinado-maquina-neutra': ['chest_lower'],
    'supino-inclinado-smith': ['chest_lower'],
}


def upgrade() -> None:
    bind = op.get_bind()
    for slug, muscles in ADDED.items():
        for muscle in muscles:
            bind.execute(
                sa.text(
                    "INSERT INTO fitness_exercise_muscles (exercise_id, muscle, role) "
                    "SELECT e.id, CAST(:muscle AS VARCHAR), 'auxiliary' FROM fitness_exercises e "
                    "WHERE e.user_id IS NULL AND e.slug = :slug "
                    "AND NOT EXISTS (SELECT 1 FROM fitness_exercise_muscles m WHERE m.exercise_id = e.id AND m.muscle = :muscle)"
                ),
                {'slug': slug, 'muscle': muscle},
            )


def downgrade() -> None:
    bind = op.get_bind()
    for slug, muscles in ADDED.items():
        for muscle in muscles:
            bind.execute(
                sa.text(
                    "DELETE FROM fitness_exercise_muscles WHERE muscle = :muscle AND role = 'auxiliary' "
                    "AND exercise_id IN (SELECT id FROM fitness_exercises WHERE user_id IS NULL AND slug = :slug)"
                ),
                {'slug': slug, 'muscle': muscle},
            )
