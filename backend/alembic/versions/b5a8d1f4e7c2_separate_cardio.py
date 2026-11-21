"""separate cardio from workout exercises into start and end blocks

Revision ID: b5a8d1f4e7c2
Revises: b3f6d9a2c5e8
Create Date: 2026-11-21 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5a8d1f4e7c2'
down_revision: Union[str, Sequence[str], None] = 'b3f6d9a2c5e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def phases(rows: list[tuple[int, int, bool]]) -> dict[int, str]:
    first_exercise = min((position for _, position, cardio in rows if not cardio), default=None)
    return {
        item_id: 'start' if first_exercise is not None and position < first_exercise else 'end'
        for item_id, position, cardio in rows
        if cardio
    }


def upgrade() -> None:
    op.create_table(
        'fitness_workout_cardio',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('workout_id', sa.Integer(), sa.ForeignKey('fitness_workouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exercise_id', sa.Integer(), sa.ForeignKey('fitness_exercises.id', ondelete='SET NULL'), nullable=True),
        sa.Column('phase', sa.String(length=5), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('minutes', sa.Integer(), nullable=False),
    )
    op.create_index('ix_fitness_workout_cardio_workout_id', 'fitness_workout_cardio', ['workout_id'])
    op.create_index('ix_fitness_workout_cardio_exercise_id', 'fitness_workout_cardio', ['exercise_id'])
    op.add_column('fitness_session_exercises', sa.Column('phase', sa.String(length=5), nullable=True))

    bind = op.get_bind()
    workout_rows = bind.execute(sa.text(
        "SELECT w.workout_id, w.id, w.position, e.tracking = 'cardio', w.exercise_id, w.reps_min "
        "FROM fitness_workout_exercises w JOIN fitness_exercises e ON e.id = w.exercise_id ORDER BY w.workout_id, w.position"
    )).all()
    by_workout: dict[int, list] = {}
    for row in workout_rows:
        by_workout.setdefault(row[0], []).append(row)
    moved = []
    for rows in by_workout.values():
        placed = phases([(row[1], row[2], row[3]) for row in rows])
        counters = {'start': 0, 'end': 0}
        for row in rows:
            if row[1] not in placed:
                continue
            phase = placed[row[1]]
            bind.execute(
                sa.text(
                    'INSERT INTO fitness_workout_cardio (workout_id, exercise_id, phase, position, minutes) '
                    'VALUES (:workout_id, :exercise_id, :phase, :position, :minutes)'
                ),
                {'workout_id': row[0], 'exercise_id': row[4], 'phase': phase, 'position': counters[phase], 'minutes': row[5]},
            )
            counters[phase] += 1
            moved.append(row[1])
        remaining = [row for row in rows if row[1] not in placed]
        for index, row in enumerate(remaining):
            bind.execute(sa.text('UPDATE fitness_workout_exercises SET position = :position WHERE id = :id'), {'position': index, 'id': row[1]})
    if moved:
        bind.execute(
            sa.text('UPDATE fitness_session_exercises SET workout_exercise_id = NULL WHERE workout_exercise_id IN :ids')
            .bindparams(sa.bindparam('ids', expanding=True)),
            {'ids': moved},
        )
        bind.execute(
            sa.text('DELETE FROM fitness_workout_exercises WHERE id IN :ids').bindparams(sa.bindparam('ids', expanding=True)),
            {'ids': moved},
        )

    session_rows = bind.execute(sa.text(
        "SELECT session_id, id, position, tracking = 'cardio' FROM fitness_session_exercises ORDER BY session_id, position"
    )).all()
    by_session: dict[int, list] = {}
    for row in session_rows:
        by_session.setdefault(row[0], []).append((row[1], row[2], row[3]))
    for rows in by_session.values():
        for item_id, phase in phases(rows).items():
            bind.execute(sa.text('UPDATE fitness_session_exercises SET phase = :phase WHERE id = :id'), {'phase': phase, 'id': item_id})


def downgrade() -> None:
    bind = op.get_bind()
    cardio_rows = bind.execute(sa.text(
        'SELECT workout_id, exercise_id, phase, position, minutes FROM fitness_workout_cardio '
        'WHERE exercise_id IS NOT NULL ORDER BY workout_id, phase DESC, position'
    )).all()
    by_workout: dict[int, list] = {}
    for row in cardio_rows:
        by_workout.setdefault(row[0], []).append(row)
    for workout_id, rows in by_workout.items():
        starts = [row for row in rows if row[2] == 'start']
        ends = [row for row in rows if row[2] == 'end']
        if starts:
            bind.execute(
                sa.text('UPDATE fitness_workout_exercises SET position = position + :shift WHERE workout_id = :workout_id'),
                {'shift': len(starts), 'workout_id': workout_id},
            )
        last = bind.execute(
            sa.text('SELECT COALESCE(MAX(position), -1) FROM fitness_workout_exercises WHERE workout_id = :workout_id'),
            {'workout_id': workout_id},
        ).scalar()
        placed = [(index, row) for index, row in enumerate(starts)] + [(last + 1 + index, row) for index, row in enumerate(ends)]
        for position, row in placed:
            bind.execute(
                sa.text(
                    'INSERT INTO fitness_workout_exercises (workout_id, exercise_id, position, target_sets, reps_min) '
                    'VALUES (:workout_id, :exercise_id, :position, 1, :minutes)'
                ),
                {'workout_id': workout_id, 'exercise_id': row[1], 'position': position, 'minutes': row[4]},
            )
    with op.batch_alter_table('fitness_session_exercises') as batch_op:
        batch_op.drop_column('phase')
    op.drop_index('ix_fitness_workout_cardio_exercise_id', table_name='fitness_workout_cardio')
    op.drop_index('ix_fitness_workout_cardio_workout_id', table_name='fitness_workout_cardio')
    op.drop_table('fitness_workout_cardio')
