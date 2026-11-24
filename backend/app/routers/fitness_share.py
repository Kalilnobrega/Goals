from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import FitnessProfile, Notification, SharedItem
from app.fitness_notifications import notify
from app.fitness_schemas import CopiedSharedSchema, ShareSendSchema, SharedItemSchema
from app.fitness_sharing import copy_snapshot, snapshot_for
from .auth import get_current_user
from .fitness_social import find_profile, own_profile, person, relation_to

fitness_share_router = APIRouter(prefix="/fitness/shares", tags=["fitness"])


def serialize(db: Session, item: SharedItem, me: int) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "sender": person(db, item.sender_id),
        "created_at": item.created_at,
        "snapshot": item.snapshot,
        "message": item.message,
        "is_mine": item.sender_id == me,
    }


@fitness_share_router.post("", response_model=list[SharedItemSchema])
def send_share(data: ShareSendSchema, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    sender = db.get(User, me.user_id)
    snapshot = snapshot_for(db, sender, data.kind, data.item_id)
    targets = []
    for username in dict.fromkeys(data.usernames):
        target = find_profile(db, username)
        if target is None or target.user_id == me.user_id or relation_to(db, me.user_id, target.user_id) != "friends":
            raise HTTPException(status_code=422, detail=f"Você só pode enviar para amigos. @{username.lstrip('@')} não é seu amigo.")
        targets.append(target)
    message = (data.message or "").strip() or None
    items = []
    for target in targets:
        item = SharedItem(sender_id=me.user_id, recipient_id=target.user_id, kind=data.kind, snapshot=snapshot, message=message)
        db.add(item)
        db.flush()
        notify(db, target.user_id, me.user_id, "shared_item", share_id=item.id, detail=data.kind)
        items.append(item)
    db.commit()
    return [serialize(db, item, me.user_id) for item in items]


@fitness_share_router.get("/received", response_model=list[SharedItemSchema])
def received(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.query(SharedItem)
        .filter(SharedItem.recipient_id == user.id)
        .order_by(SharedItem.created_at.desc(), SharedItem.id.desc())
        .limit(50)
        .all()
    )
    return [serialize(db, item, user.id) for item in items]


def visible_share(db: Session, share_id: int, user_id: int) -> SharedItem:
    item = db.get(SharedItem, share_id)
    if item is None or user_id not in (item.sender_id, item.recipient_id):
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")
    return item


@fitness_share_router.get("/{share_id}", response_model=SharedItemSchema)
def get_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize(db, visible_share(db, share_id, user.id), user.id)


@fitness_share_router.post("/{share_id}/copy", response_model=CopiedSharedSchema)
def copy_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = visible_share(db, share_id, user.id)
    return copy_snapshot(db, user, item.kind, item.snapshot, db.get(User, item.sender_id))


@fitness_share_router.delete("/{share_id}", status_code=204)
def delete_share(share_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(SharedItem, share_id)
    if item is None or item.recipient_id != user.id:
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")
    db.query(Notification).filter(Notification.share_id == item.id).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
