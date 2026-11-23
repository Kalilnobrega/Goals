from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import CloseFriend, Exercise, FitnessProfile, Workout, WorkoutSession
from app.fitness_schemas import (
    BodyWeightResponseSchema,
    CopiedWorkoutSchema,
    ExerciseProgressSchema,
    PlanResponseSchema,
    PostWorkoutDetailSchema,
    ProgressExerciseSchema,
    SessionHistorySchema,
    StatsSchema,
    WorkoutResponseSchema,
    WorkoutSchema,
)
from .auth import get_current_user
from .fitness import build_workout_cardio, build_workout_exercises, list_workouts
from .fitness_feed import workout_detail
from .fitness_plans import list_plans
from .fitness_progress import get_exercise_progress, list_body_weight, list_progress_exercises
from .fitness_sessions import COMPLETED, list_sessions
from .fitness_social import find_profile, has_blocked, relation_to
from .fitness_stats import get_stats

fitness_close_router = APIRouter(prefix="/fitness/social/users", tags=["fitness"])

NO_ACCESS = "Só melhores amigos veem essa parte do perfil."


def close_owner(db: Session, viewer: User, username: str) -> tuple[User, FitnessProfile]:
    target = find_profile(db, username)
    if (
        target is None
        or target.user_id == viewer.id
        or has_blocked(db, target.user_id, viewer.id)
        or relation_to(db, viewer.id, target.user_id) != "friends"
        or db.get(CloseFriend, (target.user_id, viewer.id)) is None
    ):
        raise HTTPException(status_code=404, detail=NO_ACCESS)
    return db.get(User, target.user_id), target


@fitness_close_router.get("/{username}/workouts", response_model=List[WorkoutResponseSchema])
def close_workouts(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, _ = close_owner(db, user, username)
    return list_workouts(user=owner, session=db)


@fitness_close_router.get("/{username}/plan", response_model=PlanResponseSchema | None)
def close_plan(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, _ = close_owner(db, user, username)
    return next((plan for plan in list_plans(user=owner, db=db) if plan["is_active"]), None)


@fitness_close_router.get("/{username}/history", response_model=SessionHistorySchema)
def close_history(
    username: str,
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owner, _ = close_owner(db, user, username)
    return list_sessions(
        limit=20, offset=offset, q=None, workout_id=None, muscle_group=None, date_from=None, date_to=None, user=owner, db=db,
    )


@fitness_close_router.get("/{username}/sessions/{session_id}", response_model=PostWorkoutDetailSchema)
def close_session(username: str, session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, _ = close_owner(db, user, username)
    session = db.get(WorkoutSession, session_id)
    if session is None or session.user_id != owner.id or session.status != COMPLETED:
        raise HTTPException(status_code=404, detail="Treino não encontrado.")
    return workout_detail(db, session, user.id)


@fitness_close_router.get("/{username}/stats", response_model=StatsSchema)
def close_stats(
    username: str,
    period: str = Query(default="3m", pattern="^(4w|3m|6m|1y|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owner, profile = close_owner(db, user, username)
    stats = get_stats(period=period, plan_id=None, user=owner, db=db)
    if not profile.share_weight_close:
        stats["relative_strength"] = None
    return stats


@fitness_close_router.get("/{username}/progress/exercises", response_model=list[ProgressExerciseSchema])
def close_progress_exercises(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, _ = close_owner(db, user, username)
    return list_progress_exercises(user=owner, db=db)


@fitness_close_router.get("/{username}/exercises/{exercise_id}/progress", response_model=ExerciseProgressSchema)
def close_exercise_progress(
    username: str,
    exercise_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owner, _ = close_owner(db, user, username)
    return get_exercise_progress(exercise_id=exercise_id, user=owner, db=db)


@fitness_close_router.get("/{username}/body-weight", response_model=list[BodyWeightResponseSchema])
def close_body_weight(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, profile = close_owner(db, user, username)
    if not profile.share_weight_close:
        raise HTTPException(status_code=404, detail="Essa pessoa não compartilha o peso corporal.")
    return list_body_weight(user=owner, db=db)


@fitness_close_router.post("/{username}/workouts/{workout_id}/copy", response_model=CopiedWorkoutSchema)
def copy_close_workout(username: str, workout_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner, _ = close_owner(db, user, username)
    source = db.get(Workout, workout_id)
    if source is None or source.user_id != owner.id:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    ids = [item.exercise_id for item in source.exercises] + [item.exercise_id for item in source.cardio if item.exercise_id]
    usable = {
        row.id
        for row in db.query(Exercise.id).filter(Exercise.id.in_(ids), or_(Exercise.user_id.is_(None), Exercise.user_id == user.id))
    } if ids else set()
    exercises = [
        {
            "exercise_id": item.exercise_id,
            "target_sets": item.target_sets,
            "reps_min": item.reps_min,
            "reps_max": item.reps_max,
            "rest_seconds": item.rest_seconds,
            "unilateral": item.unilateral,
            "load_mode": item.load_mode,
            "superset": item.superset,
            "set_plan": item.set_plan,
        }
        for item in source.exercises
        if item.exercise_id in usable
    ]
    cardio = [
        {"exercise_id": item.exercise_id if item.exercise_id in usable else None, "phase": item.phase, "minutes": item.minutes}
        for item in source.cardio
    ]
    skipped = len(source.exercises) - len(exercises)
    if not exercises and not cardio:
        raise HTTPException(status_code=422, detail="Nenhum exercício dessa ficha pode ser copiado.")
    data = WorkoutSchema(
        name=f"{source.name} ({owner.name.split(' ')[0]})"[:60],
        description=f"Copiada da ficha de {owner.name}.",
        exercises=exercises,
        cardio=cardio,
    )
    workout = Workout(
        user_id=user.id,
        name=data.name,
        description=data.description,
        exercises=build_workout_exercises(data, user, db),
        cardio=build_workout_cardio(data),
    )
    db.add(workout)
    db.commit()
    return {"workout_id": workout.id, "name": workout.name, "skipped": skipped}
