"""group default exercises into families by equipment

Revision ID: b9d6f3a1c8e5
Revises: a8c5e2f9d4b7
Create Date: 2026-11-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9d6f3a1c8e5'
down_revision: Union[str, Sequence[str], None] = 'a8c5e2f9d4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FAMILIES = {
    'Supino reto': ['supino-reto', 'supino-reto-halteres', 'supino-smith', 'supino-maquina', 'supino-articulado'],
    'Supino inclinado': ['supino-inclinado', 'supino-inclinado-halteres', 'supino-inclinado-smith', 'supino-inclinado-maquina', 'supino-inclinado-articulado'],
    'Supino declinado': ['supino-declinado', 'supino-declinado-halteres', 'supino-declinado-smith', 'supino-declinado-articulado'],
    'Crucifixo': ['crucifixo', 'crucifixo-polia'],
    'Crucifixo inclinado': ['crucifixo-inclinado', 'crucifixo-polia-inclinado', 'crucifixo-inclinado-articulado'],
    'Crucifixo inverso': ['crucifixo-inverso', 'crucifixo-inverso-maquina', 'crucifixo-inverso-cabo'],
    'Desenvolvimento': ['desenvolvimento', 'desenvolvimento-barra', 'desenvolvimento-smith', 'desenvolvimento-maquina', 'desenvolvimento-articulado'],
    'Elevação lateral': ['elevacao-lateral', 'elevacao-lateral-cabo', 'elevacao-lateral-maquina'],
    'Elevação frontal': ['elevacao-frontal', 'elevacao-frontal-cabo'],
    'Remada alta': ['remada-alta', 'remada-alta-cabo'],
    'Encolhimento': ['encolhimento', 'encolhimento-barra', 'encolhimento-smith'],
    'Remada curvada pegada pronada': ['remada-curvada', 'remada-smith'],
    'Remada curvada pegada supinada': ['remada-curvada-supinada', 'remada-smith-supinada'],
    'Remada na máquina pegada pronada': ['remada-maquina-pronada', 'remada-articulada-pronada'],
    'Remada na máquina pegada supinada': ['remada-maquina-supinada', 'remada-articulada-supinada'],
    'Remada na máquina pegada neutra': ['remada-maquina-neutra', 'remada-articulada-neutra'],
    'Remada unilateral': ['remada-unilateral', 'remada-unilateral-cabo'],
    'Puxada frontal': ['puxada-frontal', 'puxada-articulada'],
    'Barra fixa': ['barra-fixa', 'barra-fixa-assistida'],
    'Rosca direta': ['rosca-direta', 'rosca-cabo'],
    'Rosca com barra W': ['rosca-barra-w', 'rosca-polia-w'],
    'Rosca Scott': ['rosca-scott', 'rosca-scott-barra', 'rosca-scott-halter'],
    'Rosca martelo': ['rosca-martelo', 'rosca-martelo-corda'],
    'Tríceps testa': ['triceps-testa', 'triceps-testa-cabo'],
    'Tríceps francês': ['triceps-frances', 'triceps-frances-cabo'],
    'Mergulho': ['mergulho', 'mergulho-maquina'],
    'Agachamento': ['agachamento-livre', 'agachamento-smith'],
    'Agachamento búlgaro': ['agachamento-bulgaro', 'agachamento-bulgaro-smith'],
    'Afundo': ['afundo', 'afundo-smith'],
    'Leg press': ['leg-press', 'leg-press-horizontal'],
    'Stiff': ['stiff', 'stiff-halteres'],
    'Elevação pélvica': ['elevacao-pelvica', 'elevacao-pelvica-maquina', 'elevacao-pelvica-smith'],
    'Coice': ['coice-cabo', 'coice-maquina'],
    'Abdução de quadril': ['cadeira-abdutora', 'abducao-cabo'],
    'Adução de quadril': ['cadeira-adutora', 'aducao-cabo'],
    'Panturrilha em pé': ['panturrilha-em-pe', 'panturrilha-smith', 'panturrilha-unilateral'],
    'Abdominal com carga': ['abdominal-maquina', 'abdominal-cabo'],
}


def upgrade() -> None:
    op.add_column('fitness_exercises', sa.Column('family', sa.String(length=60), nullable=True))
    op.create_index(op.f('ix_fitness_exercises_family'), 'fitness_exercises', ['family'], unique=False)
    bind = op.get_bind()
    for family, slugs in FAMILIES.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET family = :family WHERE user_id IS NULL AND slug IN :slugs')
            .bindparams(sa.bindparam('slugs', expanding=True)),
            {'family': family, 'slugs': slugs},
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_fitness_exercises_family'), table_name='fitness_exercises')
    with op.batch_alter_table('fitness_exercises') as batch_op:
        batch_op.drop_column('family')
