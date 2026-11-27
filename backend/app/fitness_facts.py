import os
import secrets
import threading
from collections import OrderedDict
from sqlalchemy import event, select, update
from sqlalchemy.orm import Session, object_session
from app.models import User
from app.fitness_models import (
    BodyWeightEntry, Exercise, ExerciseGymLink, ExerciseGymSetting, ExerciseIntensity,
    Gym, SessionExercise, SetEntry, WorkoutSession,
)

TRACKED = (
    WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry, Exercise,
    ExerciseIntensity, Gym, ExerciseGymSetting, ExerciseGymLink,
)
EVERYONE = object()
MAX_ENTRIES = int(os.getenv("FACTS_CACHE_SIZE", "256"))

entries: OrderedDict = OrderedDict()
lock = threading.Lock()


def clone(value):
    if isinstance(value, dict):
        return {key: clone(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clone(item) for item in value]
    return value


def forget_all() -> None:
    with lock:
        entries.clear()


def remember_user(db: Session, user_id: int) -> None:
    db.info["facts_user"] = user_id


def bump(db: Session, users) -> None:
    if not users:
        return
    statement = update(User.__table__).values(facts_version=secrets.token_hex(8))
    if EVERYONE not in users:
        statement = statement.where(User.__table__.c.id.in_(users))
    db.connection().execute(statement)


def owners(db: Session, objects) -> set:
    users = set()
    sessions = {}
    items = {}
    pending_sessions = set()
    pending_items = set()
    for obj in objects:
        if isinstance(obj, WorkoutSession):
            sessions[obj.id] = obj.user_id
            users.add(obj.user_id)
        elif isinstance(obj, SessionExercise):
            items[obj.id] = obj.session_id
    for obj in objects:
        if isinstance(obj, SessionExercise):
            if obj.session_id in sessions:
                users.add(sessions[obj.session_id])
            else:
                pending_sessions.add(obj.session_id)
        elif isinstance(obj, SetEntry):
            session_id = items.get(obj.session_exercise_id)
            if session_id is None:
                pending_items.add(obj.session_exercise_id)
            elif session_id in sessions:
                users.add(sessions[session_id])
            else:
                pending_sessions.add(session_id)
        elif not isinstance(obj, WorkoutSession):
            users.add(EVERYONE if obj.user_id is None else obj.user_id)
    connection = db.connection()
    if pending_items:
        rows = connection.execute(
            select(SessionExercise.__table__.c.session_id).where(SessionExercise.__table__.c.id.in_(pending_items))
        ).scalars().all()
        pending_sessions.update(rows)
        if len(rows) < len(pending_items):
            users.add(db.info.get("facts_user", EVERYONE))
    pending_sessions.discard(None)
    if pending_sessions:
        rows = connection.execute(
            select(WorkoutSession.__table__.c.user_id).where(WorkoutSession.__table__.c.id.in_(pending_sessions))
        ).scalars().all()
        users.update(rows)
        if len(rows) < len(pending_sessions):
            users.add(db.info.get("facts_user", EVERYONE))
    users.discard(None)
    return users


def record(db: Session | None, target) -> None:
    if db is not None:
        db.info.setdefault("facts_written", []).append(target)


def written(mapper, connection, target) -> None:
    record(object_session(target), target)


def changed(mapper, connection, target) -> None:
    db = object_session(target)
    if db is not None and db.is_modified(target, include_collections=False):
        record(db, target)


for model in TRACKED:
    event.listen(model, "before_insert", written)
    event.listen(model, "before_delete", written)
    event.listen(model, "before_update", changed)


@event.listens_for(Session, "after_flush")
def after_flush(db: Session, context) -> None:
    objects = db.info.pop("facts_written", None)
    if objects:
        bump(db, owners(db, objects))


@event.listens_for(Session, "after_soft_rollback")
def after_rollback(db: Session, previous) -> None:
    db.info.pop("facts_written", None)


@event.listens_for(Session, "do_orm_execute")
def bulk_write(state) -> None:
    if not (state.is_update or state.is_delete):
        return
    if any(mapper.class_ in TRACKED for mapper in state.all_mappers):
        bump(state.session, {state.session.info.get("facts_user", EVERYONE)})


def unsaved(db: Session) -> bool:
    dirty = [obj for obj in db.dirty if db.is_modified(obj)]
    return any(isinstance(obj, TRACKED) for obj in (*db.new, *dirty, *db.deleted))


def cached(db: Session, user_id: int, key: tuple, compute):
    if unsaved(db):
        return compute()
    version = db.execute(select(User.__table__.c.facts_version).where(User.__table__.c.id == user_id)).scalar()
    full_key = (user_id, version, *key)
    with lock:
        hit = entries.get(full_key)
        if hit is not None:
            entries.move_to_end(full_key)
    if hit is not None:
        return clone(hit)
    facts = compute()
    with lock:
        entries[full_key] = clone(facts)
        entries.move_to_end(full_key)
        while len(entries) > MAX_ENTRIES:
            entries.popitem(last=False)
    return facts
