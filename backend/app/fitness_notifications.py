from sqlalchemy.orm import Session
from app.fitness_models import Notification, UserBlock


def blocked_between(db: Session, a: int, b: int) -> bool:
    return db.get(UserBlock, (a, b)) is not None or db.get(UserBlock, (b, a)) is not None


def notify(db: Session, user_id: int, actor_id: int, kind: str, **refs) -> None:
    if user_id == actor_id or blocked_between(db, user_id, actor_id):
        return
    db.add(Notification(user_id=user_id, actor_id=actor_id, kind=kind, **refs))


def renotify(db: Session, user_id: int, actor_id: int, kind: str, **refs) -> None:
    clear(db, user_id, actor_id, kind, **{key: value for key, value in refs.items() if key != "detail"})
    notify(db, user_id, actor_id, kind, **refs)


def clear_query(db: Session, user_id: int, actor_id: int, kind: str, **refs):
    query = db.query(Notification).filter(
        Notification.user_id == user_id, Notification.actor_id == actor_id, Notification.kind == kind
    )
    for key, value in refs.items():
        query = query.filter(getattr(Notification, key) == value)
    return query


def clear(db: Session, user_id: int, actor_id: int, kind: str, **refs) -> None:
    clear_query(db, user_id, actor_id, kind, **refs).delete(synchronize_session=False)
