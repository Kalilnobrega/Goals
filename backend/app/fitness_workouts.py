from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import User
from app.fitness_models import Exercise, Plan, WorkoutCardio, WorkoutExercise
from app.fitness_schemas import WorkoutSchema
from app.fitness_supersets import superset_numbers


def visible_exercises(user: User, session: Session):
    return session.query(Exercise).filter(
        or_(Exercise.user_id.is_(None), Exercise.user_id == user.id)
    )


CARDIO = "cardio"


def build_workout_exercises(data: WorkoutSchema, user: User, session: Session) -> list[WorkoutExercise]:
    ids = {item.exercise_id for item in data.exercises} | {item.exercise_id for item in data.cardio if item.exercise_id is not None}
    tracking = dict(
        visible_exercises(user, session)
        .filter(Exercise.id.in_(ids))
        .with_entities(Exercise.id, Exercise.tracking)
        .all()
    ) if ids else {}
    if ids - set(tracking):
        raise HTTPException(status_code=400, detail="Algum exercício da ficha não foi encontrado.")
    if any(tracking[item.exercise_id] == CARDIO for item in data.exercises):
        raise HTTPException(status_code=400, detail="Cardio vai no bloco de cardio da ficha, não entre os exercícios.")
    if any(item.exercise_id is not None and tracking[item.exercise_id] != CARDIO for item in data.cardio):
        raise HTTPException(status_code=400, detail="O bloco de cardio aceita só exercícios de cardio.")
    supersets = superset_numbers([item.superset for item in data.exercises])
    return [
        WorkoutExercise(
            exercise_id=item.exercise_id,
            position=index,
            target_sets=item.target_sets,
            reps_min=item.reps_min,
            reps_max=item.reps_max,
            rest_seconds=item.rest_seconds,
            unilateral=item.unilateral,
            load_mode=item.load_mode,
            superset=supersets[index],
            set_plan=item.set_plan if tracking[item.exercise_id] == "reps" else None,
        )
        for index, item in enumerate(data.exercises)
    ]


def build_workout_cardio(data: WorkoutSchema) -> list[WorkoutCardio]:
    positions = {"start": 0, "end": 0}
    items = []
    for item in data.cardio:
        items.append(WorkoutCardio(exercise_id=item.exercise_id, phase=item.phase, position=positions[item.phase], minutes=item.minutes))
        positions[item.phase] += 1
    return items


MAX_PLANS = 20


def ensure_plan_room(user: User, db: Session) -> None:
    if db.query(Plan).filter(Plan.user_id == user.id).count() >= MAX_PLANS:
        raise HTTPException(status_code=400, detail=f"Você pode ter no máximo {MAX_PLANS} planos.")
