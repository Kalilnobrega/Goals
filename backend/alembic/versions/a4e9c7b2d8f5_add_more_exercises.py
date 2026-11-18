"""add more default exercises and plate loaded machines

Revision ID: a4e9c7b2d8f5
Revises: f2c8a4d6b9e1
Create Date: 2026-11-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a4e9c7b2d8f5'
down_revision: Union[str, Sequence[str], None] = 'f2c8a4d6b9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PRESS = (['chest_mid'], ['chest_upper', 'chest_lower', 'delts_front'], ['triceps_lateral', 'triceps_medial'])
INCLINE_PRESS = (['chest_upper'], ['chest_mid', 'delts_front'], ['triceps_lateral', 'triceps_medial'])
DECLINE_PRESS = (['chest_lower'], ['chest_mid'], ['delts_front', 'triceps_lateral', 'triceps_medial'])
FLY = (['chest_mid'], ['chest_upper', 'chest_lower'], ['delts_front'])
INCLINE_FLY = (['chest_upper'], ['chest_mid'], ['delts_front'])
DECLINE_FLY = (['chest_lower'], ['chest_mid'], ['delts_front'])
ROW_PRONATED = (['rhomboids', 'traps_mid', 'lats'], ['delts_rear', 'biceps'], ['brachialis', 'brachioradialis'])
ROW_SUPINATED = (['lats'], ['rhomboids', 'traps_mid', 'biceps'], ['delts_rear', 'brachialis'])
ROW_NEUTRAL = (['lats', 'rhomboids', 'traps_mid'], ['delts_rear', 'biceps', 'brachialis'], ['brachioradialis'])
PULLDOWN = (['lats'], ['biceps', 'rhomboids', 'traps_mid'], ['brachialis', 'delts_rear', 'forearm_flexors'])
OVERHEAD_PRESS = (['delts_front'], ['delts_side', 'triceps_lateral', 'triceps_medial'], ['traps_upper', 'chest_upper'])
LATERAL_RAISE = (['delts_side'], [], ['traps_upper', 'delts_front'])
REAR_DELT = (['delts_rear'], ['rhomboids', 'traps_mid'], ['delts_side'])
CURL = (['biceps'], ['brachialis'], ['brachioradialis', 'forearm_flexors'])
LONG_HEAD_CURL = (['biceps'], ['brachialis'], ['brachioradialis'])
HAMMER = (['brachialis', 'brachioradialis'], ['biceps'], ['forearm_flexors'])
PUSHDOWN = (['triceps_lateral', 'triceps_medial'], ['triceps_long'], [])
OVERHEAD_TRICEPS = (['triceps_long'], ['triceps_lateral', 'triceps_medial'], [])
SQUAT = (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris', 'glute_max'], ['adductors'], ['lower_back', 'biceps_femoris', 'glute_med'])
MACHINE_SQUAT = (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris'], ['glute_max'], ['adductors'])
LEG_PRESS = (['vastus_lateralis', 'vastus_medialis'], ['rectus_femoris', 'glute_max', 'adductors'], ['biceps_femoris'])
LUNGE = (['vastus_lateralis', 'vastus_medialis', 'glute_max'], ['rectus_femoris', 'adductors', 'glute_med'], ['biceps_femoris'])
HINGE = (['biceps_femoris', 'semitendinosus'], ['glute_max', 'lower_back'], ['adductors', 'forearm_flexors'])
LEG_CURL = (['biceps_femoris', 'semitendinosus'], [], ['gastrocnemius'])
HIP_THRUST = (['glute_max'], ['glute_med', 'biceps_femoris', 'semitendinosus'], ['adductors'])
KICKBACK = (['glute_max'], ['glute_med'], ['biceps_femoris', 'semitendinosus'])
ABDUCTION = (['glute_med'], ['glute_max'], [])
STANDING_CALF = (['gastrocnemius'], ['soleus'], [])
CRUNCH = (['abs_rectus'], ['obliques'], [])

NEW_EXERCISES = [
    ('supino-smith', 'Supino reto no Smith', 'chest', 'smith', PRESS),
    ('supino-inclinado-smith', 'Supino inclinado no Smith', 'chest', 'smith', INCLINE_PRESS),
    ('supino-declinado-smith', 'Supino declinado no Smith', 'chest', 'smith', DECLINE_PRESS),
    ('supino-declinado-halteres', 'Supino declinado com halteres', 'chest', 'dumbbell', DECLINE_PRESS),
    ('supino-maquina', 'Supino reto na máquina', 'chest', 'machine', PRESS),
    ('supino-inclinado-maquina', 'Supino inclinado na máquina', 'chest', 'machine', INCLINE_PRESS),
    ('supino-articulado', 'Supino reto articulado', 'chest', 'plate_loaded', PRESS),
    ('supino-inclinado-articulado', 'Supino inclinado articulado', 'chest', 'plate_loaded', INCLINE_PRESS),
    ('supino-declinado-articulado', 'Supino declinado articulado', 'chest', 'plate_loaded', DECLINE_PRESS),
    ('crucifixo-inclinado', 'Crucifixo inclinado', 'chest', 'dumbbell', INCLINE_FLY),
    ('crucifixo-polia', 'Crucifixo na polia', 'chest', 'cable', FLY),
    ('crucifixo-polia-inclinado', 'Crucifixo inclinado na polia', 'chest', 'cable', INCLINE_FLY),
    ('crucifixo-polia-declinado', 'Crucifixo declinado na polia', 'chest', 'cable', DECLINE_FLY),
    ('crossover-polia-baixa', 'Crossover polia baixa', 'chest', 'cable', INCLINE_FLY),
    ('pullover', 'Pullover', 'back', 'dumbbell', (['lats'], ['chest_mid', 'chest_lower', 'triceps_long'], ['delts_rear'])),

    ('remada-articulada-pronada', 'Remada articulada pegada pronada', 'back', 'plate_loaded', ROW_PRONATED),
    ('remada-articulada-supinada', 'Remada articulada pegada supinada', 'back', 'plate_loaded', ROW_SUPINATED),
    ('remada-articulada-neutra', 'Remada articulada pegada neutra', 'back', 'plate_loaded', ROW_NEUTRAL),
    ('remada-maquina-pronada', 'Remada na máquina pegada pronada', 'back', 'machine', ROW_PRONATED),
    ('remada-maquina-supinada', 'Remada na máquina pegada supinada', 'back', 'machine', ROW_SUPINATED),
    ('remada-maquina-neutra', 'Remada na máquina pegada neutra', 'back', 'machine', ROW_NEUTRAL),
    ('remada-t-bar', 'Remada T-bar', 'back', 'plate_loaded', ROW_NEUTRAL),
    ('remada-curvada-supinada', 'Remada curvada supinada', 'back', 'barbell', (['lats'], ['rhomboids', 'traps_mid', 'biceps', 'lower_back'], ['delts_rear', 'brachialis'])),
    ('remada-smith', 'Remada no Smith', 'back', 'smith', ROW_PRONATED),
    ('remada-unilateral-cabo', 'Remada unilateral no cabo', 'back', 'cable', (['lats'], ['rhomboids', 'traps_mid', 'delts_rear', 'biceps'], ['brachialis'])),
    ('puxada-supinada', 'Puxada pegada supinada', 'back', 'cable', (['lats'], ['biceps', 'rhomboids'], ['brachialis', 'traps_mid'])),
    ('puxada-neutra', 'Puxada pegada neutra', 'back', 'cable', (['lats'], ['rhomboids', 'traps_mid', 'brachialis', 'biceps'], ['delts_rear'])),
    ('puxada-unilateral', 'Puxada unilateral', 'back', 'cable', PULLDOWN),
    ('puxada-articulada', 'Puxada articulada', 'back', 'plate_loaded', PULLDOWN),
    ('pull-around', 'Pull around', 'back', 'cable', (['lats'], ['delts_rear'], ['triceps_long', 'rhomboids'])),
    ('barra-fixa-supinada', 'Barra fixa supinada', 'back', 'bodyweight', (['lats'], ['biceps', 'brachialis'], ['rhomboids', 'traps_mid', 'abs_rectus'])),
    ('barra-fixa-assistida', 'Barra fixa assistida', 'back', 'machine', (['lats'], ['biceps', 'brachialis', 'rhomboids'], ['traps_mid', 'forearm_flexors'])),
    ('banco-romano', 'Extensão lombar no banco romano', 'back', 'bodyweight', (['lower_back'], ['glute_max', 'biceps_femoris', 'semitendinosus'], [])),
    ('encolhimento-barra', 'Encolhimento com barra', 'back', 'barbell', (['traps_upper'], [], ['traps_mid', 'forearm_flexors'])),
    ('encolhimento-smith', 'Encolhimento no Smith', 'back', 'smith', (['traps_upper'], [], ['traps_mid', 'forearm_flexors'])),

    ('desenvolvimento-barra', 'Desenvolvimento com barra', 'shoulders', 'barbell', OVERHEAD_PRESS),
    ('desenvolvimento-smith', 'Desenvolvimento no Smith', 'shoulders', 'smith', OVERHEAD_PRESS),
    ('desenvolvimento-articulado', 'Desenvolvimento articulado', 'shoulders', 'plate_loaded', OVERHEAD_PRESS),
    ('desenvolvimento-arnold', 'Desenvolvimento Arnold', 'shoulders', 'dumbbell', (['delts_front'], ['delts_side', 'triceps_lateral', 'triceps_medial'], ['traps_upper'])),
    ('elevacao-lateral-cabo', 'Elevação lateral no cabo', 'shoulders', 'cable', LATERAL_RAISE),
    ('elevacao-lateral-maquina', 'Elevação lateral na máquina', 'shoulders', 'machine', LATERAL_RAISE),
    ('elevacao-frontal-cabo', 'Elevação frontal no cabo', 'shoulders', 'cable', (['delts_front'], ['chest_upper'], ['delts_side'])),
    ('crucifixo-inverso-maquina', 'Crucifixo inverso na máquina', 'shoulders', 'machine', REAR_DELT),
    ('crucifixo-inverso-cabo', 'Crucifixo inverso no cabo', 'shoulders', 'cable', REAR_DELT),
    ('face-pull', 'Face pull', 'shoulders', 'cable', (['delts_rear'], ['traps_mid', 'rhomboids'], ['delts_side', 'biceps'])),
    ('remada-alta', 'Remada alta', 'shoulders', 'barbell', (['delts_side', 'traps_upper'], ['delts_front'], ['biceps', 'brachioradialis'])),
    ('remada-alta-cabo', 'Remada alta no cabo', 'shoulders', 'cable', (['delts_side', 'traps_upper'], ['delts_front'], ['biceps', 'brachioradialis'])),

    ('rosca-maquina', 'Rosca na máquina', 'biceps', 'machine', CURL),
    ('rosca-scott-barra', 'Rosca Scott com barra', 'biceps', 'barbell', (['biceps'], ['brachialis'], ['brachioradialis'])),
    ('rosca-scott-halter', 'Rosca Scott com halter', 'biceps', 'dumbbell', (['biceps'], ['brachialis'], ['brachioradialis'])),
    ('rosca-inclinada', 'Rosca inclinada com halteres', 'biceps', 'dumbbell', LONG_HEAD_CURL),
    ('rosca-bayesiana', 'Rosca bayesiana no cabo', 'biceps', 'cable', LONG_HEAD_CURL),
    ('rosca-concentrada', 'Rosca concentrada', 'biceps', 'dumbbell', (['biceps'], ['brachialis'], [])),
    ('rosca-barra-w', 'Rosca com barra W', 'biceps', 'barbell', CURL),
    ('rosca-martelo-corda', 'Rosca martelo na corda', 'biceps', 'cable', HAMMER),
    ('rosca-inversa', 'Rosca inversa', 'forearms', 'barbell', (['brachioradialis', 'brachialis'], ['biceps'], ['forearm_extensors'])),

    ('triceps-maquina', 'Tríceps na máquina', 'triceps', 'machine', PUSHDOWN),
    ('triceps-frances-cabo', 'Tríceps francês no cabo', 'triceps', 'cable', OVERHEAD_TRICEPS),
    ('triceps-testa-cabo', 'Tríceps testa no cabo', 'triceps', 'cable', OVERHEAD_TRICEPS),
    ('triceps-coice', 'Tríceps coice', 'triceps', 'dumbbell', (['triceps_lateral', 'triceps_long'], ['triceps_medial'], [])),
    ('triceps-unilateral-cabo', 'Tríceps unilateral no cabo', 'triceps', 'cable', PUSHDOWN),
    ('supino-fechado', 'Supino fechado', 'triceps', 'barbell', (['triceps_lateral', 'triceps_medial'], ['chest_mid', 'triceps_long'], ['delts_front'])),
    ('mergulho-maquina', 'Mergulho na máquina', 'triceps', 'machine', (['triceps_lateral', 'triceps_medial', 'triceps_long'], ['chest_lower'], ['delts_front'])),

    ('flexao-punho', 'Flexão de punho', 'forearms', 'barbell', (['forearm_flexors'], [], [])),
    ('extensao-punho', 'Extensão de punho', 'forearms', 'barbell', (['forearm_extensors'], ['brachioradialis'], [])),

    ('agachamento-pendulo', 'Agachamento pêndulo', 'quads', 'plate_loaded', MACHINE_SQUAT),
    ('agachamento-smith', 'Agachamento no Smith', 'quads', 'smith', SQUAT),
    ('agachamento-frontal', 'Agachamento frontal', 'quads', 'barbell', (['vastus_lateralis', 'vastus_medialis', 'rectus_femoris'], ['glute_max', 'adductors'], ['abs_rectus', 'lower_back'])),
    ('agachamento-goblet', 'Agachamento goblet', 'quads', 'dumbbell', SQUAT),
    ('agachamento-bulgaro', 'Agachamento búlgaro', 'quads', 'dumbbell', LUNGE),
    ('agachamento-sumo', 'Agachamento sumô', 'adductors', 'dumbbell', (['adductors', 'glute_max'], ['vastus_lateralis', 'vastus_medialis'], ['biceps_femoris', 'semitendinosus'])),
    ('leg-press-horizontal', 'Leg press horizontal', 'quads', 'machine', LEG_PRESS),
    ('passada', 'Passada', 'quads', 'dumbbell', LUNGE),
    ('subida-banco', 'Subida no banco', 'quads', 'dumbbell', LUNGE),

    ('stiff-halteres', 'Stiff com halteres', 'hamstrings', 'dumbbell', HINGE),
    ('stiff-romeno', 'Stiff romeno', 'hamstrings', 'barbell', HINGE),
    ('flexora-em-pe', 'Flexora em pé', 'hamstrings', 'machine', LEG_CURL),

    ('elevacao-pelvica-maquina', 'Elevação pélvica na máquina', 'glutes', 'machine', HIP_THRUST),
    ('elevacao-pelvica-smith', 'Elevação pélvica no Smith', 'glutes', 'smith', HIP_THRUST),
    ('elevacao-quadril-cabo', 'Elevação de quadril no cabo', 'glutes', 'cable', (['glute_max'], ['biceps_femoris', 'semitendinosus'], ['lower_back'])),
    ('ponte-gluteo', 'Ponte de glúteo', 'glutes', 'bodyweight', HIP_THRUST),
    ('coice-maquina', 'Coice na máquina', 'glutes', 'machine', KICKBACK),
    ('abducao-cabo', 'Abdução de quadril no cabo', 'glutes', 'cable', ABDUCTION),
    ('aducao-cabo', 'Adução de quadril no cabo', 'adductors', 'cable', (['adductors'], [], [])),
    ('swing-kettlebell', 'Swing com kettlebell', 'glutes', 'kettlebell', (['glute_max', 'biceps_femoris', 'semitendinosus'], ['lower_back'], ['delts_front', 'abs_rectus'])),

    ('panturrilha-leg', 'Panturrilha no leg press', 'calves', 'plate_loaded', STANDING_CALF),
    ('panturrilha-leg-horizontal', 'Panturrilha no leg horizontal', 'calves', 'machine', STANDING_CALF),
    ('panturrilha-smith', 'Panturrilha em pé no Smith', 'calves', 'smith', STANDING_CALF),
    ('panturrilha-unilateral', 'Panturrilha unilateral com halter', 'calves', 'dumbbell', STANDING_CALF),

    ('abdominal-cabo', 'Abdominal na polia', 'abs', 'cable', CRUNCH),
    ('elevacao-pernas', 'Elevação de pernas na barra', 'abs', 'bodyweight', (['abs_rectus'], ['obliques'], ['forearm_flexors'])),
    ('abdominal-obliquo', 'Abdominal oblíquo', 'abs', 'bodyweight', (['obliques'], ['abs_rectus'], [])),
    ('prancha-lateral', 'Prancha lateral', 'abs', 'bodyweight', (['obliques'], ['abs_rectus'], ['glute_med'])),
    ('rotacao-russa', 'Rotação russa', 'abs', 'bodyweight', (['obliques'], ['abs_rectus'], [])),
    ('abdominal-roda', 'Abdominal com roda', 'abs', 'other', (['abs_rectus'], ['obliques'], ['lats', 'lower_back'])),

    ('escada', 'Escada', 'cardio', 'machine', None),
    ('remo-ergometro', 'Remo ergométrico', 'cardio', 'machine', None),
    ('pular-corda', 'Pular corda', 'cardio', 'other', None),
]

RECLASSIFIED = {
    'leg-press': ('machine', 'plate_loaded'),
    'agachamento-hack': ('machine', 'plate_loaded'),
    'panturrilha-sentado': ('machine', 'plate_loaded'),
}

exercises = sa.table(
    'fitness_exercises',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('muscle_group', sa.String),
    sa.column('equipment', sa.String),
)
exercise_muscles = sa.table(
    'fitness_exercise_muscles',
    sa.column('exercise_id', sa.Integer),
    sa.column('muscle', sa.String),
    sa.column('role', sa.String),
)


def upgrade() -> None:
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text('SELECT slug FROM fitness_exercises WHERE slug IS NOT NULL'))}
    added = [item for item in NEW_EXERCISES if item[0] not in existing]
    op.bulk_insert(
        exercises,
        [{'slug': slug, 'name': name, 'muscle_group': group, 'equipment': equipment} for slug, name, group, equipment, _ in added],
    )
    ids = dict(bind.execute(sa.text('SELECT slug, id FROM fitness_exercises WHERE slug IS NOT NULL')).all())
    op.bulk_insert(
        exercise_muscles,
        [
            {'exercise_id': ids[slug], 'muscle': muscle, 'role': role}
            for slug, _, _, _, muscles in added
            if muscles
            for role, keys in zip(('primary', 'secondary', 'auxiliary'), muscles)
            for muscle in keys
        ],
    )
    for slug, (_, new) in RECLASSIFIED.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET equipment = :equipment WHERE slug = :slug AND user_id IS NULL'),
            {'equipment': new, 'slug': slug},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for slug, (old, _) in RECLASSIFIED.items():
        bind.execute(
            sa.text('UPDATE fitness_exercises SET equipment = :equipment WHERE slug = :slug AND user_id IS NULL'),
            {'equipment': old, 'slug': slug},
        )
    slugs = [item[0] for item in NEW_EXERCISES]
    expanding = sa.bindparam('slugs', expanding=True)
    bind.execute(
        sa.text(
            'DELETE FROM fitness_exercise_muscles WHERE exercise_id IN '
            '(SELECT id FROM fitness_exercises WHERE slug IN :slugs)'
        ).bindparams(expanding),
        {'slugs': slugs},
    )
    bind.execute(sa.text('DELETE FROM fitness_exercises WHERE slug IN :slugs').bindparams(expanding), {'slugs': slugs})
