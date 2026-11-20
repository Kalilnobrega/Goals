"""add an intensity level to exercises for estimating set duration

Revision ID: d4b8f2a6c9e3
Revises: c7a2e9d4f1b8
Create Date: 2026-11-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4b8f2a6c9e3'
down_revision: Union[str, Sequence[str], None] = 'c7a2e9d4f1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEVELS = {
    'very_high': [
        'levantamento-terra', 'agachamento-livre', 'agachamento-frontal', 'agachamento-smith', 'agachamento-hack',
        'agachamento-pendulo', 'agachamento-sumo-barra', 'leg-press', 'leg-press-90', 'leg-press-horizontal',
        'stiff', 'stiff-halteres', 'stiff-romeno', 'stiff-romeno-halteres', 'bom-dia', 'bom-dia-smith',
        'elevacao-pelvica', 'elevacao-pelvica-smith', 'elevacao-pelvica-maquina', 'afundo', 'afundo-smith',
        'agachamento-bulgaro', 'agachamento-bulgaro-smith', 'passada', 'subida-banco',
    ],
    'high': [
        'supino-reto', 'supino-reto-halteres', 'supino-smith', 'supino-maquina', 'supino-articulado',
        'supino-inclinado', 'supino-inclinado-halteres', 'supino-inclinado-smith', 'supino-inclinado-maquina',
        'supino-inclinado-articulado', 'supino-declinado', 'supino-declinado-halteres', 'supino-declinado-smith',
        'supino-declinado-articulado', 'supino-fechado', 'flexao', 'paralela-peito', 'mergulho', 'mergulho-maquina',
        'desenvolvimento', 'desenvolvimento-arnold', 'desenvolvimento-articulado', 'desenvolvimento-barra',
        'desenvolvimento-maquina', 'desenvolvimento-smith', 'remada-alta', 'remada-alta-cabo',
        'barra-fixa', 'barra-fixa-assistida', 'barra-fixa-supinada', 'barra-fixa-supinada-assistida',
        'puxada-frontal', 'puxada-articulada', 'puxada-neutra', 'puxada-neutra-aberta', 'puxada-neutra-articulada',
        'puxada-supinada', 'puxada-supinada-articulada', 'puxada-unilateral',
        'remada-articulada-neutra', 'remada-articulada-pronada', 'remada-articulada-supinada', 'remada-baixa',
        'remada-baixa-aberta', 'remada-baixa-supinada', 'remada-cavalinho', 'remada-curvada', 'remada-curvada-halteres',
        'remada-curvada-supinada', 'remada-maquina-neutra', 'remada-maquina-pronada', 'remada-maquina-supinada',
        'remada-smith', 'remada-smith-supinada', 'remada-t-bar', 'remada-t-bar-pronada', 'remada-unilateral',
        'remada-unilateral-cabo', 'agachamento-goblet', 'agachamento-sumo', 'swing-kettlebell',
    ],
    'moderate': [
        'cadeira-extensora', 'cadeira-extensora-articulada', 'cadeira-flexora', 'mesa-flexora', 'flexora-em-pe',
        'cadeira-adutora', 'aducao-cabo', 'cadeira-abdutora', 'abducao-cabo', 'pulldown', 'pullover', 'pull-around',
        'crucifixo', 'crucifixo-inclinado', 'crucifixo-inclinado-articulado', 'crucifixo-polia',
        'crucifixo-polia-declinado', 'crucifixo-polia-inclinado', 'crossover', 'crossover-polia-baixa', 'peck-deck',
        'coice-cabo', 'coice-maquina', 'elevacao-quadril-cabo', 'banco-romano', 'banco-romano-gluteo', 'ponte-gluteo',
        'stiff-romeno-peso-corporal', 'encolhimento', 'encolhimento-barra', 'encolhimento-smith',
    ],
    'low': [
        'rosca-alternada', 'rosca-barra-w', 'rosca-bayesiana', 'rosca-cabo', 'rosca-concentrada', 'rosca-direta',
        'rosca-inclinada', 'rosca-maquina', 'rosca-martelo', 'rosca-martelo-corda', 'rosca-polia-w', 'rosca-scott',
        'rosca-scott-barra', 'rosca-scott-halter', 'rosca-inversa', 'rosca-inversa-cabo', 'rosca-inversa-halteres',
        'triceps-coice', 'triceps-corda', 'triceps-frances', 'triceps-frances-cabo', 'triceps-maquina', 'triceps-pulley',
        'triceps-testa', 'triceps-testa-cabo', 'triceps-unilateral-cabo', 'elevacao-lateral', 'elevacao-lateral-cabo',
        'elevacao-lateral-maquina', 'elevacao-frontal', 'elevacao-frontal-cabo', 'crucifixo-inverso',
        'crucifixo-inverso-cabo', 'crucifixo-inverso-maquina', 'face-pull', 'panturrilha-em-pe', 'panturrilha-leg',
        'panturrilha-leg-horizontal', 'panturrilha-sentado', 'panturrilha-smith', 'panturrilha-unilateral',
        'extensao-punho', 'extensao-punho-cabo', 'extensao-punho-halteres', 'flexao-punho', 'flexao-punho-cabo',
        'flexao-punho-halteres', 'abdominal-cabo', 'abdominal-infra', 'abdominal-maquina', 'abdominal-obliquo',
        'abdominal-roda', 'abdominal-supra', 'elevacao-pernas', 'rotacao-russa',
    ],
}


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('intensity', sa.String(length=10), nullable=True))
    bind = op.get_bind()
    for level, slugs in LEVELS.items():
        bind.execute(
            sa.text("UPDATE fitness_exercises SET intensity = :level WHERE user_id IS NULL AND slug IN :slugs")
            .bindparams(sa.bindparam('slugs', expanding=True)),
            {'level': level, 'slugs': slugs},
        )


def downgrade() -> None:
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('intensity')
