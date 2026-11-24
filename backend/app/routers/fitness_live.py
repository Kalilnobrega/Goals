from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import CloseFriend, FitnessProfile, LiveAlert, LiveCheer, WorkoutSession
from app.fitness_load import without_body_weight
from app.fitness_schemas import CheerCreateSchema, CheerSchema, LiveFriendSchema, LiveSessionSchema
from .auth import get_current_user
from .fitness_sessions import IN_PROGRESS, aware, last_activity, serialize_session
from .fitness_social import find_profile, relation_to

fitness_live_router = APIRouter(prefix="/fitness/social", tags=["fitness"])

LIVE_IDLE = timedelta(minutes=30)
CHEER_GAP = timedelta(seconds=20)


def is_live(workout_session: WorkoutSession | None) -> bool:
    if workout_session is None or workout_session.status != IN_PROGRESS:
        return False
    return datetime.now(timezone.utc) - last_activity(workout_session) <= LIVE_IDLE


def live_session(db: Session, owner_id: int) -> WorkoutSession | None:
    workout_session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == owner_id, WorkoutSession.status == IN_PROGRESS)
        .order_by(WorkoutSession.started_at.desc())
        .first()
    )
    return workout_session if is_live(workout_session) else None


def can_watch(db: Session, viewer: int, owner: FitnessProfile) -> bool:
    return (
        owner.share_live is not False
        and db.get(CloseFriend, (owner.user_id, viewer)) is not None
        and relation_to(db, viewer, owner.user_id) == "friends"
    )


@fitness_live_router.get("/live", response_model=list[LiveFriendSchema])
def live_friends(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owners = [row.owner_id for row in db.query(CloseFriend.owner_id).filter(CloseFriend.friend_id == user.id)]
    result = []
    for owner_id in owners:
        profile = db.get(FitnessProfile, owner_id)
        if profile is None or not profile.username or not can_watch(db, user.id, profile):
            continue
        workout_session = live_session(db, owner_id)
        if workout_session is None:
            continue
        result.append({
            "username": profile.username,
            "name": db.get(User, owner_id).name,
            "session_name": workout_session.name,
            "started_at": aware(workout_session.started_at),
            "last_activity_at": last_activity(workout_session),
        })
    return sorted(result, key=lambda item: item["started_at"], reverse=True)


@fitness_live_router.get("/users/{username}/live", response_model=LiveSessionSchema)
def watch_live(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = watchable(db, user.id, username)
    owner = db.get(User, profile.user_id)
    author = {"username": profile.username, "name": owner.name}
    workout_session = live_session(db, profile.user_id)
    if workout_session is None:
        return {"live": False, "author": author, "session": None, "last_activity_at": None}
    with without_body_weight(profile.user_id, not profile.share_weight_close):
        detail = serialize_session(workout_session, db, with_history=False)
    for item in detail["exercises"]:
        item.update(note=None, previous=[], previous_at=None, previous_note=None, previous_scope=None, history=[])
    return {"live": True, "author": author, "session": detail, "last_activity_at": last_activity(workout_session)}


def watchable(db: Session, viewer: int, username: str) -> FitnessProfile:
    profile = find_profile(db, username)
    if profile is None or profile.user_id == viewer or not can_watch(db, viewer, profile):
        raise HTTPException(status_code=404, detail="Só melhores amigos acompanham esse treino ao vivo.")
    return profile


@fitness_live_router.put("/users/{username}/live-alert", status_code=204)
def follow_live(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = watchable(db, user.id, username)
    if db.get(LiveAlert, (user.id, profile.user_id)) is None:
        db.add(LiveAlert(watcher_id=user.id, owner_id=profile.user_id))
        db.commit()


@fitness_live_router.delete("/users/{username}/live-alert", status_code=204)
def unfollow_live(username: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = find_profile(db, username)
    if profile is not None:
        db.query(LiveAlert).filter(LiveAlert.watcher_id == user.id, LiveAlert.owner_id == profile.user_id).delete()
        db.commit()


@fitness_live_router.post("/users/{username}/live/cheer", status_code=204)
def cheer(username: str, data: CheerCreateSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = watchable(db, user.id, username)
    workout_session = live_session(db, profile.user_id)
    if workout_session is None:
        raise HTTPException(status_code=409, detail="Esse treino não está mais ao vivo.")
    now = datetime.now(timezone.utc)
    last = (
        db.query(LiveCheer.created_at)
        .filter(LiveCheer.session_id == workout_session.id, LiveCheer.sender_id == user.id)
        .order_by(LiveCheer.id.desc())
        .first()
    )
    if last is not None and now - aware(last.created_at) < CHEER_GAP:
        raise HTTPException(status_code=429, detail="Calma! Dá para mandar outro incentivo em alguns segundos.")
    db.add(LiveCheer(session_id=workout_session.id, sender_id=user.id, kind=data.kind, created_at=now))
    db.commit()


@fitness_live_router.get("/my-live/{session_id}/cheers", response_model=list[CheerSchema])
def my_cheers(
    session_id: int,
    after: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout_session = db.get(WorkoutSession, session_id)
    if workout_session is None or workout_session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Treino não encontrado.")
    query = db.query(LiveCheer).filter(LiveCheer.session_id == session_id)
    if after is not None:
        query = query.filter(LiveCheer.id > after)
    return [
        {"id": item.id, "kind": item.kind, "name": db.get(User, item.sender_id).name.split(" ")[0], "created_at": aware(item.created_at)}
        for item in query.order_by(LiveCheer.id).limit(50)
    ]
