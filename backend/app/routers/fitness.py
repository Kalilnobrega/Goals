from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.fitness_models import Exercise
from app.fitness_schemas import ExerciseSchema, EditExerciseSchema, ExerciseResponseSchema
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
    session.delete(get_own_exercise(exercise_id, user, session))
    session.commit()
    return {"message": "Exercício excluído"}
