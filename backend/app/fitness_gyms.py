from sqlalchemy.orm import Session
from app.fitness_models import Exercise, ExerciseGymSetting, Gym, WorkoutSession

GYM_EQUIPMENT = {"machine", "plate_loaded", "cable", "smith"}


def default_specific(equipment: str | None) -> bool:
    return equipment in GYM_EQUIPMENT


def has_gyms(db: Session, user_id: int) -> bool:
    return db.query(Gym.id).filter(Gym.user_id == user_id).first() is not None


def specific_ids(db: Session, user_id: int, exercise_ids) -> set[int]:
    ids = {i for i in exercise_ids if i}
    if not ids or not has_gyms(db, user_id):
        return set()
    equipment = dict(db.query(Exercise.id, Exercise.equipment).filter(Exercise.id.in_(ids)).all())
    overrides = dict(
        db.query(ExerciseGymSetting.exercise_id, ExerciseGymSetting.gym_specific)
        .filter(ExerciseGymSetting.user_id == user_id, ExerciseGymSetting.exercise_id.in_(ids))
        .all()
    )
    return {i for i in ids if overrides.get(i, default_specific(equipment.get(i)))}


def is_specific(db: Session, user_id: int, exercise_id: int | None) -> bool:
    return exercise_id in specific_ids(db, user_id, [exercise_id])


def same_gym(query, gym_id: int | None):
    if gym_id is None:
        return query.filter(WorkoutSession.gym_id.is_(None))
    return query.filter(WorkoutSession.gym_id == gym_id)
