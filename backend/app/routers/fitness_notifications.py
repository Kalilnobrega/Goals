from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import Challenge, FitnessProfile, Notification, Post, PostComment, SharedItem
from app.fitness_schemas import NotificationsSchema
from .auth import get_current_user

fitness_notifications_router = APIRouter(prefix="/fitness/notifications", tags=["fitness"])

PAGE_SIZE = 30
PREVIEW = 80


def unread_count(db: Session, user_id: int) -> int:
    return db.query(func.count(Notification.id)).filter(Notification.user_id == user_id, Notification.read_at.is_(None)).scalar()


def serialize(db: Session, item: Notification) -> dict | None:
    if item.post_id and db.get(Post, item.post_id) is None:
        return None
    challenge = db.get(Challenge, item.challenge_id) if item.challenge_id else None
    if item.challenge_id and challenge is None:
        return None
    comment = db.get(PostComment, item.comment_id) if item.comment_id else None
    if item.comment_id and comment is None:
        return None
    if item.share_id and db.get(SharedItem, item.share_id) is None:
        return None
    actor = db.get(User, item.actor_id)
    profile = db.get(FitnessProfile, item.actor_id)
    preview = None
    if comment is not None:
        preview = comment.text if len(comment.text) <= PREVIEW else f"{comment.text[:PREVIEW].rstrip()}…"
    return {
        "id": item.id,
        "kind": item.kind,
        "actor": {"username": profile.username if profile else None, "name": actor.name},
        "created_at": item.created_at,
        "read": item.read_at is not None,
        "post_id": item.post_id,
        "challenge_id": item.challenge_id,
        "challenge_name": challenge.name if challenge else None,
        "detail": item.detail,
        "preview": preview,
        "share_id": item.share_id,
    }


@fitness_notifications_router.get("", response_model=NotificationsSchema)
def list_notifications(
    before: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.user_id == user.id)
    if before is not None:
        query = query.filter(Notification.id < before)
    rows = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(PAGE_SIZE + 1).all()
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    items = [entry for entry in (serialize(db, row) for row in rows) if entry is not None]
    return {"notifications": items, "next_before": rows[-1].id if more else None, "unread": unread_count(db, user.id)}


@fitness_notifications_router.post("/read-all", status_code=204)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read_at.is_(None)).update(
        {Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False
    )
    db.commit()
