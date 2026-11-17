from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br
from app.models import User
from app.fitness_models import Exercise, WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry
from app.fitness_schemas import (
    ProgressExerciseSchema,
    ExerciseProgressSchema,
    BodyWeightSchema,
    EditBodyWeightSchema,
    BodyWeightResponseSchema,
)
from .auth import get_current_user
from .fitness import visible_exercises
from .fitness_sessions import COMPLETED, aware, to_kg

fitness_progress_router = APIRouter(prefix="/fitness", tags=["fitness"])

EPLEY_MAX_REPS = 12


def estimated_1rm(weight: Decimal, reps: int) -> float | None:
    if weight <= 0 or reps > EPLEY_MAX_REPS:
        return None
    if reps == 1:
        return float(weight)
    return round(float(weight) * (1 + reps / 30), 1)


def completed_sets(user: User, db: Session):
    return (
        db.query(SetEntry)
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
    )


@fitness_progress_router.get("/progress/exercises", response_model=list[ProgressExerciseSchema])
def list_progress_exercises(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        completed_sets(user, db)
        .filter(SessionExercise.exercise_id.isnot(None))
        .with_entities(
            SessionExercise.exercise_id,
            func.count(func.distinct(WorkoutSession.id)),
            func.max(WorkoutSession.completed_at),
            func.max(SetEntry.weight_kg),
            func.max(SetEntry.reps),
        )
        .group_by(SessionExercise.exercise_id)
        .all()
    )
    exercises = {
        exercise.id: exercise
        for exercise in db.query(Exercise).filter(Exercise.id.in_([row[0] for row in rows]))
    } if rows else {}
    items = [
        {
            "exercise_id": exercise_id,
            "name": exercises[exercise_id].name,
            "muscle_group": exercises[exercise_id].muscle_group,
            "equipment": exercises[exercise_id].equipment,
            "sessions": sessions,
            "last_at": aware(last_at),
            "best_weight_kg": float(best_weight),
            "max_reps": max_reps,
        }
        for exercise_id, sessions, last_at, best_weight, max_reps in rows
        if exercise_id in exercises
    ]
    return sorted(items, key=lambda item: item["last_at"], reverse=True)


@fitness_progress_router.get("/exercises/{exercise_id}/progress", response_model=ExerciseProgressSchema)
def get_exercise_progress(
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exercise = visible_exercises(user, db).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")

    rows = (
        completed_sets(user, db)
        .filter(SessionExercise.exercise_id == exercise.id)
        .with_entities(
            WorkoutSession.id,
            WorkoutSession.name,
            WorkoutSession.completed_at,
            SetEntry.weight_kg,
            SetEntry.reps,
        )
        .order_by(WorkoutSession.completed_at, WorkoutSession.id, SetEntry.id)
        .all()
    )

    points: dict[int, dict] = {}
    for session_id, session_name, completed_at, weight, reps in rows:
        point = points.setdefault(session_id, {
            "session_id": session_id,
            "session_name": session_name,
            "completed_at": aware(completed_at),
            "sets": 0,
            "max_weight_kg": Decimal(0),
            "reps_at_max": 0,
            "max_reps": 0,
            "estimated_1rm_kg": None,
            "volume_kg": Decimal(0),
        })
        point["sets"] += 1
        point["volume_kg"] += weight * reps
        point["max_reps"] = max(point["max_reps"], reps)
        if weight > point["max_weight_kg"] or (weight == point["max_weight_kg"] and reps > point["reps_at_max"]):
            point["max_weight_kg"] = weight
            point["reps_at_max"] = reps
        estimate = estimated_1rm(weight, reps)
        if estimate is not None and (point["estimated_1rm_kg"] is None or estimate > point["estimated_1rm_kg"]):
            point["estimated_1rm_kg"] = estimate

    return {
        "exercise_id": exercise.id,
        "name": exercise.name,
        "muscle_group": exercise.muscle_group,
        "equipment": exercise.equipment,
        "points": [
            {**point, "max_weight_kg": float(point["max_weight_kg"]), "volume_kg": float(point["volume_kg"])}
            for point in points.values()
        ],
    }


def serialize_body_weight(entry: BodyWeightEntry) -> dict:
    return {
        "id": entry.id,
        "measured_on": entry.measured_on,
        "weight_kg": float(entry.weight_kg),
        "note": entry.note,
    }


def check_day(day: date):
    if day > today_br():
        raise HTTPException(status_code=400, detail="A data não pode ser no futuro.")


def entry_on(day: date, user: User, db: Session) -> BodyWeightEntry | None:
    return (
        db.query(BodyWeightEntry)
        .filter(BodyWeightEntry.user_id == user.id, BodyWeightEntry.measured_on == day)
        .first()
    )


@fitness_progress_router.get("/body-weight", response_model=list[BodyWeightResponseSchema])
def list_body_weight(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = (
        db.query(BodyWeightEntry)
        .filter(BodyWeightEntry.user_id == user.id)
        .order_by(BodyWeightEntry.measured_on.desc())
        .all()
    )
    return [serialize_body_weight(entry) for entry in entries]


@fitness_progress_router.post("/body-weight", response_model=BodyWeightResponseSchema)
def log_body_weight(
    data: BodyWeightSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = data.measured_on or today_br()
    check_day(day)
    entry = entry_on(day, user, db)
    if entry is None:
        entry = BodyWeightEntry(user_id=user.id, measured_on=day)
        db.add(entry)
    entry.weight_kg = to_kg(data.weight_kg)
    entry.note = data.note
    db.commit()
    db.refresh(entry)
    return serialize_body_weight(entry)


def get_own_body_weight(entry_id: int, user: User, db: Session) -> BodyWeightEntry:
    entry = (
        db.query(BodyWeightEntry)
        .filter(BodyWeightEntry.id == entry_id, BodyWeightEntry.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    return entry


@fitness_progress_router.patch("/body-weight/{entry_id}", response_model=BodyWeightResponseSchema)
def edit_body_weight(
    entry_id: int,
    data: EditBodyWeightSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_own_body_weight(entry_id, user, db)
    changes = data.model_fields_set
    if data.measured_on is not None and data.measured_on != entry.measured_on:
        check_day(data.measured_on)
        if entry_on(data.measured_on, user, db):
            raise HTTPException(
                status_code=409, detail="Já existe um registro nessa data. Edite ou exclua ele antes."
            )
        entry.measured_on = data.measured_on
    if data.weight_kg is not None:
        entry.weight_kg = to_kg(data.weight_kg)
    if "note" in changes:
        entry.note = data.note
    db.commit()
    db.refresh(entry)
    return serialize_body_weight(entry)


@fitness_progress_router.delete("/body-weight/{entry_id}")
def delete_body_weight(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(get_own_body_weight(entry_id, user, db))
    db.commit()
    return {"message": "Registro excluído"}
