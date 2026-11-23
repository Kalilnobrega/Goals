from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br
from app.models import User
from app.fitness_models import ChallengeMember, CloseFriend, FitnessProfile, Friendship, UserBlock, UserReport
from app.fitness_schemas import (
    FriendRequestSchema,
    FriendsSchema,
    ReportSchema,
    SocialProfileSchema,
    SocialUserSchema,
)
from app.fitness_notifications import clear, notify
from .auth import get_current_user
from .fitness_profile import normalize_username
from .fitness_plans import active_plan
from .fitness_overview import plan_week_streak
from .fitness_stats import completed_facts, weight_records

fitness_social_router = APIRouter(prefix="/fitness/social", tags=["fitness"])

NOT_FOUND = "Perfil não encontrado."
NEEDS_USERNAME = "Crie seu @username para usar o Social."
SEARCH_LIMIT = 20
RECENT_SESSIONS = 5
RECENT_RECORDS = 5


def own_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FitnessProfile:
    profile = db.get(FitnessProfile, user.id)
    if profile is None or not profile.username:
        raise HTTPException(status_code=409, detail=NEEDS_USERNAME)
    return profile


def find_profile(db: Session, username: str) -> FitnessProfile | None:
    normalized = normalize_username(username)
    if not normalized:
        return None
    return db.query(FitnessProfile).filter(FitnessProfile.username == normalized).first()


def pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def friendship_between(db: Session, a: int, b: int) -> Friendship | None:
    low, high = pair(a, b)
    return db.query(Friendship).filter(Friendship.user_low_id == low, Friendship.user_high_id == high).first()


def has_blocked(db: Session, blocker: int, blocked: int) -> bool:
    return db.get(UserBlock, (blocker, blocked)) is not None


def relation_to(db: Session, me: int, other: int) -> str:
    if me == other:
        return "self"
    if has_blocked(db, me, other):
        return "blocked"
    friendship = friendship_between(db, me, other)
    if friendship is None:
        return "none"
    if friendship.status == "accepted":
        return "friends"
    return "request_sent" if friendship.requester_id == me else "request_received"


def visible_target(db: Session, me: int, username: str) -> FitnessProfile:
    target = find_profile(db, username)
    if target is None or (target.user_id != me and has_blocked(db, target.user_id, me)):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return target


def other_target(db: Session, me: int, username: str) -> FitnessProfile:
    target = visible_target(db, me, username)
    if target.user_id == me:
        raise HTTPException(status_code=422, detail="Essa ação não vale para o seu próprio perfil.")
    return target


def social_user(db: Session, me: int, profile: FitnessProfile, user: User | None = None) -> dict:
    owner = user or db.get(User, profile.user_id)
    return {"username": profile.username, "name": owner.name, "relation": relation_to(db, me, profile.user_id)}


def shares_challenge(db: Session, a: int, b: int) -> bool:
    mine = db.query(ChallengeMember.challenge_id).filter(ChallengeMember.user_id == a)
    return (
        db.query(ChallengeMember.challenge_id)
        .filter(ChallengeMember.user_id == b, ChallengeMember.challenge_id.in_(mine))
        .first()
        is not None
    )


def is_close(db: Session, viewer: int, owner: int, relation: str) -> bool:
    if relation in ("self", "friends"):
        return True
    return relation == "none" and shares_challenge(db, viewer, owner)


def can_view(visibility: str, relation: str, close: bool = False) -> bool:
    if relation == "self":
        return True
    if relation == "blocked" or visibility == "private":
        return False
    if visibility == "public":
        return True
    return close


def friend_count(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(Friendship.id))
        .filter(
            Friendship.status == "accepted",
            or_(Friendship.user_low_id == user_id, Friendship.user_high_id == user_id),
        )
        .scalar()
    )


def profile_details(db: Session, owner: User, show_sessions: bool) -> dict:
    today = today_br()
    facts = completed_facts(owner, db)
    streak = plan_week_streak(owner, db, today, active_plan(owner, db))
    month_start = today.replace(day=1)
    details = {
        "stats": {
            "workouts": len(facts),
            "workouts_this_month": sum(1 for s in facts if s["day"] >= month_start),
            "week_streak": streak["current"],
            "best_week_streak": streak["best"],
            "friends": friend_count(db, owner.id),
            "member_since": facts[0]["day"] if facts else None,
        },
        "records": [
            {
                "name": record["name"],
                "weight_kg": record["weight_kg"],
                "reps": record["reps"],
                "previous_kg": record["previous_kg"],
                "date": record["date"],
            }
            for record in weight_records(facts, lambda s: True)[:RECENT_RECORDS]
        ],
        "recent_sessions": None,
    }
    if show_sessions:
        details["recent_sessions"] = [
            {
                "name": s["name"],
                "date": s["day"],
                "minutes": round(s["minutes"]),
                "volume_kg": round(s["volume"], 1),
                "exercises": len(s["exercises"]) + len(s["cardio"]),
            }
            for s in reversed(facts[-RECENT_SESSIONS:])
        ]
    return details


@fitness_social_router.get("/search", response_model=list[SocialUserSchema])
def search_people(
    q: str = Query(default="", max_length=60),
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    term = q.strip()
    handle = normalize_username(term)
    if len(handle) < 2:
        return []
    blocked_me = db.query(UserBlock.blocker_id).filter(UserBlock.blocked_id == me.user_id)
    pattern = handle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    name_pattern = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = (
        db.query(FitnessProfile, User)
        .join(User, User.id == FitnessProfile.user_id)
        .filter(
            FitnessProfile.username.isnot(None),
            FitnessProfile.user_id != me.user_id,
            FitnessProfile.user_id.notin_(blocked_me),
            or_(
                FitnessProfile.username.like(f"{pattern}%", escape="\\"),
                and_(FitnessProfile.visibility == "public", User.name.ilike(f"%{name_pattern}%", escape="\\")),
            ),
        )
        .order_by((FitnessProfile.username == handle).desc(), FitnessProfile.username)
        .limit(SEARCH_LIMIT)
        .all()
    )
    return [social_user(db, me.user_id, profile, user) for profile, user in rows]


@fitness_social_router.get("/users/{username}", response_model=SocialProfileSchema)
def get_social_profile(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = visible_target(db, user.id, username)
    owner = db.get(User, target.user_id)
    relation = relation_to(db, user.id, target.user_id)
    visibility = target.visibility or "friends"
    close = is_close(db, user.id, target.user_id, relation)
    viewable = can_view(visibility, relation, close)
    close_access = relation == "friends" and is_close_friend(db, target.user_id, user.id)
    response = {
        "username": target.username,
        "name": owner.name,
        "visibility": visibility,
        "relation": relation,
        "can_view": viewable,
        "close_access": close_access,
        "is_close_friend": relation == "friends" and is_close_friend(db, user.id, target.user_id),
        "weight_shared": close_access and bool(target.share_weight_close),
    }
    if viewable:
        response.update(profile_details(db, owner, close))
    return response


def is_close_friend(db: Session, owner: int, friend: int) -> bool:
    return db.get(CloseFriend, (owner, friend)) is not None


def drop_close_friends(db: Session, a: int, b: int) -> None:
    db.query(CloseFriend).filter(
        or_(
            and_(CloseFriend.owner_id == a, CloseFriend.friend_id == b),
            and_(CloseFriend.owner_id == b, CloseFriend.friend_id == a),
        )
    ).delete(synchronize_session=False)


def friend_entry(db: Session, friendship: Friendship, me: int) -> dict | None:
    other_id = friendship.user_high_id if friendship.user_low_id == me else friendship.user_low_id
    profile = db.get(FitnessProfile, other_id)
    if profile is None or not profile.username:
        return None
    other = db.get(User, other_id)
    return {
        "username": profile.username,
        "name": other.name,
        "since": friendship.accepted_at if friendship.status == "accepted" else friendship.created_at,
        "close": friendship.status == "accepted" and is_close_friend(db, me, other_id),
    }


@fitness_social_router.get("/friends", response_model=FriendsSchema)
def list_friends(me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    rows = (
        db.query(Friendship)
        .filter(or_(Friendship.user_low_id == me.user_id, Friendship.user_high_id == me.user_id))
        .order_by(Friendship.created_at.desc())
        .all()
    )
    result = {"friends": [], "incoming": [], "outgoing": []}
    for friendship in rows:
        entry = friend_entry(db, friendship, me.user_id)
        if entry is None:
            continue
        if friendship.status == "accepted":
            result["friends"].append(entry)
        elif friendship.requester_id == me.user_id:
            result["outgoing"].append(entry)
        else:
            result["incoming"].append(entry)
    result["friends"].sort(key=lambda f: f["name"].lower())
    return result


@fitness_social_router.post("/friends/requests", response_model=SocialUserSchema)
def send_friend_request(
    data: FriendRequestSchema,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, data.username)
    if has_blocked(db, me.user_id, target.user_id):
        raise HTTPException(status_code=409, detail="Desbloqueie essa pessoa para enviar um pedido.")
    friendship = friendship_between(db, me.user_id, target.user_id)
    if friendship is None:
        low, high = pair(me.user_id, target.user_id)
        db.add(Friendship(user_low_id=low, user_high_id=high, requester_id=me.user_id, status="pending"))
        notify(db, target.user_id, me.user_id, "friend_request")
    elif friendship.status == "accepted":
        raise HTTPException(status_code=409, detail="Vocês já são amigos.")
    elif friendship.requester_id != me.user_id:
        friendship.status = "accepted"
        friendship.accepted_at = datetime.now(timezone.utc)
        clear(db, me.user_id, target.user_id, "friend_request")
        notify(db, target.user_id, me.user_id, "friend_accepted")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return social_user(db, me.user_id, target)


@fitness_social_router.post("/friends/{username}/accept", response_model=SocialUserSchema)
def accept_friend_request(
    username: str,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, username)
    friendship = friendship_between(db, me.user_id, target.user_id)
    if friendship is None or friendship.status != "pending" or friendship.requester_id == me.user_id:
        raise HTTPException(status_code=404, detail="Pedido de amizade não encontrado.")
    friendship.status = "accepted"
    friendship.accepted_at = datetime.now(timezone.utc)
    clear(db, me.user_id, target.user_id, "friend_request")
    notify(db, target.user_id, me.user_id, "friend_accepted")
    db.commit()
    return social_user(db, me.user_id, target)


@fitness_social_router.delete("/friends/{username}", response_model=SocialUserSchema)
def remove_friendship(
    username: str,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, username)
    friendship = friendship_between(db, me.user_id, target.user_id)
    if friendship is None:
        raise HTTPException(status_code=404, detail="Não há amizade nem pedido com essa pessoa.")
    if friendship.status == "pending":
        clear(db, target.user_id, me.user_id, "friend_request")
        clear(db, me.user_id, target.user_id, "friend_request")
    drop_close_friends(db, me.user_id, target.user_id)
    db.delete(friendship)
    db.commit()
    return social_user(db, me.user_id, target)


@fitness_social_router.get("/blocks", response_model=list[SocialUserSchema])
def list_blocks(me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    rows = (
        db.query(FitnessProfile, User)
        .join(UserBlock, UserBlock.blocked_id == FitnessProfile.user_id)
        .join(User, User.id == FitnessProfile.user_id)
        .filter(UserBlock.blocker_id == me.user_id, FitnessProfile.username.isnot(None))
        .order_by(UserBlock.created_at.desc())
        .all()
    )
    return [{"username": profile.username, "name": user.name, "relation": "blocked"} for profile, user in rows]


@fitness_social_router.post("/blocks/{username}", response_model=SocialUserSchema)
def block_user(
    username: str,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, username)
    if not has_blocked(db, me.user_id, target.user_id):
        db.add(UserBlock(blocker_id=me.user_id, blocked_id=target.user_id))
    friendship = friendship_between(db, me.user_id, target.user_id)
    if friendship is not None:
        db.delete(friendship)
    drop_close_friends(db, me.user_id, target.user_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return social_user(db, me.user_id, target)


@fitness_social_router.delete("/blocks/{username}", response_model=SocialUserSchema)
def unblock_user(
    username: str,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, username)
    block = db.get(UserBlock, (me.user_id, target.user_id))
    if block is not None:
        db.delete(block)
        db.commit()
    return social_user(db, me.user_id, target)


@fitness_social_router.post("/reports/{username}", status_code=201)
def report_user(
    username: str,
    data: ReportSchema,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    target = other_target(db, me.user_id, username)
    details = (data.details or "").strip() or None
    db.add(UserReport(reporter_id=me.user_id, reported_id=target.user_id, reason=data.reason, details=details))
    db.commit()
    return {"message": "Denúncia enviada. Obrigado por avisar."}


@fitness_social_router.get("/close-friends", response_model=list[SocialUserSchema])
def list_close_friends(me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    rows = (
        db.query(FitnessProfile, User)
        .join(CloseFriend, CloseFriend.friend_id == FitnessProfile.user_id)
        .join(User, User.id == FitnessProfile.user_id)
        .filter(CloseFriend.owner_id == me.user_id)
        .order_by(User.name)
        .all()
    )
    return [{"username": profile.username, "name": user.name, "relation": "friends"} for profile, user in rows]


@fitness_social_router.put("/close-friends/{username}", response_model=SocialUserSchema)
def add_close_friend(username: str, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    target = other_target(db, me.user_id, username)
    if relation_to(db, me.user_id, target.user_id) != "friends":
        raise HTTPException(status_code=409, detail="Só dá para marcar como melhor amigo quem já é seu amigo.")
    if not is_close_friend(db, me.user_id, target.user_id):
        db.add(CloseFriend(owner_id=me.user_id, friend_id=target.user_id))
        db.commit()
    return social_user(db, me.user_id, target)


@fitness_social_router.delete("/close-friends/{username}", response_model=SocialUserSchema)
def remove_close_friend(username: str, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    target = other_target(db, me.user_id, username)
    db.query(CloseFriend).filter(CloseFriend.owner_id == me.user_id, CloseFriend.friend_id == target.user_id).delete()
    db.commit()
    return social_user(db, me.user_id, target)
