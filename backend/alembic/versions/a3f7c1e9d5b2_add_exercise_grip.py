"""add grip to exercises and merge grip families

Revision ID: a3f7c1e9d5b2
Revises: e5c1a8d3b7f2
Create Date: 2026-11-20 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f7c1e9d5b2'
down_revision: Union[str, Sequence[str], None] = 'e5c1a8d3b7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


GRIPS = {
    'barra-fixa': ('Barra fixa', 'pronated', 'Barra fixa'),
    'barra-fixa-assistida': ('Barra fixa', 'pronated', 'Barra fixa'),
    'barra-fixa-supinada': ('Barra fixa', 'supinated', 'Barra fixa supinada'),
    'barra-fixa-supinada-assistida': ('Barra fixa', 'supinated', 'Barra fixa supinada'),
    'puxada-frontal': ('Puxada frontal', 'pronated', 'Puxada frontal'),
    'puxada-articulada': ('Puxada frontal', 'pronated', 'Puxada frontal'),
    'puxada-neutra-aberta': ('Puxada frontal', 'neutral', 'Puxada pegada neutra'),
    'puxada-neutra-articulada': ('Puxada frontal', 'neutral', 'Puxada pegada neutra'),
    'puxada-supinada': ('Puxada frontal', 'supinated', 'Puxada pegada supinada'),
    'puxada-supinada-articulada': ('Puxada frontal', 'supinated', 'Puxada pegada supinada'),
    'puxada-neutra': (None, 'neutral', None),
    'remada-curvada': ('Remada curvada', 'pronated', 'Remada curvada pegada pronada'),
    'remada-smith': ('Remada curvada', 'pronated', 'Remada curvada pegada pronada'),
    'remada-curvada-supinada': ('Remada curvada', 'supinated', 'Remada curvada pegada supinada'),
    'remada-smith-supinada': ('Remada curvada', 'supinated', 'Remada curvada pegada supinada'),
    'remada-curvada-halteres': ('Remada curvada', 'neutral', None),
    'remada-maquina-pronada': ('Remada na máquina', 'pronated', 'Remada na máquina pegada pronada'),
    'remada-articulada-pronada': ('Remada na máquina', 'pronated', 'Remada na máquina pegada pronada'),
    'remada-maquina-supinada': ('Remada na máquina', 'supinated', 'Remada na máquina pegada supinada'),
    'remada-articulada-supinada': ('Remada na máquina', 'supinated', 'Remada na máquina pegada supinada'),
    'remada-maquina-neutra': ('Remada na máquina', 'neutral', 'Remada na máquina pegada neutra'),
    'remada-articulada-neutra': ('Remada na máquina', 'neutral', 'Remada na máquina pegada neutra'),
    'remada-baixa-aberta': ('Remada baixa', 'pronated', None),
    'remada-baixa': ('Remada baixa', 'neutral', None),
    'remada-baixa-supinada': ('Remada baixa', 'supinated', None),
    'remada-t-bar': ('Remada T-bar', 'neutral', None),
    'remada-t-bar-pronada': ('Remada T-bar', 'pronated', None),
}


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('grip', sa.String(length=10), nullable=True))
    bind = op.get_bind()
    for slug, (family, grip, _) in GRIPS.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET family = :family, grip = :grip WHERE user_id IS NULL AND slug = :slug'),
            {'family': family, 'grip': grip, 'slug': slug},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for slug, (_, _, family) in GRIPS.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET family = :family WHERE user_id IS NULL AND slug = :slug'),
            {'family': family, 'slug': slug},
        )
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('grip')
