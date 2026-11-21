from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br, to_br_date, br_day_start_utc
from app.models import User
from app.fitness_models import Workout, WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry, Plan
from app.fitness_schemas import OverviewSchema, CalendarSchema, WeekSchema
from .auth import get_current_user
from .fitness_sessions import IN_PROGRESS, COMPLETED, aware, session_stats, history_item, series_key
from app.fitness_load import bodyweight_bonus
from .fitness_plans import active_plan, workout_muscles
from .fitness_stats import completed_facts, weight_records
from .fitness_progress import BODY_WEIGHT, body_points, find_goal, serialize_goal
from app.fitness_muscles import muscle_credit

fitness_overview_router = APIRouter(prefix="/fitness", tags=["fitness"])


def active_summary(user: User, db: Session) -> dict | None:
    workout_session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == IN_PROGRESS)
        .first()
    )
    if not workout_session:
        return None
    total_sets = (
        db.query(func.count(func.distinct(series_key())))
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .filter(SessionExercise.session_id == workout_session.id, SessionExercise.tracking != "cardio")
        .scalar()
    )
    return {
        "id": workout_session.id,
        "name": workout_session.name,
        "started_at": aware(workout_session.started_at),
        "total_sets": total_sets,
    }


def planned_by_weekday(plan: Plan | None) -> dict[int, list]:
    planned: dict[int, list] = {}
    for day in plan.days if plan else []:
        planned.setdefault(day.weekday, []).append(day.workout)
    return planned


def week_summary(user: User, db: Session, today, plan: Plan | None, monday: date | None = None) -> dict:
    monday = monday or today - timedelta(days=today.weekday())
    planned = planned_by_weekday(plan)
    stats = session_stats(db)
    rows = (
        db.query(
            WorkoutSession.started_at, WorkoutSession.completed_at, stats.c.total_sets, stats.c.volume,
            WorkoutSession.workout_id, WorkoutSession.id, WorkoutSession.name,
        )
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.started_at >= br_day_start_utc(monday),
            WorkoutSession.started_at < br_day_start_utc(monday + timedelta(days=7)),
        )
        .all()
    )
    per_day = {monday + timedelta(days=offset): 0 for offset in range(7)}
    done: dict[date, set] = {day: set() for day in per_day}
    trained: dict[date, list] = {day: [] for day in per_day}
    sets = 0
    volume = 0.0
    seconds = 0.0
    bonus = bodyweight_bonus([(row[5], row[0]) for row in rows], user.id, db)
    for started_at, completed_at, total_sets, session_volume, workout_id, session_id, name in sorted(rows, key=lambda r: r[0]):
        day = to_br_date(started_at)
        if day not in per_day:
            continue
        per_day[day] += 1
        done[day].add(workout_id)
        trained[day].append({"id": session_id, "name": name, "workout_id": workout_id})
        sets += total_sets or 0
        volume += float(session_volume or 0) + bonus.get(session_id, 0.0)
        seconds += (aware(completed_at) - aware(started_at)).total_seconds()
    return {
        "days": [
            {
                "date": day,
                "sessions": count,
                "trained": trained[day],
                "planned": [
                    {"workout_id": workout.id, "name": workout.name, "done": workout.id in done[day]}
                    for workout in planned.get(day.weekday(), [])
                ],
            }
            for day, count in per_day.items()
        ],
        "sessions": sum(per_day.values()),
        "sets": sets,
        "volume_kg": volume,
        "minutes": round(seconds / 60),
    }


def last_session(user: User, db: Session) -> dict | None:
    stats = session_stats(db)
    row = (
        db.query(WorkoutSession, stats.c.exercise_count, stats.c.total_sets, stats.c.volume, stats.c.cardio_seconds)
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
        .order_by(WorkoutSession.completed_at.desc(), WorkoutSession.id.desc())
        .first()
    )
    if not row:
        return None
    workout_session, exercise_count, total_sets, volume, cardio_seconds = row
    bonus = bodyweight_bonus([(workout_session.id, workout_session.started_at)], user.id, db).get(workout_session.id, 0.0)
    return history_item(workout_session, exercise_count, total_sets, float(volume or 0) + bonus, cardio_seconds=cardio_seconds)


def suggested_workout(user: User, db: Session) -> tuple[dict | None, int]:
    workouts = (
        db.query(Workout)
        .filter(Workout.user_id == user.id)
        .order_by(Workout.updated_at.desc(), Workout.id.desc())
        .all()
    )
    ready = [workout for workout in workouts if workout.exercises]
    if not ready:
        return None, len(workouts)
    last_done = dict(
        db.query(WorkoutSession.workout_id, func.max(WorkoutSession.started_at))
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.workout_id.in_([workout.id for workout in ready]),
        )
        .group_by(WorkoutSession.workout_id)
        .all()
    )
    never = datetime.min.replace(tzinfo=timezone.utc)
    choice = min(ready, key=lambda workout: aware(last_done.get(workout.id)) or never)
    muscles = []
    for item in choice.exercises:
        if item.exercise.muscle_group not in muscles:
            muscles.append(item.exercise.muscle_group)
    return {
        "id": choice.id,
        "name": choice.name,
        "exercise_count": len(choice.exercises),
        "muscle_groups": muscles,
        "last_done_at": aware(last_done.get(choice.id)),
    }, len(workouts)


def muscles_week(plan: Plan | None, everything: list[dict], today: date) -> list[dict]:
    monday = today - timedelta(days=today.weekday())
    done: dict[str, int] = {}
    last: dict[str, date] = {}
    for s in everything:
        for e in s["exercises"]:
            group = e["muscle_group"]
            last[group] = max(last.get(group, s["day"]), s["day"])
            if monday <= s["day"] <= today:
                done[group] = done.get(group, 0) + e["sets"]
    planned: dict[str, int] = {}
    for day in plan.days if plan else []:
        for item in day.workout.exercises:
            group = item.exercise.muscle_group
            planned[group] = planned.get(group, 0) + item.target_sets
    groups = set(planned) | set(done) | {g for g, d in last.items() if (today - d).days >= 7}
    items = [
        {
            "muscle_group": group,
            "done_sets": done.get(group, 0),
            "planned_sets": planned.get(group, 0) if plan else None,
            "last_trained_on": last.get(group),
            "days_since": (today - last[group]).days if group in last else None,
        }
        for group in groups
    ]
    return sorted(items, key=lambda i: (-(i["planned_sets"] or 0), -i["done_sets"], -(i["days_since"] or 0), i["muscle_group"]))


def muscle_map(plan: Plan | None, everything: list[dict], today: date) -> list[dict]:
    monday = today - timedelta(days=today.weekday())
    done: dict[str, float] = {}
    for s in everything:
        if not monday <= s["day"] <= today:
            continue
        for e in s["exercises"]:
            for muscle, credit in muscle_credit(e["muscles"]).items():
                done[muscle] = done.get(muscle, 0.0) + credit * e["sets"]
    planned: dict[str, float] = {}
    for day in plan.days if plan else []:
        for item in day.workout.exercises:
            for muscle, credit in muscle_credit(item.exercise.muscle_list()).items():
                planned[muscle] = planned.get(muscle, 0.0) + credit * item.target_sets
    return [
        {"muscle": muscle, "done_sets": round(done.get(muscle, 0.0), 1), "planned_sets": round(planned[muscle], 1) if plan and muscle in planned else (0.0 if plan else None)}
        for muscle in sorted(set(done) | set(planned))
    ]


def body_goal_summary(user: User, db: Session) -> dict | None:
    goal = find_goal(user, db, BODY_WEIGHT)
    return serialize_goal(goal, body_points(user, db, goal.start_on)) if goal else None


def body_weight_summary(user: User, db: Session) -> dict | None:
    entries = (
        db.query(BodyWeightEntry)
        .filter(BodyWeightEntry.user_id == user.id)
        .order_by(BodyWeightEntry.measured_on.desc())
        .limit(2)
        .all()
    )
    if not entries:
        return None
    since = today_br() - timedelta(days=90)
    recent = (
        db.query(BodyWeightEntry)
        .filter(BodyWeightEntry.user_id == user.id, BodyWeightEntry.measured_on >= since)
        .order_by(BodyWeightEntry.measured_on.desc())
        .limit(30)
        .all()
    )
    latest = entries[0]
    previous = entries[1] if len(entries) > 1 else None
    target = latest.measured_on - timedelta(days=30)
    candidates = (
        db.query(BodyWeightEntry)
        .filter(
            BodyWeightEntry.user_id == user.id,
            BodyWeightEntry.measured_on >= latest.measured_on - timedelta(days=45),
            BodyWeightEntry.measured_on <= latest.measured_on - timedelta(days=7),
        )
        .all()
    )
    baseline = min(candidates, key=lambda e: abs((e.measured_on - target).days), default=None)
    return {
        "weight_kg": float(latest.weight_kg),
        "measured_on": latest.measured_on,
        "change_kg": round(float(latest.weight_kg - previous.weight_kg), 2) if previous else None,
        "previous_on": previous.measured_on if previous else None,
        "month_change_kg": round(float(latest.weight_kg - baseline.weight_kg), 2) if baseline else None,
        "month_from_on": baseline.measured_on if baseline else None,
        "goal": body_goal_summary(user, db),
        "recent": [
            {"measured_on": entry.measured_on, "weight_kg": float(entry.weight_kg)}
            for entry in reversed(recent)
        ],
    }


def last_done_map(user: User, db: Session, workout_ids: list[int]) -> dict:
    return dict(
        db.query(WorkoutSession.workout_id, func.max(WorkoutSession.started_at))
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.workout_id.in_(workout_ids),
        )
        .group_by(WorkoutSession.workout_id)
        .all()
    )


def plan_summary(plan: Plan | None, week: dict, today: date) -> dict | None:
    if not plan:
        return None
    planned = planned_by_weekday(plan)
    today_entry = next(day for day in week["days"] if day["date"] == today)
    done_today = {item["workout_id"] for item in today_entry["planned"] if item["done"]}
    upcoming = None
    for offset in range(1, 8):
        day = today + timedelta(days=offset)
        if planned.get(day.weekday()):
            upcoming = {"date": day, "workouts": [workout.name for workout in planned[day.weekday()]]}
            break
    return {
        "id": plan.id,
        "name": plan.name,
        "today": [
            {
                "workout_id": workout.id,
                "name": workout.name,
                "exercise_count": len(workout.exercises),
                "muscle_groups": workout_muscles(workout),
                "last_done_at": None,
                "done": workout.id in done_today,
            }
            for workout in planned.get(today.weekday(), [])
        ],
        "next": upcoming,
    }


@fitness_overview_router.get("/overview", response_model=OverviewSchema)
def get_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = today_br()
    suggestion, workout_count = suggested_workout(user, db)
    plan = active_plan(user, db)
    everything = completed_facts(user, db)
    week = week_summary(user, db, today, plan)
    plan_info = plan_summary(plan, week, today)
    if plan_info and plan_info["today"]:
        last_done = last_done_map(user, db, [w["workout_id"] for w in plan_info["today"]])
        for item in plan_info["today"]:
            item["last_done_at"] = aware(last_done.get(item["workout_id"]))
        pending_today = [w for w in plan_info["today"] if not w["done"]]
        if pending_today:
            suggestion = {**pending_today[0], "id": pending_today[0]["workout_id"]}
    return {
        "today": today,
        "active_session": active_summary(user, db),
        "plan": plan_info,
        "week": week,
        "total_sessions": (
            db.query(func.count(WorkoutSession.id))
            .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
            .scalar()
        ),
        "last_session": last_session(user, db),
        "first_session_on": first_session_on(user, db),
        "suggested_workout": suggestion,
        "workout_count": workout_count,
        "body_weight": body_weight_summary(user, db),
        "muscles_week": muscles_week(plan, everything, today),
        "muscle_map": muscle_map(plan, everything, today),
        "recent_records": weight_records(everything, lambda s: s["day"] >= today - timedelta(days=13))[:3],
    }


def first_session_on(user: User, db: Session) -> date | None:
    first_started = (
        db.query(func.min(WorkoutSession.started_at))
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
        .scalar()
    )
    return to_br_date(first_started) if first_started else None


@fitness_overview_router.get("/week", response_model=WeekSchema)
def get_week(
    start: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = today_br()
    day = start or today
    monday = day - timedelta(days=day.weekday())
    plan = active_plan(user, db)
    return {
        **week_summary(user, db, today, plan, monday),
        "start": monday,
        "today": today,
        "has_plan": plan is not None,
        "first_session_on": first_session_on(user, db),
    }


def parse_month(value: str) -> date:
    try:
        year, month = (int(part) for part in value.split("-"))
        return date(year, month, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Mês inválido. Use o formato AAAA-MM.")


@fitness_overview_router.get("/calendar", response_model=CalendarSchema)
def get_calendar(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = today_br()
    first = parse_month(month) if month else today.replace(day=1)
    following = (first + timedelta(days=32)).replace(day=1)
    stats = session_stats(db)
    completed = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED
    )
    rows = (
        completed.with_entities(WorkoutSession, stats.c.total_sets, stats.c.volume)
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .filter(
            WorkoutSession.started_at >= br_day_start_utc(first),
            WorkoutSession.started_at < br_day_start_utc(following),
        )
        .order_by(WorkoutSession.started_at, WorkoutSession.id)
        .all()
    )
    days: dict[date, list[dict]] = {}
    for workout_session, total_sets, volume in rows:
        days.setdefault(to_br_date(workout_session.started_at), []).append({
            "id": workout_session.id,
            "name": workout_session.name,
            "started_at": aware(workout_session.started_at),
            "completed_at": aware(workout_session.completed_at),
            "total_sets": total_sets or 0,
            "volume_kg": float(volume or 0),
        })
    first_started = completed.with_entities(func.min(WorkoutSession.started_at)).scalar()
    return {
        "month": first.strftime("%Y-%m"),
        "today": today,
        "first_session_on": to_br_date(first_started) if first_started else None,
        "total_sessions": len(rows),
        "days_trained": len(days),
        "days": [{"date": day, "sessions": sessions} for day, sessions in sorted(days.items())],
    }
