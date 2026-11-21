"""name the grip on pronated chest and shoulder presses

Revision ID: b3f6d9a2c5e8
Revises: b1e4c7a9d2f6
Create Date: 2026-11-21 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3f6d9a2c5e8'
down_revision: Union[str, Sequence[str], None] = 'b1e4c7a9d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RENAMED = {
    'supino-reto': ('Supino reto', 'Supino reto pegada pronada'),
    'supino-reto-halteres': ('Supino reto com halteres', 'Supino reto com halteres pegada pronada'),
    'supino-maquina': ('Supino reto na máquina', 'Supino reto na máquina pegada pronada'),
    'supino-articulado': ('Supino reto articulado', 'Supino reto articulado pegada pronada'),
    'supino-smith': ('Supino reto no Smith', 'Supino reto no Smith pegada pronada'),
    'supino-inclinado': ('Supino inclinado', 'Supino inclinado pegada pronada'),
    'supino-inclinado-halteres': ('Supino inclinado com halteres', 'Supino inclinado com halteres pegada pronada'),
    'supino-inclinado-maquina': ('Supino inclinado na máquina', 'Supino inclinado na máquina pegada pronada'),
    'supino-inclinado-articulado': ('Supino inclinado articulado', 'Supino inclinado articulado pegada pronada'),
    'supino-inclinado-smith': ('Supino inclinado no Smith', 'Supino inclinado no Smith pegada pronada'),
    'supino-declinado': ('Supino declinado', 'Supino declinado pegada pronada'),
    'supino-declinado-halteres': ('Supino declinado com halteres', 'Supino declinado com halteres pegada pronada'),
    'supino-declinado-articulado': ('Supino declinado articulado', 'Supino declinado articulado pegada pronada'),
    'supino-declinado-smith': ('Supino declinado no Smith', 'Supino declinado no Smith pegada pronada'),
    'desenvolvimento': ('Desenvolvimento', 'Desenvolvimento com halteres pegada pronada'),
    'desenvolvimento-barra': ('Desenvolvimento com barra', 'Desenvolvimento com barra pegada pronada'),
    'desenvolvimento-maquina': ('Desenvolvimento na máquina', 'Desenvolvimento na máquina pegada pronada'),
    'desenvolvimento-articulado': ('Desenvolvimento articulado', 'Desenvolvimento articulado pegada pronada'),
    'desenvolvimento-smith': ('Desenvolvimento no Smith', 'Desenvolvimento no Smith pegada pronada'),
}


def rename(index: int) -> None:
    bind = op.get_bind()
    for slug, names in RENAMED.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET name = :name WHERE user_id IS NULL AND slug = :slug'),
            {'name': names[index], 'slug': slug},
        )


def upgrade() -> None:
    rename(1)


def downgrade() -> None:
    rename(0)
