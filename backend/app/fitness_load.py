from bisect import bisect_right
from datetime import date, datetime
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from app.dates import to_br_date
from app.fitness_models import BodyWeightEntry, Exercise, SessionExercise, SetEntry

BODYWEIGHT = "bodyweight"
DEFAULT_FACTOR = 1.0


def share(factor) -> float:
    return DEFAULT_FACTOR if factor is None else float(factor)


def bodyweight_factors(db: Session, exercise_ids) -> dict[int, float]:
    ids = {exercise_id for exercise_id in exercise_ids if exercise_id is not None}
    if not ids:
        return {}
    rows = db.query(Exercise.id, Exercise.bodyweight_factor).filter(Exercise.id.in_(ids)).all()
    return {exercise_id: share(factor) for exercise_id, factor in rows}


class BodyWeights:
    def __init__(self, user_id: int, db: Session):
        rows = (
            db.query(BodyWeightEntry.measured_on, BodyWeightEntry.weight_kg)
            .filter(BodyWeightEntry.user_id == user_id)
            .order_by(BodyWeightEntry.measured_on)
            .all()
        )
        self.days = [day for day, _ in rows]
        self.values = [float(weight) for _, weight in rows]

    def on(self, day: date) -> float:
        if not self.days:
            return 0.0
        index = bisect_right(self.days, day) - 1
        return self.values[max(index, 0)]

    def load(self, weight: float, equipment: str, day: date, factor: float = DEFAULT_FACTOR) -> float:
        return weight + factor * self.on(day) if equipment == BODYWEIGHT else weight


def bodyweight_bonus(sessions: list[tuple[int, datetime]], user_id: int, db: Session) -> dict[int, float]:
    started = dict(sessions)
    if not started:
        return {}
    weights = BodyWeights(user_id, db)
    if not weights.days:
        return {}
    rows = (
        db.query(SessionExercise.session_id, func.sum((SetEntry.reps + SetEntry.stage_reps) * func.coalesce(Exercise.bodyweight_factor, DEFAULT_FACTOR)))
        .join(SetEntry, and_(SetEntry.session_exercise_id == SessionExercise.id, SetEntry.kind != "warmup"))
        .outerjoin(Exercise, Exercise.id == SessionExercise.exercise_id)
        .filter(SessionExercise.session_id.in_(started), SessionExercise.equipment == BODYWEIGHT)
        .group_by(SessionExercise.session_id)
        .all()
    )
    return {
        session_id: weights.on(to_br_date(started[session_id])) * float(reps or 0)
        for session_id, reps in rows
    }
