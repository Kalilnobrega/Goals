from datetime import date
from decimal import Decimal
from app.fitness_gyms import is_specific, same_gym, specific_ids
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from datetime import datetime
from app.dates import BRT, today_br, to_br_date
from app.models import User
from app.fitness_models import Exercise, WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry, FitnessGoal, FitnessProfile, Gym, Workout, WorkoutExercise
from app.fitness_forecast import forecast, slope_per_day
from app.fitness_timing import exercise_timings, intensity_levels, mean as average
from app.fitness_load import BODYWEIGHT, BodyWeights, share
from app.fitness_cardio import cardio_numbers
from app.fitness_schemas import (
    ProgressExerciseSchema,
    ExerciseProgressSchema,
    BodyWeightSchema,
    EditBodyWeightSchema,
    FitnessGoalSchema,
    FitnessGoalResponseSchema,
    BodyWeightResponseSchema,
)
from .auth import get_current_user
from .fitness import visible_exercises
from .fitness_sessions import COMPLETED, aware, to_kg

fitness_progress_router = APIRouter(prefix="/fitness", tags=["fitness"])

BODY_WEIGHT = "body_weight"
EXERCISE = "exercise"

EPLEY_MAX_REPS = 12


def estimated_1rm(weight: Decimal, reps: int) -> float | None:
    if weight <= 0 or reps < 1 or reps > EPLEY_MAX_REPS:
        return None
    if reps == 1:
        return float(weight)
    return round(float(weight) * (1 + reps / 30), 1)


def completed_sets(user: User, db: Session):
    return (
        db.query(SetEntry)
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED, SetEntry.kind != "warmup")
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
    split = specific_ids(db, user.id, [row[0] for row in rows])
    profile = db.get(FitnessProfile, user.id)
    current = profile.current_gym_id if profile else None
    if split and current is not None:
        local = dict(
            (exercise_id, (best_weight, max_reps))
            for exercise_id, best_weight, max_reps in completed_sets(user, db)
            .filter(SessionExercise.exercise_id.in_(split), WorkoutSession.gym_id == current)
            .with_entities(SessionExercise.exercise_id, func.max(SetEntry.weight_kg), func.max(SetEntry.reps))
            .group_by(SessionExercise.exercise_id)
            .all()
        )
        rows = [
            (exercise_id, sessions, last_at, *local.get(exercise_id, (0, 0))) if exercise_id in split else (exercise_id, sessions, last_at, best, reps)
            for exercise_id, sessions, last_at, best, reps in rows
        ]
    exercises = {
        exercise.id: exercise
        for exercise in db.query(Exercise).filter(Exercise.id.in_([row[0] for row in rows]))
    } if rows else {}
    goals = {
        goal.exercise_id: float(goal.target_kg)
        for goal in db.query(FitnessGoal).filter(FitnessGoal.user_id == user.id, FitnessGoal.kind == EXERCISE)
    }
    items = [
        {
            "exercise_id": exercise_id,
            "goal_kg": goals.get(exercise_id),
            "name": exercises[exercise_id].name,
            "muscle_group": exercises[exercise_id].muscle_group,
            "equipment": exercises[exercise_id].equipment,
            "tracking": exercises[exercise_id].tracking,
            "sessions": sessions,
            "last_at": aware(last_at),
            "best_weight_kg": float(best_weight),
            "max_reps": max_reps,
        }
        for exercise_id, sessions, last_at, best_weight, max_reps in rows
        if exercise_id in exercises
    ]
    return sorted(items, key=lambda item: item["last_at"], reverse=True)


REP_TARGETS = list(range(1, 16))
STAGNATION_SESSIONS = 4


def strength(point: dict) -> float | None:
    if point["estimated_1rm_kg"] is not None:
        return point["estimated_1rm_kg"]
    weight = float(point["max_weight_kg"])
    return weight or None


def rep_records(rows) -> list[dict]:
    result = []
    for target in REP_TARGETS:
        best = None
        for session_id, _, completed_at, weight, reps, *_ in rows:
            if reps >= target and weight > 0 and (best is None or weight > best[0]):
                best = (weight, reps, session_id, completed_at)
        if best:
            result.append({
                "reps": target,
                "weight_kg": float(best[0]),
                "actual_reps": best[1],
                "session_id": best[2],
                "date": to_br_date(aware(best[3])),
            })
    kept = {}
    for item in result:
        kept[(item["weight_kg"], item["session_id"], item["actual_reps"])] = item
    return sorted(kept.values(), key=lambda item: item["reps"])


def progression_pace(ordered: list[dict]) -> dict | None:
    series = [(to_br_date(p["completed_at"]), strength(p)) for p in ordered if strength(p)]
    if len(series) < 3 or (series[-1][0] - series[0][0]).days < 14:
        return None
    rate = slope_per_day(series)
    first = series[0][1]
    current = series[-1][1]
    return {
        "metric": "e1rm" if ordered[-1]["estimated_1rm_kg"] is not None else "weight",
        "kg_per_month": round(rate * 30, 1),
        "pct_per_month": round(rate * 30 / first * 100, 1) if first else None,
        "current_kg": round(current, 1),
        "projected_kg": round(current + rate * 90, 1),
        "sessions": len(series),
        "since": series[0][0],
    }


def stagnation(ordered: list[dict]) -> dict | None:
    best = None
    last_record = None
    for index, point in enumerate(ordered):
        value = strength(point)
        if value is None:
            continue
        if best is None or value > best + 0.01:
            best = value
            last_record = index
    if last_record is None:
        return None
    since = len(ordered) - 1 - last_record
    if since < STAGNATION_SESSIONS:
        return None
    return {
        "sessions": since,
        "since": to_br_date(ordered[last_record]["completed_at"]),
        "best_kg": round(best, 1),
    }


def ready_to_progress(user: User, db: Session, exercise_id: int, rows) -> dict | None:
    plans = (
        db.query(WorkoutExercise, Workout.name)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id, WorkoutExercise.reps_max.isnot(None))
        .all()
    )
    if not plans or not rows:
        return None
    last_session = rows[-1][0]
    last = [(float(weight), reps, side, position, set_id) for session_id, _, _, weight, reps, side, position, set_id, *_ in rows if session_id == last_session]
    top = max(weight for weight, *_ in last)
    working = [reps for weight, reps, *_ in last if weight == top]
    done = len({("pair", position) if side else ("set", set_id) for _, _, side, position, set_id in last})
    for plan, workout_name in plans:
        if done >= plan.target_sets and all(reps >= plan.reps_max for reps in working):
            return {
                "weight_kg": top,
                "reps": min(working),
                "sets": done,
                "reps_max": plan.reps_max,
                "workout_name": workout_name,
            }
    return None


def frequency(ordered: list[dict]) -> dict | None:
    if not ordered:
        return None
    today = today_br()
    days = [to_br_date(p["completed_at"]) for p in ordered]
    recent = [day for day in days if (today - day).days < 56]
    gaps = [(later - earlier).days for earlier, later in zip(days, days[1:]) if later > earlier]
    weeks = min(8, max(1, ((today - recent[0]).days + 1) / 7)) if recent else 8
    return {
        "per_week": round(len(recent) / weeks, 1),
        "weeks": round(weeks, 1),
        "avg_interval_days": round(sum(gaps) / len(gaps), 1) if gaps else None,
        "days_since_last": (today - days[-1]).days,
        "last_on": days[-1],
    }


def exercise_time(user: User, db: Session, exercise_id: int) -> dict | None:
    sessions = (
        db.query(WorkoutSession)
        .join(SessionExercise, SessionExercise.session_id == WorkoutSession.id)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            SessionExercise.exercise_id == exercise_id,
        )
        .distinct()
        .all()
    )
    spans, rests, set_seconds, preps = [], [], [], []
    levels = intensity_levels(db, [exercise_id], user.id)
    for workout_session in sessions:
        timings = exercise_timings(workout_session, levels)
        for item in workout_session.exercises:
            if item.exercise_id != exercise_id or item.id not in timings:
                continue
            timing = timings[item.id]
            rests.extend(timing["rests"])
            if timing["seconds"] is not None:
                spans.append(timing["seconds"])
                preps.append(timing["prep"])
                count = len({("pair", s.position) if s.side else ("set", s.id) for s in item.sets if s.kind != "warmup"})
                if count:
                    set_seconds.append(timing["work"] / count)
    if not spans and not rests:
        return None
    return {
        "sessions": len(spans),
        "avg_seconds": round(average(spans)) if spans else None,
        "avg_set_seconds": round(average(set_seconds)) if set_seconds else None,
        "avg_rest_seconds": round(average(rests)) if rests else None,
        "avg_prep_seconds": round(average(preps)) if preps else None,
    }


@fitness_progress_router.get("/exercises/{exercise_id}/progress", response_model=ExerciseProgressSchema)
def get_exercise_progress(
    exercise_id: int,
    gym_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exercise = visible_exercises(user, db).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")

    specific = is_specific(db, user.id, exercise.id)
    gyms = []
    selected_gym = None
    if specific:
        counts = dict(
            completed_sets(user, db)
            .filter(SessionExercise.exercise_id == exercise.id)
            .with_entities(WorkoutSession.gym_id, func.count(func.distinct(WorkoutSession.id)))
            .group_by(WorkoutSession.gym_id)
            .all()
        )
        profile = db.get(FitnessProfile, user.id)
        current = profile.current_gym_id if profile else None
        for gym in db.query(Gym).filter(Gym.user_id == user.id).order_by(Gym.created_at, Gym.id):
            if counts.get(gym.id) or gym.id == current:
                gyms.append({"id": gym.id, "name": gym.name, "sessions": counts.get(gym.id, 0)})
        known = {g["id"] for g in gyms}
        selected_gym = gym_id if gym_id in known else current if current in known else (gyms[0]["id"] if gyms else None)

    rows_query = completed_sets(user, db)
    if specific:
        rows_query = same_gym(rows_query, selected_gym)
    rows = (
        rows_query
        .filter(SessionExercise.exercise_id == exercise.id)
        .with_entities(
            WorkoutSession.id,
            WorkoutSession.name,
            WorkoutSession.completed_at,
            SetEntry.weight_kg,
            SetEntry.reps,
            SetEntry.side,
            SetEntry.position,
            SetEntry.id,
            SessionExercise.id,
            SetEntry.duration_seconds,
            SetEntry.distance_km,
            SetEntry.speed_kmh,
            SetEntry.level,
            SetEntry.stage_volume_kg,
            SetEntry.stage_reps,
        )
        .order_by(WorkoutSession.completed_at, WorkoutSession.id, SetEntry.id)
        .all()
    )

    points: dict[int, dict] = {}
    series: dict[int, set] = {}
    body = BodyWeights(user.id, db) if exercise.equipment == BODYWEIGHT else None
    for session_id, session_name, completed_at, weight, reps, side, position, set_id, item_id, duration, distance, speed, level, stage_volume, stage_reps in rows:
        load = Decimal(str(round(body.load(float(weight), BODYWEIGHT, to_br_date(aware(completed_at)), share(exercise.bodyweight_factor)), 2))) if body else weight
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
            "duration_seconds": 0,
            "best_duration_seconds": 0,
            "distance_km": None,
            "speed_kmh": None,
            "level": None,
            "left_max_weight_kg": None,
            "right_max_weight_kg": None,
            "left_estimated_1rm_kg": None,
            "right_estimated_1rm_kg": None,
        })
        series.setdefault(session_id, set()).add(("pair", item_id, position) if side else ("set", set_id))
        point["volume_kg"] += load * reps + (stage_volume or 0) + (load - weight) * (stage_reps or 0)
        if duration:
            point["duration_seconds"] += duration
            point["best_duration_seconds"] = max(point["best_duration_seconds"], duration)
        if distance:
            point["distance_km"] = round((point["distance_km"] or 0) + float(distance), 2)
        if speed:
            point["speed_kmh"] = max(point["speed_kmh"] or 0, float(speed))
        if level:
            point["level"] = max(point["level"] or 0, level)
        point["max_reps"] = max(point["max_reps"], reps)
        if weight > point["max_weight_kg"] or (weight == point["max_weight_kg"] and reps > point["reps_at_max"]):
            point["max_weight_kg"] = weight
            point["reps_at_max"] = reps
        estimate = estimated_1rm(load, reps)
        if estimate is not None and (point["estimated_1rm_kg"] is None or estimate > point["estimated_1rm_kg"]):
            point["estimated_1rm_kg"] = estimate
        if side:
            key = f"{side}_max_weight_kg"
            if point[key] is None or float(weight) > point[key]:
                point[key] = float(weight)
            key = f"{side}_estimated_1rm_kg"
            if estimate is not None and (point[key] is None or estimate > point[key]):
                point[key] = estimate
    for session_id, point in points.items():
        point["sets"] = len(series[session_id])
    if exercise.tracking == "cardio" and points:
        add_cardio_numbers(points, exercise, user, db)

    ordered = sorted(points.values(), key=lambda p: p["completed_at"])

    return {
        "gym_specific": specific,
        "gym_id": selected_gym,
        "gyms": gyms,
        "exercise_id": exercise.id,
        "name": exercise.name,
        "muscle_group": exercise.muscle_group,
        "equipment": exercise.equipment,
        "tracking": exercise.tracking,
        "intensity": intensity_levels(db, [exercise.id], user.id).get(exercise.id),
        "default_intensity": exercise.level,
        "goal": serialize_goal(find_goal(user, db, EXERCISE, exercise.id), exercise_points(user, db, exercise.id)),
        "time": exercise_time(user, db, exercise.id),
        "rep_records": rep_records(rows),
        "pace": progression_pace(ordered),
        "stagnation": stagnation(ordered),
        "ready": ready_to_progress(user, db, exercise.id, rows),
        "frequency": frequency(ordered),
        "techniques": technique_sessions(user, db, exercise.id),
        "points": [
            {**point, "max_weight_kg": float(point["max_weight_kg"]), "volume_kg": float(point["volume_kg"])}
            for point in points.values()
        ],
    }


TECHNIQUE_KINDS = ("drop", "rest_pause", "failure")
TECHNIQUE_SESSIONS = 6


def technique_sessions(user: User, db: Session, exercise_id: int) -> list[dict]:
    rows = (
        completed_sets(user, db)
        .filter(SessionExercise.exercise_id == exercise_id, SetEntry.kind.in_(TECHNIQUE_KINDS))
        .with_entities(WorkoutSession.id, WorkoutSession.completed_at, SetEntry)
        .order_by(WorkoutSession.completed_at.desc(), WorkoutSession.id.desc(), SetEntry.position, SetEntry.id)
        .all()
    )
    sessions: dict[int, dict] = {}
    for session_id, completed_at, entry in rows:
        if session_id not in sessions:
            if len(sessions) == TECHNIQUE_SESSIONS:
                break
            sessions[session_id] = {"session_id": session_id, "date": to_br_date(aware(completed_at)), "sets": []}
        sessions[session_id]["sets"].append({
            "kind": entry.kind,
            "weight_kg": float(entry.weight_kg),
            "reps": entry.reps,
            "stages": entry.stages or [],
        })
    return list(sessions.values())


def add_cardio_numbers(points: dict, exercise: Exercise, user: User, db: Session):
    weights = BodyWeights(user.id, db)
    entries: dict = {}
    for session_id, entry in (
        completed_sets(user, db)
        .filter(SessionExercise.exercise_id == exercise.id)
        .with_entities(WorkoutSession.id, SetEntry)
        .order_by(SetEntry.id)
    ):
        entries.setdefault(session_id, []).append(entry)
    for session_id, items in entries.items():
        point = points.get(session_id)
        if not point:
            continue
        numbers = cardio_numbers(exercise.name, items, weights.on(to_br_date(point["completed_at"])))
        point["distance_km"] = numbers["km"] or None
        point["km_estimated"] = numbers["km_estimated"]
        point["calories"] = numbers["calories"]
        point["calories_estimated"] = numbers["calories_estimated"]
        seconds = sum(entry.duration_seconds or 0 for entry in items if entry.distance_km or entry.speed_kmh)
        point["pace_seconds_per_km"] = round(seconds / numbers["km"]) if numbers["km"] and seconds else None


def serialize_body_weight(entry: BodyWeightEntry) -> dict:
    return {
        "id": entry.id,
        "measured_on": entry.measured_on,
        "measured_time": entry.measured_time.strftime("%H:%M") if entry.measured_time else None,
        "weight_kg": float(entry.weight_kg),
        "note": entry.note,
    }


def check_day(day: date, moment=None):
    if day > today_br():
        raise HTTPException(status_code=400, detail="A data não pode ser no futuro.")
    if moment is not None and day == today_br() and moment > datetime.now(BRT).time():
        raise HTTPException(status_code=400, detail="A hora não pode ser no futuro.")


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
    check_day(day, data.measured_time)
    entry = entry_on(day, user, db)
    if entry is None:
        entry = BodyWeightEntry(user_id=user.id, measured_on=day)
        db.add(entry)
    entry.weight_kg = to_kg(data.weight_kg)
    entry.note = data.note
    entry.measured_time = data.measured_time.replace(second=0, microsecond=0) if data.measured_time else None
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
    if "measured_time" in changes:
        check_day(entry.measured_on, data.measured_time)
        entry.measured_time = data.measured_time.replace(second=0, microsecond=0) if data.measured_time else None
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


def find_goal(user: User, db: Session, kind: str, exercise_id: int | None = None) -> FitnessGoal | None:
    return (
        db.query(FitnessGoal)
        .filter(FitnessGoal.user_id == user.id, FitnessGoal.kind == kind, FitnessGoal.exercise_id == exercise_id)
        .first()
    )


def body_points(user: User, db: Session, since: date | None = None) -> list[tuple[date, float]]:
    query = db.query(BodyWeightEntry.measured_on, BodyWeightEntry.weight_kg).filter(BodyWeightEntry.user_id == user.id)
    if since:
        query = query.filter(BodyWeightEntry.measured_on >= since)
    return [(day, float(weight)) for day, weight in query.order_by(BodyWeightEntry.measured_on).all()]


def exercise_points(user: User, db: Session, exercise_id: int) -> list[tuple[date, float]]:
    rows = (
        completed_sets(user, db)
        .filter(SessionExercise.exercise_id == exercise_id)
        .with_entities(WorkoutSession.id, WorkoutSession.completed_at, func.max(SetEntry.weight_kg))
        .group_by(WorkoutSession.id, WorkoutSession.completed_at)
        .order_by(WorkoutSession.completed_at)
        .all()
    )
    return [(to_br_date(aware(completed_at)), float(weight)) for _, completed_at, weight in rows]


def serialize_goal(goal: FitnessGoal | None, points: list[tuple[date, float]]) -> dict | None:
    if goal is None:
        return None
    baseline = (goal.start_on, float(goal.start_kg)) if goal.start_kg is not None else None
    after = [point for point in points if point[0] >= goal.start_on]
    result = forecast(baseline, after, float(goal.target_kg), goal.deadline, today_br())
    return {**result, "target_kg": float(goal.target_kg), "deadline": goal.deadline, "start_on": goal.start_on}


def check_deadline(deadline: date | None):
    if deadline is not None and deadline < today_br():
        raise HTTPException(status_code=400, detail="O prazo não pode ser no passado.")


def save_goal(goal: FitnessGoal | None, data: FitnessGoalSchema, user: User, db: Session, kind: str,
              exercise_id: int | None, points: list[tuple[date, float]]) -> FitnessGoal:
    check_deadline(data.deadline)
    if goal is None:
        today = today_br()
        before = [value for day, value in points if day <= today]
        goal = FitnessGoal(
            user_id=user.id, kind=kind, exercise_id=exercise_id, start_on=today,
            start_kg=to_kg(before[-1]) if before else None,
        )
        db.add(goal)
    goal.target_kg = to_kg(data.target_kg)
    goal.deadline = data.deadline
    db.commit()
    db.refresh(goal)
    return goal


@fitness_progress_router.get("/body-weight-goal", response_model=FitnessGoalResponseSchema | None)
def get_body_goal(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = find_goal(user, db, BODY_WEIGHT)
    return serialize_goal(goal, body_points(user, db, goal.start_on) if goal else [])


@fitness_progress_router.put("/body-weight-goal", response_model=FitnessGoalResponseSchema)
def set_body_goal(data: FitnessGoalSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not 20 <= data.target_kg <= 400:
        raise HTTPException(status_code=400, detail="Informe uma meta entre 20 e 400 kg.")
    points = body_points(user, db)
    goal = save_goal(find_goal(user, db, BODY_WEIGHT), data, user, db, BODY_WEIGHT, None, points)
    return serialize_goal(goal, points)


@fitness_progress_router.delete("/body-weight-goal")
def delete_body_goal(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = find_goal(user, db, BODY_WEIGHT)
    if goal:
        db.delete(goal)
        db.commit()
    return {"message": "Meta removida"}


def visible_exercise_or_404(exercise_id: int, user: User, db: Session) -> Exercise:
    exercise = visible_exercises(user, db).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    return exercise


@fitness_progress_router.put("/exercises/{exercise_id}/goal", response_model=FitnessGoalResponseSchema)
def set_exercise_goal(
    exercise_id: int,
    data: FitnessGoalSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exercise = visible_exercise_or_404(exercise_id, user, db)
    points = exercise_points(user, db, exercise.id)
    goal = save_goal(find_goal(user, db, EXERCISE, exercise.id), data, user, db, EXERCISE, exercise.id, points)
    return serialize_goal(goal, points)


@fitness_progress_router.delete("/exercises/{exercise_id}/goal")
def delete_exercise_goal(exercise_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exercise = visible_exercise_or_404(exercise_id, user, db)
    goal = find_goal(user, db, EXERCISE, exercise.id)
    if goal:
        db.delete(goal)
        db.commit()
    return {"message": "Meta removida"}
