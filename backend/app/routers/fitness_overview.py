from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br, to_br_date, br_day_start_utc
from app.models import User
from app.fitness_models import Workout, WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry
from app.fitness_schemas import OverviewSchema, CalendarSchema
from .auth import get_current_user
from .fitness_sessions import IN_PROGRESS, COMPLETED, aware, session_stats, history_item

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
        db.query(func.count(SetEntry.id))
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .filter(SessionExercise.session_id == workout_session.id)
        .scalar()
    )
    return {
        "id": workout_session.id,
        "name": workout_session.name,
        "started_at": aware(workout_session.started_at),
        "total_sets": total_sets,
    }


def week_summary(user: User, db: Session, today) -> dict:
    monday = today - timedelta(days=today.weekday())
    stats = session_stats(db)
    rows = (
        db.query(WorkoutSession.started_at, WorkoutSession.completed_at, stats.c.total_sets, stats.c.volume)
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.started_at >= br_day_start_utc(monday),
        )
        .all()
    )
    per_day = {monday + timedelta(days=offset): 0 for offset in range(7)}
    sets = 0
    volume = 0.0
    seconds = 0.0
    for started_at, completed_at, total_sets, session_volume in rows:
        day = to_br_date(started_at)
        if day not in per_day:
            continue
        per_day[day] += 1
        sets += total_sets or 0
        volume += float(session_volume or 0)
        seconds += (aware(completed_at) - aware(started_at)).total_seconds()
    return {
        "days": [{"date": day, "sessions": count} for day, count in per_day.items()],
        "sessions": sum(per_day.values()),
        "sets": sets,
        "volume_kg": volume,
        "minutes": round(seconds / 60),
    }


def last_session(user: User, db: Session) -> dict | None:
    stats = session_stats(db)
    row = (
        db.query(WorkoutSession, stats.c.exercise_count, stats.c.total_sets, stats.c.volume)
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
        .order_by(WorkoutSession.completed_at.desc(), WorkoutSession.id.desc())
        .first()
    )
    return history_item(*row) if row else None


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
    latest = entries[0]
    previous = entries[1] if len(entries) > 1 else None
    return {
        "weight_kg": float(latest.weight_kg),
        "measured_on": latest.measured_on,
        "change_kg": round(float(latest.weight_kg - previous.weight_kg), 2) if previous else None,
        "previous_on": previous.measured_on if previous else None,
    }


@fitness_overview_router.get("/overview", response_model=OverviewSchema)
def get_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = today_br()
    suggestion, workout_count = suggested_workout(user, db)
    return {
        "today": today,
        "active_session": active_summary(user, db),
        "week": week_summary(user, db, today),
        "total_sessions": (
            db.query(func.count(WorkoutSession.id))
            .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
            .scalar()
        ),
        "last_session": last_session(user, db),
        "suggested_workout": suggestion,
        "workout_count": workout_count,
        "body_weight": body_weight_summary(user, db),
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
