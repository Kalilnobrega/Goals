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
    ('encolhimento', 'Encolhimento', 'back', 'dumbbell'),
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
    ('agachamento-livre', 'Agachamento livre', 'quads', 'barbell'),
    ('agachamento-hack', 'Agachamento hack', 'quads', 'machine'),
    ('leg-press', 'Leg press', 'quads', 'machine'),
    ('cadeira-extensora', 'Cadeira extensora', 'quads', 'machine'),
    ('mesa-flexora', 'Mesa flexora', 'hamstrings', 'machine'),
    ('cadeira-flexora', 'Cadeira flexora', 'hamstrings', 'machine'),
    ('cadeira-adutora', 'Cadeira adutora', 'adductors', 'machine'),
    ('afundo', 'Afundo', 'quads', 'dumbbell'),
    ('stiff', 'Stiff', 'hamstrings', 'barbell'),
    ('panturrilha-em-pe', 'Panturrilha em pé', 'calves', 'machine'),
    ('panturrilha-sentado', 'Panturrilha sentado', 'calves', 'machine'),
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


DEFAULT_MUSCLES = {
    'supino-reto': (['chest_mid'], ['chest_lower', 'delts_front', 'triceps_lateral', 'triceps_medial']),
    'supino-inclinado': (['chest_upper'], ['delts_front', 'triceps_lateral', 'triceps_medial']),
    'supino-declinado': (['chest_lower'], ['chest_mid', 'triceps_lateral', 'triceps_medial']),
    'supino-reto-halteres': (['chest_mid'], ['chest_lower', 'delts_front', 'triceps_lateral', 'triceps_medial']),
    'supino-inclinado-halteres': (['chest_upper'], ['delts_front', 'triceps_lateral', 'triceps_medial']),
    'crucifixo': (['chest_mid'], ['chest_upper', 'delts_front']),
    'peck-deck': (['chest_mid'], ['chest_upper']),
    'crossover': (['chest_lower'], ['chest_mid']),
    'flexao': (['chest_mid'], ['delts_front', 'triceps_lateral', 'triceps_medial', 'abs_rectus']),
    'puxada-frontal': (['lats'], ['biceps', 'brachialis', 'rhomboids', 'delts_rear']),
    'remada-baixa': (['lats', 'rhomboids', 'traps_mid'], ['biceps', 'delts_rear']),
    'remada-curvada': (['lats', 'rhomboids', 'traps_mid'], ['delts_rear', 'biceps', 'lower_back']),
    'remada-unilateral': (['lats'], ['rhomboids', 'traps_mid', 'delts_rear', 'biceps']),
    'remada-cavalinho': (['rhomboids', 'traps_mid', 'lats'], ['biceps', 'delts_rear']),
    'barra-fixa': (['lats'], ['biceps', 'brachialis', 'rhomboids']),
    'pulldown': (['lats'], ['triceps_long']),
    'levantamento-terra': (['lower_back', 'glute_max', 'biceps_femoris', 'semitendinosus'], ['traps_upper', 'lats', 'vastus_lateralis', 'forearm_flexors']),
    'desenvolvimento': (['delts_front'], ['delts_side', 'triceps_lateral', 'triceps_medial', 'traps_upper']),
    'desenvolvimento-maquina': (['delts_front'], ['delts_side', 'triceps_lateral', 'triceps_medial']),
    'elevacao-lateral': (['delts_side'], ['traps_upper']),
    'elevacao-frontal': (['delts_front'], ['chest_upper']),
    'crucifixo-inverso': (['delts_rear'], ['rhomboids', 'traps_mid']),
    'encolhimento': (['traps_upper'], ['forearm_flexors']),
    'rosca-direta': (['biceps'], ['brachialis', 'forearm_flexors']),
    'rosca-alternada': (['biceps'], ['brachialis', 'forearm_flexors']),
    'rosca-martelo': (['brachialis', 'brachioradialis'], ['biceps']),
    'rosca-scott': (['biceps'], ['brachialis']),
    'rosca-cabo': (['biceps'], ['brachialis']),
    'triceps-pulley': (['triceps_lateral', 'triceps_medial'], ['triceps_long']),
    'triceps-corda': (['triceps_lateral', 'triceps_medial'], ['triceps_long']),
    'triceps-testa': (['triceps_long', 'triceps_lateral'], ['triceps_medial']),
    'triceps-frances': (['triceps_long'], ['triceps_lateral', 'triceps_medial']),
    'mergulho': (['triceps_lateral', 'triceps_medial', 'triceps_long'], ['chest_lower', 'delts_front']),
    'agachamento-livre': (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris', 'glute_max'], ['adductors', 'lower_back']),
    'agachamento-hack': (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris'], ['glute_max']),
    'leg-press': (['vastus_lateralis', 'vastus_medialis'], ['rectus_femoris', 'glute_max', 'adductors']),
    'cadeira-extensora': (['rectus_femoris', 'vastus_lateralis', 'vastus_medialis'], []),
    'mesa-flexora': (['biceps_femoris', 'semitendinosus'], ['gastrocnemius']),
    'cadeira-flexora': (['biceps_femoris', 'semitendinosus'], []),
    'cadeira-adutora': (['adductors'], []),
    'afundo': (['vastus_lateralis', 'vastus_medialis', 'glute_max'], ['rectus_femoris', 'adductors', 'glute_med']),
    'stiff': (['biceps_femoris', 'semitendinosus'], ['glute_max', 'lower_back']),
    'panturrilha-em-pe': (['gastrocnemius'], ['soleus']),
    'panturrilha-sentado': (['soleus'], ['gastrocnemius']),
    'elevacao-pelvica': (['glute_max'], ['glute_med', 'biceps_femoris', 'semitendinosus']),
    'cadeira-abdutora': (['glute_med'], ['glute_max']),
    'coice-cabo': (['glute_max'], ['glute_med', 'biceps_femoris']),
    'abdominal-supra': (['abs_rectus'], ['obliques']),
    'abdominal-infra': (['abs_rectus'], ['obliques']),
    'abdominal-maquina': (['abs_rectus'], ['obliques']),
    'prancha': (['abs_rectus'], ['obliques']),
}


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

    exercise_muscles = op.create_table(
        'fitness_exercise_muscles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('exercise_id', sa.Integer(), nullable=False),
        sa.Column('muscle', sa.String(length=30), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False),
        sa.ForeignKeyConstraint(['exercise_id'], ['fitness_exercises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('exercise_id', 'muscle', name='uq_fitness_exercise_muscles'),
    )
    with op.batch_alter_table('fitness_exercise_muscles', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_exercise_muscles_exercise_id'), ['exercise_id'], unique=False)

    ids = dict(op.get_bind().execute(sa.text('SELECT slug, id FROM fitness_exercises WHERE slug IS NOT NULL')).all())
    op.bulk_insert(
        exercise_muscles,
        [
            {'exercise_id': ids[slug], 'muscle': muscle, 'role': role}
            for slug, (primary, secondary) in DEFAULT_MUSCLES.items()
            for role, muscles in (('primary', primary), ('secondary', secondary))
            for muscle in muscles
        ],
    )

    op.create_table(
        'fitness_workouts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('description', sa.String(length=300), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_workouts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_workouts_user_id'), ['user_id'], unique=False)

    op.create_table(
        'fitness_workout_exercises',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=False),
        sa.Column('exercise_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('target_sets', sa.Integer(), nullable=False),
        sa.Column('reps_min', sa.Integer(), nullable=False),
        sa.Column('reps_max', sa.Integer(), nullable=True),
        sa.Column('rest_seconds', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['workout_id'], ['fitness_workouts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['exercise_id'], ['fitness_exercises.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_workout_exercises', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_workout_exercises_workout_id'), ['workout_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_fitness_workout_exercises_exercise_id'), ['exercise_id'], unique=False)

    op.create_table(
        'fitness_sessions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_id'], ['fitness_workouts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_sessions_workout_id'), ['workout_id'], unique=False)
        batch_op.create_index('ix_fitness_sessions_user_started', ['user_id', 'started_at'], unique=False)
        batch_op.create_index(
            'ix_fitness_sessions_one_active',
            ['user_id'],
            unique=True,
            sqlite_where=sa.text("status = 'in_progress'"),
            postgresql_where=sa.text("status = 'in_progress'"),
        )

    op.create_table(
        'fitness_session_exercises',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('exercise_id', sa.Integer(), nullable=True),
        sa.Column('workout_exercise_id', sa.Integer(), nullable=True),
        sa.Column('exercise_name', sa.String(length=60), nullable=False),
        sa.Column('muscle_group', sa.String(length=20), nullable=False),
        sa.Column('equipment', sa.String(length=20), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('target_sets', sa.Integer(), nullable=True),
        sa.Column('reps_min', sa.Integer(), nullable=True),
        sa.Column('reps_max', sa.Integer(), nullable=True),
        sa.Column('rest_seconds', sa.Integer(), nullable=True),
        sa.Column('muscles', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['fitness_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['exercise_id'], ['fitness_exercises.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workout_exercise_id'], ['fitness_workout_exercises.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_session_exercises', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_session_exercises_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_fitness_session_exercises_exercise_id'), ['exercise_id'], unique=False)

    op.create_table(
        'fitness_sets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_exercise_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('weight_kg', sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column('reps', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('client_id', sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(['session_exercise_id'], ['fitness_session_exercises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_exercise_id', 'client_id', name='uq_fitness_sets_client_id'),
    )
    with op.batch_alter_table('fitness_sets', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_sets_session_exercise_id'), ['session_exercise_id'], unique=False)

    op.create_table(
        'fitness_body_weights',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('measured_on', sa.Date(), nullable=False),
        sa.Column('weight_kg', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('note', sa.String(length=140), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'measured_on', name='uq_fitness_body_weights_user_day'),
    )
    with op.batch_alter_table('fitness_body_weights', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_body_weights_user_id'), ['user_id'], unique=False)


    op.create_table(
        'fitness_plans',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_plans', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_plans_user_id'), ['user_id'], unique=False)
        batch_op.create_index(
            'ix_fitness_plans_one_active',
            ['user_id'],
            unique=True,
            sqlite_where=sa.text('is_active'),
            postgresql_where=sa.text('is_active'),
        )

    op.create_table(
        'fitness_plan_days',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=False),
        sa.Column('weekday', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['fitness_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_id'], ['fitness_workouts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('fitness_plan_days', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fitness_plan_days_plan_id'), ['plan_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_fitness_plan_days_workout_id'), ['workout_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('fitness_plan_days', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_plan_days_workout_id'))
        batch_op.drop_index(batch_op.f('ix_fitness_plan_days_plan_id'))
    op.drop_table('fitness_plan_days')
    with op.batch_alter_table('fitness_plans', schema=None) as batch_op:
        batch_op.drop_index('ix_fitness_plans_one_active')
        batch_op.drop_index(batch_op.f('ix_fitness_plans_user_id'))
    op.drop_table('fitness_plans')
    with op.batch_alter_table('fitness_body_weights', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_body_weights_user_id'))
    op.drop_table('fitness_body_weights')
    with op.batch_alter_table('fitness_sets', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_sets_session_exercise_id'))
    op.drop_table('fitness_sets')
    with op.batch_alter_table('fitness_session_exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_session_exercises_exercise_id'))
        batch_op.drop_index(batch_op.f('ix_fitness_session_exercises_session_id'))
    op.drop_table('fitness_session_exercises')
    with op.batch_alter_table('fitness_sessions', schema=None) as batch_op:
        batch_op.drop_index('ix_fitness_sessions_one_active')
        batch_op.drop_index('ix_fitness_sessions_user_started')
        batch_op.drop_index(batch_op.f('ix_fitness_sessions_workout_id'))
    op.drop_table('fitness_sessions')
    with op.batch_alter_table('fitness_workout_exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_workout_exercises_exercise_id'))
        batch_op.drop_index(batch_op.f('ix_fitness_workout_exercises_workout_id'))
    op.drop_table('fitness_workout_exercises')
    with op.batch_alter_table('fitness_workouts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_workouts_user_id'))
    op.drop_table('fitness_workouts')
    with op.batch_alter_table('fitness_exercise_muscles', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_exercise_muscles_exercise_id'))
    op.drop_table('fitness_exercise_muscles')
    with op.batch_alter_table('fitness_exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fitness_exercises_user_id'))
    op.drop_table('fitness_exercises')
