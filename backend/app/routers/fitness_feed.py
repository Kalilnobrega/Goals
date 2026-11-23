import secrets
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import to_br_date, today_br
from app.models import User
from app.fitness_models import (
    ChallengeMember, Exercise, FitnessProfile, Notification, Workout, Friendship, Media, Post, PostComment, PostReaction, UserBlock, UserReport, WorkoutSession,
)
from app.fitness_schemas import (
    CommentCreateSchema,
    CommentSchema,
    FeedSchema,
    PostCreateSchema,
    PostDetailSchema,
    PostReportSchema,
    PostableSessionSchema,
    PostWorkoutDetailSchema,
    CopiedSharedSchema,
    CopiedWorkoutSchema,
    WorkoutSchema,
    PostSchema,
    ProgressPhotoSchema,
    ReactionSchema,
)
from app.fitness_media import delete_files
from app.fitness_muscles import muscle_credit
from app.fitness_storage import EXTENSIONS, MAX_BYTES, get_storage, media_url, sniff, valid_signature
from app.fitness_notifications import clear, notify, renotify
from app.fitness_sharing import build_copy, copy_snapshot, snapshot_for
from .auth import get_current_user
from .fitness_sessions import COMPLETED, serialize_session, series_count
from .fitness import build_workout_cardio, build_workout_exercises
from .fitness_social import can_view, has_blocked, is_close, own_profile, relation_to
from .fitness_stats import completed_facts, session_facts, weight_records

fitness_feed_router = APIRouter(prefix="/fitness", tags=["fitness"])

PAGE_SIZE = 20
CHECKIN_PAST_DAYS = 7
MAX_MEDIA = 4
PENDING_TTL = timedelta(days=1)
NOT_FOUND = "Post não encontrado."


def media_out(item: Media) -> dict:
    url = media_url(item.id)
    return {
        "id": item.id,
        "url": url,
        "full_url": media_url(item.id, "full") if item.full_key else url,
        "width": item.width,
        "height": item.height,
        "full_width": item.full_width or item.width,
        "full_height": item.full_height or item.height,
    }


async def read_image(upload: UploadFile) -> tuple[bytes, str]:
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="A foto pode ter no máximo 8 MB.")
    content_type = sniff(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Envie uma foto em JPEG, PNG ou WebP.")
    return data, content_type


def dimension(value: int | None) -> int | None:
    return value if value and 0 < value < 20000 else None


def drop_stale_pending(db: Session, user_id: int) -> None:
    limit = datetime.now(timezone.utc) - PENDING_TTL
    stale = (
        db.query(Media)
        .filter(Media.user_id == user_id, Media.kind == "post", Media.post_id.is_(None), Media.created_at < limit)
        .all()
    )
    if stale:
        delete_files(stale)
        for item in stale:
            db.delete(item)
        db.commit()


@fitness_feed_router.post("/media", response_model=ProgressPhotoSchema)
async def upload_media(
    file: UploadFile = File(...),
    full: UploadFile | None = File(None),
    kind: str = Form("post"),
    width: int | None = Form(None),
    height: int | None = Form(None),
    full_width: int | None = Form(None),
    full_height: int | None = Form(None),
    taken_on: date | None = Form(None),
    note: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in ("post", "progress"):
        raise HTTPException(status_code=422, detail="Tipo de foto inválido.")
    data, content_type = await read_image(file)
    full_data, full_type = await read_image(full) if full is not None else (None, None)
    if taken_on and taken_on > today_br():
        raise HTTPException(status_code=422, detail="A data da foto não pode ser no futuro.")
    drop_stale_pending(db, user.id)
    base = f"{user.id}/{secrets.token_urlsafe(16)}"
    key = f"{base}.{EXTENSIONS[content_type]}"
    storage = get_storage()
    storage.save(key, data, content_type)
    full_key = f"{base}-full.{EXTENSIONS[full_type]}" if full_data else None
    if full_key:
        storage.save(full_key, full_data, full_type)
    media = Media(
        user_id=user.id,
        kind=kind,
        storage_key=key,
        content_type=content_type,
        size=len(data),
        width=dimension(width),
        height=dimension(height),
        full_key=full_key,
        full_content_type=full_type,
        full_width=dimension(full_width) if full_key else None,
        full_height=dimension(full_height) if full_key else None,
        taken_on=(taken_on or today_br()) if kind == "progress" else None,
        note=((note or "").strip()[:140] or None) if kind == "progress" else None,
    )
    db.add(media)
    db.commit()
    return {**media_out(media), "taken_on": media.taken_on, "note": media.note}


@fitness_feed_router.get("/media/{media_id}")
def serve_media(
    media_id: int,
    v: str = Query(default="feed", pattern="^(feed|full)$"),
    exp: int = Query(...),
    sig: str = Query(..., max_length=64),
    db: Session = Depends(get_db),
):
    if not valid_signature(media_id, v, exp, sig):
        raise HTTPException(status_code=403, detail="Link da foto expirado.")
    media = db.get(Media, media_id)
    full = v == "full" and media is not None and media.full_key
    key = (media.full_key if full else media.storage_key) if media else None
    data = get_storage().read(key) if key else None
    if data is None:
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    content_type = media.full_content_type if full else media.content_type
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"})


@fitness_feed_router.get("/progress-photos", response_model=list[ProgressPhotoSchema])
def list_progress_photos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    photos = (
        db.query(Media)
        .filter(Media.user_id == user.id, Media.kind == "progress")
        .order_by(Media.taken_on.desc(), Media.id.desc())
        .all()
    )
    return [{**media_out(p), "taken_on": p.taken_on, "note": p.note} for p in photos]


@fitness_feed_router.delete("/media/{media_id}", status_code=204)
def delete_media(media_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    media = db.get(Media, media_id)
    if media is None or media.user_id != user.id or media.post_id is not None:
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    delete_files([media])
    db.delete(media)
    db.commit()


def author_profile(db: Session, user_id: int) -> tuple[User, FitnessProfile | None]:
    return db.get(User, user_id), db.get(FitnessProfile, user_id)


def can_see(db: Session, viewer: int, author: int) -> bool:
    if viewer == author:
        return True
    if has_blocked(db, author, viewer) or has_blocked(db, viewer, author):
        return False
    profile = db.get(FitnessProfile, author)
    if profile is None or not profile.username:
        return False
    relation = relation_to(db, viewer, author)
    return can_view(profile.visibility or "friends", relation, is_close(db, viewer, author, relation))


def network(db: Session, me: int) -> set[int]:
    friends = db.query(Friendship).filter(
        Friendship.status == "accepted", or_(Friendship.user_low_id == me, Friendship.user_high_id == me)
    ).all()
    ids = {f.user_high_id if f.user_low_id == me else f.user_low_id for f in friends}
    mine = db.query(ChallengeMember.challenge_id).filter(ChallengeMember.user_id == me)
    ids |= {row.user_id for row in db.query(ChallengeMember.user_id).filter(ChallengeMember.challenge_id.in_(mine)).all()}
    ids.discard(me)
    blocked = {row.blocked_id for row in db.query(UserBlock.blocked_id).filter(UserBlock.blocker_id == me)}
    blocked |= {row.blocker_id for row in db.query(UserBlock.blocker_id).filter(UserBlock.blocked_id == me)}
    private = {
        row.user_id for row in db.query(FitnessProfile.user_id).filter(FitnessProfile.user_id.in_(ids), FitnessProfile.visibility == "private")
    }
    return (ids - blocked - private) | {me}


def workout_summary(db: Session, post: Post) -> dict | None:
    if post.session_id is None:
        return None
    session = db.get(WorkoutSession, post.session_id)
    if session is None:
        return None
    facts = session_facts(session)
    ranked = sorted(facts["exercises"], key=lambda e: -e["volume"])
    names = [e["name"] for e in ranked] + [c["name"] for c in facts["cardio"]]
    return {
        "session_id": session.id,
        "name": session.name,
        "minutes": round(facts["minutes"]),
        "volume_kg": round(facts["volume"], 1),
        "exercises": len(facts["exercises"]) + len(facts["cardio"]),
        "highlights": names[:3],
    }


def serialize(db: Session, posts: list[Post], me: int) -> list[dict]:
    ids = [p.id for p in posts]
    counts: dict[int, dict[str, int]] = {pid: {} for pid in ids}
    mine: dict[int, str] = {}
    comments: dict[int, int] = {}
    if ids:
        for row in db.query(PostReaction.post_id, PostReaction.kind, func.count()).filter(PostReaction.post_id.in_(ids)).group_by(PostReaction.post_id, PostReaction.kind):
            counts[row[0]][row[1]] = row[2]
        mine = dict(db.query(PostReaction.post_id, PostReaction.kind).filter(PostReaction.post_id.in_(ids), PostReaction.user_id == me).all())
        comments = dict(db.query(PostComment.post_id, func.count()).filter(PostComment.post_id.in_(ids)).group_by(PostComment.post_id).all())
    result = []
    for post in posts:
        user, profile = author_profile(db, post.user_id)
        result.append({
            "id": post.id,
            "author": {"username": profile.username if profile else None, "name": user.name},
            "created_at": post.created_at,
            "caption": post.caption,
            "activity": post.activity,
            "minutes": post.minutes,
            "performed_on": post.performed_on,
            "shared_kind": post.shared_kind,
            "shared": post.shared,
            "workout": workout_summary(db, post),
            "media": [media_out(m) for m in post.media],
            "reactions": counts.get(post.id, {}),
            "my_reaction": mine.get(post.id),
            "comment_count": comments.get(post.id, 0),
            "is_mine": post.user_id == me,
        })
    return result


def visible_post(db: Session, post_id: int, me: int) -> Post:
    post = db.get(Post, post_id)
    if post is None or not can_see(db, me, post.user_id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return post


@fitness_feed_router.post("/posts", response_model=PostSchema)
def create_post(data: PostCreateSchema, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    caption = (data.caption or "").strip() or None
    activity = (data.activity or "").strip() or None
    if len(set(data.media_ids)) != len(data.media_ids):
        raise HTTPException(status_code=422, detail="Foto repetida no post.")
    media = db.query(Media).filter(Media.id.in_(data.media_ids)).all() if data.media_ids else []
    if len(media) != len(data.media_ids) or any(m.user_id != me.user_id or m.kind != "post" or m.post_id is not None for m in media):
        raise HTTPException(status_code=422, detail="Alguma foto não pôde ser usada. Envie de novo.")
    share_ids = {"workout": data.share_workout_id, "plan": data.share_plan_id, "exercise": data.share_exercise_id}
    chosen = [kind for kind, value in share_ids.items() if value is not None]
    if len(chosen) > 1:
        raise HTTPException(status_code=422, detail="Compartilhe um item por vez.")
    shared_kind = chosen[0] if chosen else None
    shared = None
    if shared_kind:
        if data.session_id is not None or data.minutes is not None:
            raise HTTPException(status_code=422, detail="Um post não pode ser treino, check-in e compartilhamento ao mesmo tempo.")
        owner = db.get(User, me.user_id)
        shared = snapshot_for(db, owner, shared_kind, share_ids[shared_kind])
    minutes = data.minutes
    performed_on = None
    if minutes is not None:
        if data.session_id is not None:
            raise HTTPException(status_code=422, detail="O check-in manual é para treinos feitos fora do app.")
        if not activity:
            raise HTTPException(status_code=422, detail="Diga qual atividade você fez.")
        if not media:
            raise HTTPException(status_code=422, detail="O check-in precisa de pelo menos uma foto.")
        today = today_br()
        performed_on = data.performed_on or today
        if performed_on > today or performed_on < today - timedelta(days=CHECKIN_PAST_DAYS):
            raise HTTPException(status_code=422, detail="A data do check-in pode ser de hoje até 7 dias atrás.")
    if data.session_id is not None:
        session = db.get(WorkoutSession, data.session_id)
        if session is None or session.user_id != me.user_id or session.status != COMPLETED:
            raise HTTPException(status_code=404, detail="Treino não encontrado.")
        if db.query(Post.id).filter(Post.session_id == session.id).first():
            raise HTTPException(status_code=409, detail="Esse treino já foi publicado.")
        activity = None
    elif not (caption or media or activity or shared):
        raise HTTPException(status_code=422, detail="Escreva algo, escolha a atividade ou adicione uma foto.")
    post = Post(
        user_id=me.user_id,
        session_id=data.session_id,
        caption=caption,
        activity=activity,
        minutes=minutes,
        performed_on=performed_on,
        shared_kind=shared_kind,
        shared=shared,
    )
    db.add(post)
    db.flush()
    order = {media_id: index for index, media_id in enumerate(data.media_ids)}
    for item in media:
        item.post_id = post.id
        item.position = order[item.id]
    db.commit()
    db.refresh(post)
    return serialize(db, [post], me.user_id)[0]


POSTABLE_DAYS = 30
POSTABLE_LIMIT = 20


@fitness_feed_router.get("/posts/postable-sessions", response_model=list[PostableSessionSchema])
def postable_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=POSTABLE_DAYS)
    posted = db.query(Post.session_id).filter(Post.user_id == user.id, Post.session_id.isnot(None))
    sessions = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == COMPLETED,
            WorkoutSession.started_at >= since,
            WorkoutSession.id.notin_(posted),
        )
        .order_by(WorkoutSession.started_at.desc())
        .limit(POSTABLE_LIMIT)
        .all()
    )
    result = []
    for session in sessions:
        facts = session_facts(session)
        result.append({
            "id": session.id,
            "name": session.name,
            "date": to_br_date(session.started_at),
            "minutes": round(facts["minutes"]),
            "exercises": len(facts["exercises"]) + len(facts["cardio"]),
            "volume_kg": round(facts["volume"], 1),
        })
    return result


@fitness_feed_router.get("/feed", response_model=FeedSchema)
def get_feed(
    before: int | None = Query(default=None),
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    query = db.query(Post).filter(Post.user_id.in_(network(db, me.user_id)))
    if before is not None:
        query = query.filter(Post.id < before)
    posts = query.order_by(Post.id.desc()).limit(PAGE_SIZE + 1).all()
    more = len(posts) > PAGE_SIZE
    posts = posts[:PAGE_SIZE]
    return {"posts": serialize(db, posts, me.user_id), "next_before": posts[-1].id if more else None}


@fitness_feed_router.get("/users/{username}/posts", response_model=FeedSchema)
def get_user_posts(
    username: str,
    before: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(FitnessProfile).filter(FitnessProfile.username == username.lower().lstrip("@")).first()
    if profile is None or not can_see(db, user.id, profile.user_id):
        return {"posts": [], "next_before": None}
    query = db.query(Post).filter(Post.user_id == profile.user_id)
    if before is not None:
        query = query.filter(Post.id < before)
    posts = query.order_by(Post.id.desc()).limit(PAGE_SIZE + 1).all()
    more = len(posts) > PAGE_SIZE
    posts = posts[:PAGE_SIZE]
    return {"posts": serialize(db, posts, user.id), "next_before": posts[-1].id if more else None}


def comment_out(db: Session, comment: PostComment, post: Post, me: int) -> dict:
    user, profile = author_profile(db, comment.user_id)
    return {
        "id": comment.id,
        "author": {"username": profile.username if profile else None, "name": user.name},
        "text": comment.text,
        "created_at": comment.created_at,
        "can_delete": me in (comment.user_id, post.user_id),
    }


@fitness_feed_router.get("/posts/{post_id}", response_model=PostDetailSchema)
def get_post(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, user.id)
    comments = db.query(PostComment).filter(PostComment.post_id == post.id).order_by(PostComment.id).all()
    visible = [c for c in comments if not has_blocked(db, user.id, c.user_id) and not has_blocked(db, c.user_id, user.id)]
    return {**serialize(db, [post], user.id)[0], "comments": [comment_out(db, c, post, user.id) for c in visible]}


def workout_detail(db: Session, session: WorkoutSession, viewer_id: int) -> dict:
    detail = serialize_session(session, db)
    mine = session.user_id == viewer_id
    if not mine:
        for item in detail["exercises"]:
            item.update(note=None, previous=[], previous_at=None, previous_note=None, previous_scope=None, history=[])
    owner, profile = author_profile(db, session.user_id)
    day = to_br_date(session.started_at)
    records = weight_records(completed_facts(owner, db, None, day), lambda s: s["id"] == session.id)
    muscle_sets: dict[str, float] = {}
    for e in session_facts(session)["exercises"]:
        for muscle, credit in muscle_credit(e["muscles"]).items():
            muscle_sets[muscle] = muscle_sets.get(muscle, 0.0) + credit * e["sets"]
    return {
        "author": {"username": profile.username if profile else None, "name": owner.name},
        "is_mine": mine,
        "muscle_sets": [{"muscle": m, "sets": round(v, 2)} for m, v in sorted(muscle_sets.items(), key=lambda kv: -kv[1])],
        "session": detail,
        "records": [
            {"name": r["name"], "weight_kg": r["weight_kg"], "reps": r["reps"], "previous_kg": r["previous_kg"]}
            for r in records
        ],
    }


@fitness_feed_router.get("/posts/{post_id}/workout", response_model=PostWorkoutDetailSchema)
def get_post_workout(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, user.id)
    session = db.get(WorkoutSession, post.session_id) if post.session_id else None
    if session is None:
        raise HTTPException(status_code=404, detail="Esse post não tem treino vinculado.")
    return workout_detail(db, session, user.id)


@fitness_feed_router.post("/posts/{post_id}/copy-workout", response_model=CopiedWorkoutSchema)
def copy_post_workout(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, user.id)
    session = db.get(WorkoutSession, post.session_id) if post.session_id else None
    if session is None:
        raise HTTPException(status_code=404, detail="Esse post não tem treino vinculado.")
    items = [item for item in session.exercises if item.sets]
    exercises, cardio = [], []
    for item in items:
        if item.tracking == "cardio":
            seconds = sum(entry.duration_seconds or 0 for entry in item.sets)
            cardio.append({
                "exercise_id": item.exercise_id,
                "phase": item.phase or "end",
                "minutes": min(300, max(1, round(seconds / 60) or (item.reps_min or 10))),
            })
            continue
        reps_min = min(600, max(1, item.reps_min or 10))
        exercises.append({
            "exercise_id": item.exercise_id,
            "target_sets": min(20, max(1, series_count(item.sets) or item.target_sets or 3)),
            "reps_min": reps_min,
            "reps_max": item.reps_max if item.reps_max and item.reps_max >= reps_min else None,
            "rest_seconds": item.rest_seconds,
            "unilateral": item.unilateral,
            "load_mode": item.load_mode,
            "superset": item.superset,
            "set_plan": item.set_plan,
        })
    owner = db.get(User, post.user_id)
    mine = post.user_id == user.id
    name = session.name if mine else f"{session.name} ({owner.name.split(' ')[0]})"
    description = None if mine else f"Copiada do treino de {owner.name} em {to_br_date(session.started_at).strftime('%d/%m/%Y')}."
    workout, skipped = build_copy(db, user, {"exercises": exercises[:40], "cardio": cardio[:6]}, name, description, owner)
    if workout is None:
        raise HTTPException(status_code=422, detail="Nenhum exercício desse treino pode ser copiado.")
    db.commit()
    return {"workout_id": workout.id, "name": workout.name, "skipped": skipped}


@fitness_feed_router.delete("/posts/{post_id}", status_code=204)
def delete_post(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if post is None or post.user_id != user.id:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    delete_files(list(post.media))
    for item in list(post.media):
        db.delete(item)
    db.query(Notification).filter(Notification.post_id == post.id).delete(synchronize_session=False)
    db.query(PostReaction).filter(PostReaction.post_id == post.id).delete()
    db.query(PostComment).filter(PostComment.post_id == post.id).delete()
    db.delete(post)
    db.commit()


@fitness_feed_router.put("/posts/{post_id}/reaction", response_model=PostSchema)
def react(post_id: int, data: ReactionSchema, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, me.user_id)
    reaction = db.get(PostReaction, (post.id, me.user_id))
    if reaction is None:
        db.add(PostReaction(post_id=post.id, user_id=me.user_id, kind=data.kind))
    else:
        reaction.kind = data.kind
    renotify(db, post.user_id, me.user_id, "post_reaction", post_id=post.id, detail=data.kind)
    db.commit()
    return serialize(db, [post], me.user_id)[0]


@fitness_feed_router.delete("/posts/{post_id}/reaction", response_model=PostSchema)
def unreact(post_id: int, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, me.user_id)
    db.query(PostReaction).filter(PostReaction.post_id == post.id, PostReaction.user_id == me.user_id).delete()
    clear(db, post.user_id, me.user_id, "post_reaction", post_id=post.id)
    db.commit()
    return serialize(db, [post], me.user_id)[0]


@fitness_feed_router.post("/posts/{post_id}/comments", response_model=CommentSchema)
def add_comment(post_id: int, data: CommentCreateSchema, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, me.user_id)
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Escreva um comentário.")
    comment = PostComment(post_id=post.id, user_id=me.user_id, text=text)
    db.add(comment)
    db.flush()
    if post.user_id != me.user_id:
        notify(db, post.user_id, me.user_id, "post_comment", post_id=post.id, comment_id=comment.id)
    db.commit()
    return comment_out(db, comment, post, me.user_id)


@fitness_feed_router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.get(PostComment, comment_id)
    post = db.get(Post, comment.post_id) if comment else None
    if comment is None or user.id not in (comment.user_id, post.user_id):
        raise HTTPException(status_code=404, detail="Comentário não encontrado.")
    db.query(Notification).filter(Notification.comment_id == comment.id).delete(synchronize_session=False)
    db.delete(comment)
    db.commit()


@fitness_feed_router.post("/posts/{post_id}/report", status_code=201)
def report_post(post_id: int, data: PostReportSchema, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, me.user_id)
    if post.user_id == me.user_id:
        raise HTTPException(status_code=422, detail="Você não pode denunciar o próprio post.")
    db.add(UserReport(
        reporter_id=me.user_id,
        reported_id=post.user_id,
        reason=data.reason,
        details=(data.details or "").strip() or None,
        post_id=post.id,
    ))
    db.commit()
    return {"message": "Denúncia enviada. Obrigado por avisar."}


@fitness_feed_router.post("/posts/{post_id}/copy-shared", response_model=CopiedSharedSchema)
def copy_post_shared(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = visible_post(db, post_id, user.id)
    if not post.shared_kind or not post.shared:
        raise HTTPException(status_code=404, detail="Esse post não tem ficha nem plano.")
    return copy_snapshot(db, user, post.shared_kind, post.shared, db.get(User, post.user_id))
