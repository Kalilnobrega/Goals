from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import CloseFriend, FitnessProfile, WorkoutSession
from app.fitness_schemas import LiveFriendSchema
from .auth import get_current_user
from .fitness_sessions import IN_PROGRESS, aware, last_activity
from .fitness_social import relation_to

fitness_live_router = APIRouter(prefix="/fitness/social", tags=["fitness"])

LIVE_IDLE = timedelta(minutes=30)


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
