from sqlalchemy.orm import Session
from app.fitness_models import CloseFriend, FitnessProfile, LiveAlert
from app.fitness_notifications import renotify


def alert_watchers(db: Session, owner_id: int, session_name: str) -> None:
    profile = db.get(FitnessProfile, owner_id)
    if profile is None or profile.share_live is False:
        return
    watchers = [row.watcher_id for row in db.query(LiveAlert.watcher_id).filter(LiveAlert.owner_id == owner_id)]
    for watcher in watchers:
        if db.get(CloseFriend, (owner_id, watcher)) is not None:
            renotify(db, watcher, owner_id, "live_started", detail=session_name[:60])
    if watchers:
        db.commit()
