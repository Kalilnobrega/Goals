from sqlalchemy.orm import Session
from app.fitness_models import Exercise, ExerciseGymLink, ExerciseGymSetting, Gym, WorkoutSession

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


def shared_gyms(db: Session, user_id: int, exercise_ids) -> dict[int, frozenset]:
    ids = {i for i in exercise_ids if i}
    if not ids:
        return {}
    grouped: dict[int, set] = {}
    rows = db.query(ExerciseGymLink.exercise_id, ExerciseGymLink.gym_id).filter(
        ExerciseGymLink.user_id == user_id, ExerciseGymLink.exercise_id.in_(ids)
    )
    for exercise_id, gym_id in rows:
        grouped.setdefault(exercise_id, set()).add(gym_id)
    return {exercise_id: frozenset(gyms) for exercise_id, gyms in grouped.items() if len(gyms) > 1}


def place_of(shared: frozenset | None, gym_id: int | None) -> frozenset:
    if shared and gym_id in shared:
        return shared
    return frozenset([gym_id])


def place_key(shared: frozenset | None, gym_id: int | None):
    place = place_of(shared, gym_id)
    return min(place) if None not in place else None


def place_for(db: Session, user_id: int, exercise_id: int | None, gym_id: int | None) -> frozenset:
    return place_of(shared_gyms(db, user_id, [exercise_id]).get(exercise_id), gym_id)


def same_place(query, place):
    gyms = [gym for gym in place if gym is not None]
    if None in place:
        return query.filter(WorkoutSession.gym_id.is_(None))
    return query.filter(WorkoutSession.gym_id.in_(gyms))
