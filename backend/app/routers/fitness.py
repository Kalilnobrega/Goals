from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.fitness_models import Exercise, Workout, WorkoutExercise
from app.fitness_schemas import (
    ExerciseSchema,
    EditExerciseSchema,
    ExerciseResponseSchema,
    WorkoutSchema,
    WorkoutResponseSchema,
)
from .auth import get_current_user

fitness_router = APIRouter(prefix="/fitness", tags=["fitness"])


def visible_exercises(user: User, session: Session):
    return session.query(Exercise).filter(
        or_(Exercise.user_id.is_(None), Exercise.user_id == user.id)
    )


def get_own_exercise(exercise_id: int, user: User, session: Session) -> Exercise:
    exercise = visible_exercises(user, session).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    if not exercise.is_custom:
        raise HTTPException(
            status_code=403, detail="Exercícios da biblioteca padrão não podem ser alterados."
        )
    return exercise


def ensure_unique_name(name: str, user: User, session: Session, exclude_id: int | None = None):
    query = visible_exercises(user, session).filter(func.lower(Exercise.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Exercise.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Já existe um exercício com esse nome.")


@fitness_router.get("/exercises", response_model=List[ExerciseResponseSchema])
def list_exercises(
    user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    return visible_exercises(user, session).order_by(Exercise.name, Exercise.id).all()


@fitness_router.post("/exercises", response_model=ExerciseResponseSchema)
def create_exercise(
    data: ExerciseSchema,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    ensure_unique_name(data.name, user, session)
    exercise = Exercise(
        user_id=user.id,
        name=data.name,
        muscle_group=data.muscle_group,
        equipment=data.equipment,
    )
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return exercise


@fitness_router.patch("/exercises/{exercise_id}", response_model=ExerciseResponseSchema)
def edit_exercise(
    exercise_id: int,
    data: EditExerciseSchema,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    exercise = get_own_exercise(exercise_id, user, session)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in changes:
        ensure_unique_name(changes["name"], user, session, exclude_id=exercise.id)
    for field, value in changes.items():
        setattr(exercise, field, value)
    session.commit()
    session.refresh(exercise)
    return exercise


@fitness_router.delete("/exercises/{exercise_id}")
def delete_exercise(
    exercise_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    exercise = get_own_exercise(exercise_id, user, session)
    used_in = [
        name
        for (name,) in session.query(Workout.name)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .filter(WorkoutExercise.exercise_id == exercise.id)
        .distinct()
        .order_by(Workout.name)
    ]
    if used_in:
        listed = ", ".join(used_in)
        noun = "na ficha" if len(used_in) == 1 else "nas fichas"
        raise HTTPException(
            status_code=409,
            detail=f"Esse exercício está {noun} {listed}. Tire ele de lá antes de excluir.",
        )
    session.delete(exercise)
    session.commit()
    return {"message": "Exercício excluído"}


def get_own_workout(workout_id: int, user: User, session: Session) -> Workout:
    workout = (
        session.query(Workout)
        .filter(Workout.id == workout_id, Workout.user_id == user.id)
        .first()
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Ficha não encontrada")
    return workout


def build_workout_exercises(data: WorkoutSchema, user: User, session: Session) -> list[WorkoutExercise]:
    ids = {item.exercise_id for item in data.exercises}
    found = {
        exercise_id
        for (exercise_id,) in visible_exercises(user, session)
        .filter(Exercise.id.in_(ids))
        .with_entities(Exercise.id)
    } if ids else set()
    if ids - found:
        raise HTTPException(status_code=400, detail="Algum exercício da ficha não foi encontrado.")
    return [
        WorkoutExercise(
            exercise_id=item.exercise_id,
            position=index,
            target_sets=item.target_sets,
            reps_min=item.reps_min,
            reps_max=item.reps_max,
        )
        for index, item in enumerate(data.exercises)
    ]


@fitness_router.get("/workouts", response_model=List[WorkoutResponseSchema])
def list_workouts(
    user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    return (
        session.query(Workout)
        .filter(Workout.user_id == user.id)
        .order_by(Workout.updated_at.desc(), Workout.id.desc())
        .all()
    )


@fitness_router.get("/workouts/{workout_id}", response_model=WorkoutResponseSchema)
def get_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    return get_own_workout(workout_id, user, session)


@fitness_router.post("/workouts", response_model=WorkoutResponseSchema)
def create_workout(
    data: WorkoutSchema,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    workout = Workout(
        user_id=user.id,
        name=data.name,
        description=data.description,
        exercises=build_workout_exercises(data, user, session),
    )
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout


@fitness_router.put("/workouts/{workout_id}", response_model=WorkoutResponseSchema)
def replace_workout(
    workout_id: int,
    data: WorkoutSchema,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    workout = get_own_workout(workout_id, user, session)
    items = build_workout_exercises(data, user, session)
    workout.name = data.name
    workout.description = data.description
    workout.exercises.clear()
    session.flush()
    workout.exercises.extend(items)
    workout.updated_at = func.now()
    session.commit()
    session.refresh(workout)
    return workout


@fitness_router.delete("/workouts/{workout_id}")
def delete_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    session.delete(get_own_workout(workout_id, user, session))
    session.commit()
    return {"message": "Ficha excluída"}
