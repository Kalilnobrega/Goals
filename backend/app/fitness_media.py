from sqlalchemy.orm import Session
from app.fitness_models import Media, Notification, Post, PostComment, PostReaction
from app.fitness_storage import get_storage


def media_keys(media: list[Media]) -> list[str]:
    return [key for item in media for key in (item.storage_key, item.full_key) if key]


def delete_keys(keys: list[str]) -> None:
    storage = get_storage()
    for key in keys:
        try:
            storage.delete(key)
        except Exception:
            pass


def drop_media(db: Session, media: list[Media]) -> list[str]:
    keys = media_keys(media)
    for item in media:
        db.delete(item)
    return keys


def drop_post(db: Session, post: Post) -> list[str]:
    keys = drop_media(db, list(post.media))
    db.query(Notification).filter(Notification.post_id == post.id).delete(synchronize_session=False)
    db.query(PostReaction).filter(PostReaction.post_id == post.id).delete(synchronize_session=False)
    db.query(PostComment).filter(PostComment.post_id == post.id).delete(synchronize_session=False)
    db.delete(post)
    return keys


def drop_session_post(db: Session, session_id: int) -> list[str]:
    post = db.query(Post).filter(Post.session_id == session_id).first()
    return drop_post(db, post) if post is not None else []


def user_media_keys(db: Session, user_id: int) -> list[str]:
    return media_keys(db.query(Media).filter(Media.user_id == user_id).all())
