from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, case, cast, func, literal, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import br_day_start_utc
from app.models import User
from app.fitness_models import Exercise, Workout, WorkoutExercise, WorkoutSession, SessionExercise, SetEntry
from app.fitness_schemas import (
    StartSessionSchema,
    AddSessionExerciseSchema,
    ReorderSessionSchema,
    EditSessionExerciseSchema,
    SetSchema,
    EditSetSchema,
    FinishSessionSchema,
    SessionResponseSchema,
    SessionHistorySchema,
    SetResponseSchema,
)
from app.fitness_load import BODYWEIGHT, BodyWeights, bodyweight_bonus, bodyweight_factors
from app.dates import to_br_date
from .auth import get_current_user
from .fitness import visible_exercises

fitness_sessions_router = APIRouter(prefix="/fitness", tags=["fitness"])

IN_PROGRESS = "in_progress"
COMPLETED = "completed"
FREE_SESSION_NAME = "Treino livre"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def to_kg(value: float) -> Decimal:
    return Decimal(str(round(value, 2)))


def serialize_set(entry: SetEntry) -> dict:
    return {
        "id": entry.id,
        "position": entry.position,
        "weight_kg": float(entry.weight_kg),
        "reps": entry.reps,
        "created_at": aware(entry.created_at),
        "client_id": entry.client_id,
        "side": entry.side,
        "duration_seconds": entry.duration_seconds,
        "distance_km": float(entry.distance_km) if entry.distance_km is not None else None,
        "speed_kmh": float(entry.speed_kmh) if entry.speed_kmh is not None else None,
        "level": entry.level,
    }


CARDIO = "cardio"
TIMED = ("time", CARDIO)
PREVIOUS_FIELDS = {"weight_kg", "reps", "side", "duration_seconds", "distance_km", "speed_kmh", "level"}


def series_count(entries) -> int:
    return len({("pair", entry.position) if entry.side else ("set", entry.id) for entry in entries})


def series_key():
    return case(
        (SetEntry.side.is_(None), cast(SetEntry.id, String)),
        else_=literal("p") + cast(SetEntry.session_exercise_id, String) + literal("-") + cast(SetEntry.position, String),
    )


def previous_performance(item: SessionExercise, workout_session: WorkoutSession, db: Session):
    if item.exercise_id is None:
        return None
    return (
        db.query(SessionExercise)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(
            WorkoutSession.user_id == workout_session.user_id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.id != workout_session.id,
            SessionExercise.exercise_id == item.exercise_id,
            SessionExercise.sets.any(),
        )
        .order_by(WorkoutSession.completed_at.desc(), SessionExercise.id.desc())
        .first()
    )


def last_activity(workout_session: WorkoutSession) -> datetime:
    times = [aware(entry.created_at) for item in workout_session.exercises for entry in item.sets]
    return max(times, default=aware(workout_session.started_at))


def serialize_session(workout_session: WorkoutSession, db: Session) -> dict:
    exercises = []
    total_sets = 0
    volume = Decimal(0)
    body = None
    factors = {}
    if any(item.equipment == BODYWEIGHT and item.sets for item in workout_session.exercises):
        body = BodyWeights(workout_session.user_id, db).on(to_br_date(aware(workout_session.started_at)))
        factors = bodyweight_factors(db, [item.exercise_id for item in workout_session.exercises if item.equipment == BODYWEIGHT])
    for item in workout_session.exercises:
        previous = previous_performance(item, workout_session, db)
        total_sets += series_count(item.sets)
        extra = Decimal(str(round(body * factors.get(item.exercise_id, 1.0), 2))) if body and item.equipment == BODYWEIGHT else Decimal(0)
        volume += sum(((entry.weight_kg + extra) * entry.reps for entry in item.sets), Decimal(0))
        exercises.append({
            "id": item.id,
            "exercise_id": item.exercise_id,
            "exercise_name": item.exercise_name,
            "muscle_group": item.muscle_group,
            "equipment": item.equipment,
            "muscles": item.muscles or [],
            "target_sets": item.target_sets,
            "reps_min": item.reps_min,
            "reps_max": item.reps_max,
            "rest_seconds": item.rest_seconds,
            "note": item.note,
            "unilateral": bool(item.unilateral),
            "tracking": item.tracking or "reps",
            "sets": [serialize_set(entry) for entry in item.sets],
            "previous": [
                {key: value for key, value in serialize_set(entry).items() if key in PREVIOUS_FIELDS}
                for entry in (previous.sets if previous else [])
            ],
            "previous_at": aware(db.get(WorkoutSession, previous.session_id).completed_at) if previous else None,
            "previous_note": previous.note if previous else None,
        })
    return {
        "id": workout_session.id,
        "workout_id": workout_session.workout_id,
        "name": workout_session.name,
        "status": workout_session.status,
        "started_at": aware(workout_session.started_at),
        "completed_at": aware(workout_session.completed_at),
        "last_activity_at": last_activity(workout_session),
        "total_sets": total_sets,
        "volume_kg": float(volume),
        "exercises": exercises,
    }


def active_session(user: User, db: Session) -> WorkoutSession | None:
    return (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == IN_PROGRESS)
        .first()
    )


def active_conflict(existing: WorkoutSession) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "message": f"Você já tem um treino em andamento: {existing.name}.",
            "session_id": existing.id,
        },
    )


def get_own_session(session_id: int, user: User, db: Session) -> WorkoutSession:
    workout_session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id)
        .first()
    )
    if not workout_session:
        raise HTTPException(status_code=404, detail="Treino não encontrado")
    return workout_session


def ensure_in_progress(workout_session: WorkoutSession):
    if workout_session.status != IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Esse treino já foi finalizado.")


def get_own_session_exercise(item_id: int, user: User, db: Session) -> SessionExercise:
    item = (
        db.query(SessionExercise)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(SessionExercise.id == item_id, WorkoutSession.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Exercício do treino não encontrado")
    ensure_in_progress(db.get(WorkoutSession, item.session_id))
    return item


def get_own_set(set_id: int, user: User, db: Session) -> SetEntry:
    entry = (
        db.query(SetEntry)
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(SetEntry.id == set_id, WorkoutSession.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Série não encontrada")
    ensure_in_progress(db.get(WorkoutSession, db.get(SessionExercise, entry.session_exercise_id).session_id))
    return entry


def get_visible_exercise(exercise_id: int, user: User, db: Session) -> Exercise:
    exercise = visible_exercises(user, db).filter(Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    return exercise


def last_rest(exercise_id: int, user: User, db: Session) -> int | None:
    row = (
        db.query(SessionExercise.rest_seconds)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(
            WorkoutSession.user_id == user.id,
            SessionExercise.exercise_id == exercise_id,
            SessionExercise.rest_seconds.isnot(None),
        )
        .order_by(SessionExercise.id.desc())
        .first()
    )
    return row[0] if row else None


def commit_session(workout_session: WorkoutSession, db: Session) -> dict:
    db.commit()
    db.refresh(workout_session)
    return serialize_session(workout_session, db)


def muscle_groups_by_session(session_ids: list[int], db: Session) -> dict[int, list[str]]:
    rows = (
        db.query(SessionExercise.session_id, SessionExercise.muscle_group, func.count(SetEntry.id))
        .join(SetEntry, SetEntry.session_exercise_id == SessionExercise.id)
        .filter(SessionExercise.session_id.in_(session_ids))
        .group_by(SessionExercise.session_id, SessionExercise.muscle_group)
        .all()
    )
    groups: dict[int, list[tuple[int, str]]] = {}
    for session_id, muscle_group, count in rows:
        groups.setdefault(session_id, []).append((count, muscle_group))
    return {
        session_id: [group for _, group in sorted(items, key=lambda pair: (-pair[0], pair[1]))]
        for session_id, items in groups.items()
    }


def session_stats(db: Session):
    return (
        db.query(
            SessionExercise.session_id.label("session_id"),
            func.count(func.distinct(SessionExercise.id)).label("exercise_count"),
            func.count(func.distinct(series_key())).label("total_sets"),
            func.sum(SetEntry.weight_kg * SetEntry.reps).label("volume"),
        )
        .join(SetEntry, SetEntry.session_exercise_id == SessionExercise.id)
        .group_by(SessionExercise.session_id)
        .subquery()
    )


def history_item(workout_session: WorkoutSession, exercise_count, total_sets, volume, muscle_groups=None) -> dict:
    return {
        "id": workout_session.id,
        "workout_id": workout_session.workout_id,
        "name": workout_session.name,
        "started_at": aware(workout_session.started_at),
        "completed_at": aware(workout_session.completed_at),
        "exercise_count": exercise_count or 0,
        "total_sets": total_sets or 0,
        "volume_kg": float(volume or 0),
        "muscle_groups": muscle_groups or [],
    }


@fitness_sessions_router.get("/sessions", response_model=SessionHistorySchema)
def list_sessions(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=60),
    workout_id: int | None = None,
    muscle_group: str | None = Query(default=None, max_length=20),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stats = session_stats(db)
    completed = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED
    )
    term = (q or "").strip()
    if term:
        pattern = f"%{term}%"
        has_exercise = (
            db.query(SessionExercise.id)
            .filter(
                SessionExercise.session_id == WorkoutSession.id,
                SessionExercise.exercise_name.ilike(pattern),
                SessionExercise.sets.any(),
            )
            .exists()
        )
        completed = completed.filter(or_(WorkoutSession.name.ilike(pattern), has_exercise))
    if workout_id is not None:
        completed = completed.filter(WorkoutSession.workout_id == workout_id)
    if muscle_group:
        trained_group = (
            db.query(SessionExercise.id)
            .filter(
                SessionExercise.session_id == WorkoutSession.id,
                SessionExercise.muscle_group == muscle_group,
                SessionExercise.sets.any(),
            )
            .exists()
        )
        completed = completed.filter(trained_group)
    if date_from:
        completed = completed.filter(WorkoutSession.started_at >= br_day_start_utc(date_from))
    if date_to:
        completed = completed.filter(WorkoutSession.started_at < br_day_start_utc(date_to + timedelta(days=1)))
    rows = (
        completed.with_entities(WorkoutSession, stats.c.exercise_count, stats.c.total_sets, stats.c.volume)
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .order_by(WorkoutSession.completed_at.desc(), WorkoutSession.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    muscles = muscle_groups_by_session([row[0].id for row in rows], db) if rows else {}
    bonus = bodyweight_bonus([(row[0].id, row[0].started_at) for row in rows], user.id, db)
    total = completed.count()
    return {
        "items": [
            history_item(
                workout_session, exercise_count, total_sets,
                float(volume or 0) + bonus.get(workout_session.id, 0.0), muscles.get(workout_session.id),
            )
            for workout_session, exercise_count, total_sets, volume in rows
        ],
        "total": total,
        "has_more": offset + len(rows) < total,
    }


@fitness_sessions_router.get("/sessions/active", response_model=SessionResponseSchema | None)
def get_active_session(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workout_session = active_session(user, db)
    return serialize_session(workout_session, db) if workout_session else None


@fitness_sessions_router.post("/sessions", response_model=SessionResponseSchema)
def start_session(
    data: StartSessionSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = active_session(user, db)
    if existing:
        raise active_conflict(existing)

    workout_session = WorkoutSession(
        user_id=user.id, name=FREE_SESSION_NAME, status=IN_PROGRESS, started_at=utcnow()
    )
    if data.workout_id is not None:
        workout = (
            db.query(Workout)
            .filter(Workout.id == data.workout_id, Workout.user_id == user.id)
            .first()
        )
        if not workout:
            raise HTTPException(status_code=404, detail="Ficha não encontrada")
        workout_session.workout_id = workout.id
        workout_session.name = workout.name
        workout_session.exercises = [
            SessionExercise(
                exercise_id=item.exercise_id,
                workout_exercise_id=item.id,
                exercise_name=item.exercise.name,
                muscle_group=item.exercise.muscle_group,
                equipment=item.exercise.equipment,
                muscles=item.exercise.muscle_list(),
                position=index,
                target_sets=item.target_sets,
                reps_min=item.reps_min,
                reps_max=item.reps_max,
                rest_seconds=item.rest_seconds,
                unilateral=item.unilateral if item.unilateral is not None else item.exercise.is_unilateral,
                tracking=item.exercise.tracking,
            )
            for index, item in enumerate(workout.exercises)
        ]

    db.add(workout_session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise active_conflict(active_session(user, db))
    db.refresh(workout_session)
    return serialize_session(workout_session, db)


@fitness_sessions_router.get("/sessions/{session_id}", response_model=SessionResponseSchema)
def get_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_session(get_own_session(session_id, user, db), db)


@fitness_sessions_router.post("/sessions/{session_id}/finish", response_model=SessionResponseSchema)
def finish_session(
    session_id: int,
    data: FinishSessionSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout_session = get_own_session(session_id, user, db)
    ensure_in_progress(workout_session)
    if not any(item.sets for item in workout_session.exercises):
        raise HTTPException(
            status_code=400, detail="Registre ao menos uma série ou descarte o treino."
        )
    now = utcnow()
    completed_at = aware(data.completed_at) or now
    if completed_at < aware(workout_session.started_at) or completed_at > now + timedelta(minutes=1):
        raise HTTPException(
            status_code=400, detail="O horário de término precisa ficar entre o início do treino e agora."
        )
    workout_session.status = COMPLETED
    workout_session.completed_at = completed_at
    return commit_session(workout_session, db)


@fitness_sessions_router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(get_own_session(session_id, user, db))
    db.commit()
    return {"message": "Treino excluído"}


@fitness_sessions_router.post("/sessions/{session_id}/exercises", response_model=SessionResponseSchema)
def add_session_exercise(
    session_id: int,
    data: AddSessionExerciseSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout_session = get_own_session(session_id, user, db)
    ensure_in_progress(workout_session)
    if len(workout_session.exercises) >= 40:
        raise HTTPException(status_code=400, detail="Um treino pode ter no máximo 40 exercícios.")
    exercise = get_visible_exercise(data.exercise_id, user, db)
    position = max((item.position for item in workout_session.exercises), default=-1) + 1
    workout_session.exercises.append(
        SessionExercise(
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            muscle_group=exercise.muscle_group,
            equipment=exercise.equipment,
            muscles=exercise.muscle_list(),
            position=position,
            rest_seconds=last_rest(exercise.id, user, db),
            unilateral=exercise.is_unilateral,
            tracking=exercise.tracking,
        )
    )
    return commit_session(workout_session, db)


@fitness_sessions_router.put("/sessions/{session_id}/order", response_model=SessionResponseSchema)
def reorder_session_exercises(
    session_id: int,
    data: ReorderSessionSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout_session = get_own_session(session_id, user, db)
    ensure_in_progress(workout_session)
    by_id = {item.id: item for item in workout_session.exercises}
    if len(data.exercise_ids) != len(by_id) or set(data.exercise_ids) != set(by_id):
        raise HTTPException(
            status_code=409, detail="A lista de exercícios mudou. Atualize a página e tente de novo."
        )
    for index, item_id in enumerate(data.exercise_ids):
        by_id[item_id].position = index
    return commit_session(workout_session, db)


@fitness_sessions_router.patch("/session-exercises/{item_id}", response_model=SessionResponseSchema)
def edit_session_exercise(
    item_id: int,
    data: EditSessionExerciseSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = get_own_session_exercise(item_id, user, db)
    workout_session = db.get(WorkoutSession, item.session_id)
    changes = data.model_fields_set

    if "exercise_id" in changes and data.exercise_id is not None and data.exercise_id != item.exercise_id:
        if item.sets:
            raise HTTPException(
                status_code=409, detail="Só dá para trocar um exercício que ainda não tem séries."
            )
        exercise = get_visible_exercise(data.exercise_id, user, db)
        item.exercise_id = exercise.id
        item.exercise_name = exercise.name
        item.muscle_group = exercise.muscle_group
        item.equipment = exercise.equipment
        item.muscles = exercise.muscle_list()
        item.workout_exercise_id = None
        item.unilateral = exercise.is_unilateral
        item.tracking = exercise.tracking
        if "rest_seconds" not in changes:
            item.rest_seconds = last_rest(exercise.id, user, db)

    if "note" in changes:
        item.note = data.note

    if "unilateral" in changes and data.unilateral is not None and data.unilateral != item.unilateral:
        if item.sets:
            raise HTTPException(
                status_code=409, detail="Só dá para mudar entre unilateral e normal antes de registrar séries."
            )
        item.unilateral = data.unilateral
        if item.workout_exercise_id is not None:
            planned = (
                db.query(WorkoutExercise)
                .join(Workout, Workout.id == WorkoutExercise.workout_id)
                .filter(WorkoutExercise.id == item.workout_exercise_id, Workout.user_id == user.id)
                .first()
            )
            if planned:
                planned.unilateral = data.unilateral

    if "rest_seconds" in changes:
        rest = data.rest_seconds or None
        item.rest_seconds = rest
        if item.workout_exercise_id is not None:
            planned = (
                db.query(WorkoutExercise)
                .join(Workout, Workout.id == WorkoutExercise.workout_id)
                .filter(WorkoutExercise.id == item.workout_exercise_id, Workout.user_id == user.id)
                .first()
            )
            if planned:
                planned.rest_seconds = rest

    return commit_session(workout_session, db)


@fitness_sessions_router.delete("/session-exercises/{item_id}", response_model=SessionResponseSchema)
def delete_session_exercise(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = get_own_session_exercise(item_id, user, db)
    workout_session = db.get(WorkoutSession, item.session_id)
    workout_session.exercises.remove(item)
    return commit_session(workout_session, db)


def existing_set(item_id: int, client_id: str, user: User, db: Session) -> SetEntry | None:
    return (
        db.query(SetEntry)
        .join(SessionExercise, SessionExercise.id == SetEntry.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .filter(
            SetEntry.session_exercise_id == item_id,
            SetEntry.client_id == client_id,
            WorkoutSession.user_id == user.id,
        )
        .first()
    )


@fitness_sessions_router.post("/session-exercises/{item_id}/sets", response_model=SetResponseSchema)
def add_set(
    item_id: int,
    data: SetSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.client_id:
        existing = existing_set(item_id, data.client_id, user, db)
        if existing:
            return serialize_set(existing)
    item = get_own_session_exercise(item_id, user, db)
    if len(item.sets) >= 100 or (not data.side and series_count(item.sets) >= 50):
        raise HTTPException(status_code=400, detail="Um exercício pode ter no máximo 50 séries.")
    timed = item.tracking in TIMED
    if timed and not data.duration_seconds:
        raise HTTPException(status_code=400, detail="Informe a duração.")
    if not timed and data.reps < 1:
        raise HTTPException(status_code=400, detail="Informe as repetições.")
    same_side = [s for s in item.sets if s.side == data.side]
    entry = SetEntry(
        position=(len(same_side) if data.side else max((s.position for s in same_side), default=0)) + 1,
        side=data.side,
        weight_kg=to_kg(0 if item.tracking == CARDIO else data.weight_kg),
        reps=0 if timed else data.reps,
        duration_seconds=data.duration_seconds if timed else None,
        distance_km=to_kg(data.distance_km) if item.tracking == CARDIO and data.distance_km else None,
        speed_kmh=round(Decimal(str(data.speed_kmh)), 1) if item.tracking == CARDIO and data.speed_kmh else None,
        level=data.level if item.tracking == CARDIO else None,
        created_at=utcnow(),
        client_id=data.client_id,
    )
    item.sets.append(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = existing_set(item_id, data.client_id, user, db)
        if not existing:
            raise
        return serialize_set(existing)
    db.refresh(entry)
    return serialize_set(entry)


@fitness_sessions_router.patch("/sets/{set_id}", response_model=SetResponseSchema)
def edit_set(
    set_id: int,
    data: EditSetSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_own_set(set_id, user, db)
    item = db.get(SessionExercise, entry.session_exercise_id)
    timed = item.tracking in TIMED
    changes = data.model_fields_set
    if data.weight_kg is not None and item.tracking != CARDIO:
        entry.weight_kg = to_kg(data.weight_kg)
    if data.reps is not None and not timed:
        entry.reps = data.reps
    if timed and data.duration_seconds is not None:
        entry.duration_seconds = data.duration_seconds
    if item.tracking == CARDIO:
        if "distance_km" in changes:
            entry.distance_km = to_kg(data.distance_km) if data.distance_km else None
        if "speed_kmh" in changes:
            entry.speed_kmh = round(Decimal(str(data.speed_kmh)), 1) if data.speed_kmh else None
        if "level" in changes:
            entry.level = data.level
    db.commit()
    db.refresh(entry)
    return serialize_set(entry)


@fitness_sessions_router.delete("/sets/{set_id}")
def delete_set(
    set_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_own_set(set_id, user, db)
    item = db.get(SessionExercise, entry.session_exercise_id)
    item.sets.remove(entry)
    db.flush()
    same_side = [s for s in item.sets if s.side == entry.side]
    for index, remaining in enumerate(sorted(same_side, key=lambda s: (s.position, s.id)), start=1):
        remaining.position = index
    db.commit()
    return {"message": "Série excluída"}
