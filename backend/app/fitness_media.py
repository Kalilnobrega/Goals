from sqlalchemy.orm import Session
from app.fitness_models import Media, Post
from app.fitness_storage import get_storage


def delete_files(media: list[Media]) -> None:
    storage = get_storage()
    for item in media:
        for key in (item.storage_key, item.full_key):
            if not key:
                continue
            try:
                storage.delete(key)
            except Exception:
                pass


def purge_session_posts(db: Session, session_id: int) -> None:
    post = db.query(Post).filter(Post.session_id == session_id).first()
    if post is not None:
        delete_files(list(post.media))


def purge_user_media(db: Session, user_id: int) -> None:
    delete_files(db.query(Media).filter(Media.user_id == user_id).all())
