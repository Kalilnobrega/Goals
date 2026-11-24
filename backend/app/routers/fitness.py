from app.fitness_gyms import default_specific, shared_gyms
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User
from app.fitness_models import Exercise, ExerciseIntensity, ExerciseMuscle, Workout, WorkoutCardio, WorkoutExercise, WorkoutSession, SessionExercise, PlanDay, ExerciseGymSetting
from app.fitness_schemas import (
    ExerciseSchema,
    EditExerciseSchema,
    ExerciseResponseSchema,
    ExerciseIntensitySchema,
    WorkoutSchema,
    WorkoutResponseSchema,
)
from app.fitness_timing import intensity_choices
from app.fitness_supersets import superset_numbers
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
    exercises = visible_exercises(user, session).order_by(Exercise.name, Exercise.id).all()
    choices = intensity_choices(session, user.id)
    overrides = dict(
        session.query(ExerciseGymSetting.exercise_id, ExerciseGymSetting.gym_specific)
        .filter(ExerciseGymSetting.user_id == user.id)
        .all()
    )
    shared = shared_gyms(session, user.id, [exercise.id for exercise in exercises])
    for exercise in exercises:
        if exercise.id in choices:
            exercise.user_level = choices[exercise.id]
        exercise.gym_specific = overrides.get(exercise.id, default_specific(exercise.equipment))
        exercise.shared_gym_ids = sorted(shared.get(exercise.id, ()))
    return exercises


@fitness_router.put("/exercises/{exercise_id}/intensity", response_model=ExerciseResponseSchema)
def set_exercise_intensity(
    exercise_id: int,
    data: ExerciseIntensitySchema,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    exercise = visible_exercises(user, session).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    if (exercise.tracking or "reps") != "reps":
        raise HTTPException(status_code=400, detail="Exercícios por tempo não usam intensidade.")
    choice = (
        session.query(ExerciseIntensity)
        .filter(ExerciseIntensity.user_id == user.id, ExerciseIntensity.exercise_id == exercise.id)
        .first()
    )
    if exercise.is_custom:
        exercise.intensity = data.intensity
        if choice:
            session.delete(choice)
    elif data.intensity is None or data.intensity == exercise.level:
        if choice:
            session.delete(choice)
    elif choice:
        choice.intensity = data.intensity
    else:
        session.add(ExerciseIntensity(user_id=user.id, exercise_id=exercise.id, intensity=data.intensity))
    session.commit()
    session.refresh(exercise)
    if not exercise.is_custom and data.intensity and data.intensity != exercise.level:
        exercise.user_level = data.intensity
    return exercise


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
        grip=data.grip,
        is_unilateral=data.is_unilateral,
        family=" ".join(data.family.split()) if data.family else None,
        bodyweight_factor=data.bodyweight_factor,
        tracking=data.tracking,
        intensity=data.intensity,
        muscles=[ExerciseMuscle(muscle=item.muscle, role=item.role) for item in data.muscles],
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
    changes = data.model_dump(exclude_unset=True, exclude_none=True, exclude={"muscles"})
    if "name" in changes:
        ensure_unique_name(changes["name"], user, session, exclude_id=exercise.id)
    for field, value in changes.items():
        setattr(exercise, field, value)
    if data.muscles is not None:
        exercise.muscles = []
        session.flush()
        exercise.muscles = [ExerciseMuscle(muscle=item.muscle, role=item.role) for item in data.muscles]
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
        .outerjoin(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .outerjoin(WorkoutCardio, WorkoutCardio.workout_id == Workout.id)
        .filter(or_(WorkoutExercise.exercise_id == exercise.id, WorkoutCardio.exercise_id == exercise.id))
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
    session.query(SessionExercise).filter(SessionExercise.exercise_id == exercise.id).update(
        {SessionExercise.exercise_id: None}, synchronize_session=False
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
        cardio=build_workout_cardio(data),
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
    workout.cardio.clear()
    session.flush()
    workout.exercises.extend(items)
    workout.cardio.extend(build_workout_cardio(data))
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
    workout = get_own_workout(workout_id, user, session)
    session.query(PlanDay).filter(PlanDay.workout_id == workout.id).delete(synchronize_session=False)
    session.query(WorkoutSession).filter(WorkoutSession.workout_id == workout.id).update(
        {WorkoutSession.workout_id: None}, synchronize_session=False
    )
    planned_ids = [item.id for item in workout.exercises]
    if planned_ids:
        session.query(SessionExercise).filter(SessionExercise.workout_exercise_id.in_(planned_ids)).update(
            {SessionExercise.workout_exercise_id: None}, synchronize_session=False
        )
    session.delete(workout)
    session.commit()
    return {"message": "Ficha excluída"}
