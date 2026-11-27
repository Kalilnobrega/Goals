import copy
import json
import time
from sqlalchemy import event
from sqlalchemy.orm import Session
from app.fitness_models import BodyWeightEntry, Media, Plan, PlanDay, Post, SessionExercise, SetEntry, WorkoutSession

TTL_SECONDS = 60
TRACKED = (WorkoutSession, SessionExercise, SetEntry, BodyWeightEntry, Post, Media, Plan, PlanDay)
entries: dict[int, tuple[float, str, list]] = {}


def fingerprint(challenge) -> str:
    return json.dumps(
        {
            "members": sorted(member.user_id for member in challenge.members),
            "metrics": challenge.metrics,
            "min_rule": challenge.min_rule,
            "allow_manual": challenge.allow_manual,
            "start": challenge.start_date.isoformat(),
            "end": challenge.end_date.isoformat(),
        },
        sort_keys=True,
        default=str,
    )


def cached(challenge, compute) -> list[dict]:
    key = fingerprint(challenge)
    now = time.monotonic()
    hit = entries.get(challenge.id)
    if hit is not None and hit[0] > now and hit[1] == key:
        return copy.deepcopy(hit[2])
    rows = compute()
    entries[challenge.id] = (now + TTL_SECONDS, key, rows)
    return copy.deepcopy(rows)


def forget_all() -> None:
    entries.clear()


@event.listens_for(Session, "after_flush")
def forget_on_flush(session, flush_context) -> None:
    if entries and any(isinstance(item, TRACKED) for item in (*session.new, *session.dirty, *session.deleted)):
        forget_all()


@event.listens_for(Session, "do_orm_execute")
def forget_on_bulk_write(state) -> None:
    if entries and (state.is_update or state.is_delete) and any(mapper.class_ in TRACKED for mapper in state.all_mappers):
        forget_all()
