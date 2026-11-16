"""add gymgoals

Revision ID: c3f9a2d7e5b1
Revises: b7e2c9d4f1a3
Create Date: 2026-11-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f9a2d7e5b1'
down_revision: Union[str, Sequence[str], None] = 'b7e2c9d4f1a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_EXERCISES = [
    ('supino-reto', 'Supino reto', 'chest', 'barbell'),
    ('supino-inclinado', 'Supino inclinado', 'chest', 'barbell'),
    ('supino-declinado', 'Supino declinado', 'chest', 'barbell'),
    ('supino-reto-halteres', 'Supino reto com halteres', 'chest', 'dumbbell'),
    ('supino-inclinado-halteres', 'Supino inclinado com halteres', 'chest', 'dumbbell'),
    ('crucifixo', 'Crucifixo', 'chest', 'dumbbell'),
    ('peck-deck', 'Peck deck', 'chest', 'machine'),
    ('crossover', 'Crossover', 'chest', 'cable'),
    ('flexao', 'Flexão de braço', 'chest', 'bodyweight'),
    ('puxada-frontal', 'Puxada frontal', 'back', 'cable'),
    ('remada-baixa', 'Remada baixa', 'back', 'cable'),
    ('remada-curvada', 'Remada curvada', 'back', 'barbell'),
    ('remada-unilateral', 'Remada unilateral', 'back', 'dumbbell'),
    ('remada-cavalinho', 'Remada cavalinho', 'back', 'barbell'),
    ('barra-fixa', 'Barra fixa', 'back', 'bodyweight'),
    ('pulldown', 'Pulldown', 'back', 'cable'),
    ('levantamento-terra', 'Levantamento terra', 'back', 'barbell'),
    ('desenvolvimento', 'Desenvolvimento', 'shoulders', 'dumbbell'),
    ('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'shoulders', 'machine'),
    ('elevacao-lateral', 'Elevação lateral', 'shoulders', 'dumbbell'),
    ('elevacao-frontal', 'Elevação frontal', 'shoulders', 'dumbbell'),
    ('crucifixo-inverso', 'Crucifixo inverso', 'shoulders', 'dumbbell'),
    ('encolhimento', 'Encolhimento', 'shoulders', 'dumbbell'),
    ('rosca-direta', 'Rosca direta', 'biceps', 'barbell'),
    ('rosca-alternada', 'Rosca alternada', 'biceps', 'dumbbell'),
    ('rosca-martelo', 'Rosca martelo', 'biceps', 'dumbbell'),
    ('rosca-scott', 'Rosca Scott', 'biceps', 'machine'),
    ('rosca-cabo', 'Rosca no cabo', 'biceps', 'cable'),
    ('triceps-pulley', 'Tríceps pulley', 'triceps', 'cable'),
    ('triceps-corda', 'Tríceps corda', 'triceps', 'cable'),
    ('triceps-testa', 'Tríceps testa', 'triceps', 'barbell'),
    ('triceps-frances', 'Tríceps francês', 'triceps', 'dumbbell'),
    ('mergulho', 'Mergulho nas paralelas', 'triceps', 'bodyweight'),
    ('agachamento-livre', 'Agachamento livre', 'legs', 'barbell'),
    ('agachamento-hack', 'Agachamento hack', 'legs', 'machine'),
    ('leg-press', 'Leg press', 'legs', 'machine'),
    ('cadeira-extensora', 'Cadeira extensora', 'legs', 'machine'),
    ('mesa-flexora', 'Mesa flexora', 'legs', 'machine'),
    ('cadeira-flexora', 'Cadeira flexora', 'legs', 'machine'),
    ('cadeira-adutora', 'Cadeira adutora', 'legs', 'machine'),
    ('afundo', 'Afundo', 'legs', 'dumbbell'),
    ('stiff', 'Stiff', 'legs', 'barbell'),
    ('panturrilha-em-pe', 'Panturrilha em pé', 'legs', 'machine'),
    ('panturrilha-sentado', 'Panturrilha sentado', 'legs', 'machine'),
    ('elevacao-pelvica', 'Elevação pélvica', 'glutes', 'barbell'),
    ('cadeira-abdutora', 'Cadeira abdutora', 'glutes', 'machine'),
    ('coice-cabo', 'Coice no cabo', 'glutes', 'cable'),
    ('abdominal-supra', 'Abdominal supra', 'abs', 'bodyweight'),
    ('abdominal-infra', 'Abdominal infra', 'abs', 'bodyweight'),
    ('abdominal-maquina', 'Abdominal na máquina', 'abs', 'machine'),
    ('prancha', 'Prancha', 'abs', 'bodyweight'),
    ('esteira', 'Esteira', 'cardio', 'machine'),
    ('bicicleta', 'Bicicleta ergométrica', 'cardio', 'machine'),
    ('eliptico', 'Elíptico', 'cardio', 'machine'),
]


def upgrade() -> None:
    exercises = op.create_table(
        'fitness_exercises',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('slug', sa.String(length=60), nullable=True),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('muscle_group', sa.String(length=20), nullable=False),
        sa.Column('equipment', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    with op.batch_alter_table('fitness_exercises', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_exercises_user_id'), ['user_id'], unique=False)

    op.bulk_insert(
        exercises,
        [
            {'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment}
            for slug, name, group, equipment in DEFAULT_EXERCISES
        ],
    )


def downgrade() -> None:
    with op.batch_alter_table('fitness_exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_exercises_user_id'))
    op.drop_table('fitness_exercises')
