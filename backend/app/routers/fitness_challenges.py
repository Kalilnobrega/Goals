import secrets
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br
from app.models import User
from app.fitness_models import Challenge, ChallengeInvite, ChallengeMember, Exercise, FitnessProfile, Friendship
from app.fitness_schemas import (
    ChallengeCreateSchema,
    ChallengeDetailSchema,
    ChallengeInviteSchema,
    ChallengeListsSchema,
    ChallengePreviewSchema,
)
from .auth import get_current_user
from .fitness_social import own_profile, find_profile, friendship_between, has_blocked
from .fitness_stats import completed_facts

fitness_challenges_router = APIRouter(prefix="/fitness/challenges", tags=["fitness"])

NOT_FOUND = "Desafio não encontrado."
MAX_DAYS = 366
MAX_PAST_START_DAYS = 7
MAX_MEMBERS = 100


def metric_id(metric: dict) -> str:
    if metric["key"] == "exercise":
        base = f"exercise:{metric['exercise_id']}:{metric['measure']}"
        return f"{base}:family" if metric.get("scope") == "family" else base
    return metric["key"]


def status_of(challenge: Challenge, today) -> str:
    if today < challenge.start_date:
        return "upcoming"
    if today > challenge.end_date:
        return "finished"
    return "active"


def exercise_info(db: Session, challenge: Challenge) -> dict[int, tuple[str, str | None]]:
    ids = [m["exercise_id"] for m in challenge.metrics if m.get("exercise_id")]
    if not ids:
        return {}
    rows = db.query(Exercise.id, Exercise.name, Exercise.family).filter(Exercise.id.in_(ids)).all()
    return {row.id: (row.name, row.family) for row in rows}


def metrics_out(db: Session, challenge: Challenge) -> list[dict]:
    info = exercise_info(db, challenge)
    result = []
    for metric in challenge.metrics:
        name, family = info.get(metric.get("exercise_id"), (None, None))
        result.append({**metric, "id": metric_id(metric), "exercise_name": name, "family": family})
    return result


def family_members(db: Session, challenge: Challenge) -> dict[str, set[int]]:
    info = exercise_info(db, challenge)
    targets = {}
    for metric in challenge.metrics:
        if metric["key"] != "exercise":
            continue
        ids = {metric["exercise_id"]}
        family = info.get(metric["exercise_id"], (None, None))[1]
        if metric.get("scope") == "family" and family:
            ids |= {
                row.id for row in db.query(Exercise.id).filter(Exercise.family == family, Exercise.user_id.is_(None)).all()
            }
        targets[metric_id(metric)] = ids
    return targets


def qualifies(session: dict, rule: dict | None) -> bool:
    if not rule or rule.get("kind", "none") == "none":
        return True
    if rule["kind"] == "minutes":
        return session["minutes"] >= rule["value"]
    return len(session["exercises"]) + len(session["cardio"]) >= rule["value"]


def metric_value(metric: dict, sessions: list[dict], targets: dict[str, set[int]] | None = None) -> float:
    key = metric["key"]
    if key == "days":
        return float(len({s["day"] for s in sessions}))
    if key == "workouts":
        return float(len(sessions))
    if key == "minutes":
        return round(sum(s["minutes"] for s in sessions), 1)
    if key == "volume":
        return round(sum(s["volume"] for s in sessions), 1)
    if key == "cardio_minutes":
        return round(sum(c["duration"] for s in sessions for c in s["cardio"]) / 60, 1)
    if key == "cardio_km":
        return round(sum(c.get("km") or 0 for s in sessions for c in s["cardio"]), 2)
    if key == "cardio_kcal":
        return float(round(sum(c.get("calories") or 0 for s in sessions for c in s["cardio"])))
    ids = (targets or {}).get(metric_id(metric), {metric["exercise_id"]})
    entries = [e for s in sessions for e in s["exercises"] if e["exercise_id"] in ids]
    if metric["measure"] == "reps":
        return float(sum(e["reps"] for e in entries))
    if metric["measure"] == "volume":
        return round(sum(e["volume"] for e in entries), 1)
    return max((e["top_weight"] for e in entries), default=0.0)


def ranking(db: Session, challenge: Challenge, me: int) -> list[dict]:
    targets = family_members(db, challenge)
    rows = []
    for member in challenge.members:
        user = db.get(User, member.user_id)
        profile = db.get(FitnessProfile, member.user_id)
        sessions = [
            s for s in completed_facts(user, db, challenge.start_date, challenge.end_date)
            if qualifies(s, challenge.min_rule)
        ]
        values = {metric_id(metric): metric_value(metric, sessions, targets) for metric in challenge.metrics}
        rows.append({
            "user_id": user.id,
            "username": profile.username if profile else None,
            "name": user.name,
            "values": values,
            "is_me": user.id == me,
        })
    metrics = challenge.metrics
    if len(metrics) == 1:
        only = metric_id(metrics[0])
        for row in rows:
            row["score"] = row["values"][only]
    else:
        leaders = {metric_id(m): max((row["values"][metric_id(m)] for row in rows), default=0) for m in metrics}
        for row in rows:
            row["score"] = round(sum(
                (row["values"][metric_id(m)] / leaders[metric_id(m)] * 100 * m.get("weight", 1)) if leaders[metric_id(m)] else 0
                for m in metrics
            ), 1)
    rows.sort(key=lambda row: (-row["score"], row["name"].lower()))
    position = 0
    previous = None
    for index, row in enumerate(rows, start=1):
        if row["score"] != previous:
            position = index
            previous = row["score"]
        row["position"] = position
    return rows


def member_ids(challenge: Challenge) -> set[int]:
    return {member.user_id for member in challenge.members}


def get_member_challenge(db: Session, challenge_id: int, user_id: int) -> Challenge:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None or user_id not in member_ids(challenge):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return challenge


def get_owned_challenge(db: Session, challenge_id: int, user_id: int) -> Challenge:
    challenge = get_member_challenge(db, challenge_id, user_id)
    if challenge.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Só quem criou o desafio pode fazer isso.")
    return challenge


def preview(db: Session, challenge: Challenge, user_id: int) -> dict:
    owner = db.get(User, challenge.owner_id)
    return {
        "id": challenge.id,
        "code": challenge.invite_code,
        "name": challenge.name,
        "description": challenge.description,
        "start_date": challenge.start_date,
        "end_date": challenge.end_date,
        "status": status_of(challenge, today_br()),
        "owner_name": owner.name,
        "member_count": len(challenge.members),
        "metrics": metrics_out(db, challenge),
        "min_rule": challenge.min_rule or {"kind": "none", "value": None},
        "is_member": user_id in member_ids(challenge),
    }


def join(db: Session, challenge: Challenge, user_id: int) -> None:
    if status_of(challenge, today_br()) == "finished":
        raise HTTPException(status_code=409, detail="Esse desafio já terminou.")
    if user_id not in member_ids(challenge):
        if len(challenge.members) >= MAX_MEMBERS:
            raise HTTPException(status_code=409, detail="Esse desafio já está cheio.")
        db.add(ChallengeMember(challenge_id=challenge.id, user_id=user_id))
    db.query(ChallengeInvite).filter(
        ChallengeInvite.challenge_id == challenge.id, ChallengeInvite.user_id == user_id
    ).delete()
    db.commit()


@fitness_challenges_router.post("", response_model=ChallengeDetailSchema)
def create_challenge(
    data: ChallengeCreateSchema,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    today = today_br()
    if data.end_date < data.start_date:
        raise HTTPException(status_code=422, detail="O fim precisa ser depois do início.")
    if data.start_date < today - timedelta(days=MAX_PAST_START_DAYS):
        raise HTTPException(status_code=422, detail="O início pode ser no máximo 7 dias atrás.")
    if data.end_date < today:
        raise HTTPException(status_code=422, detail="O fim não pode ser no passado.")
    if (data.end_date - data.start_date).days + 1 > MAX_DAYS:
        raise HTTPException(status_code=422, detail="O desafio pode durar no máximo um ano.")
    metrics = [metric.model_dump() for metric in data.metrics]
    if len({metric_id(m) for m in metrics}) != len(metrics):
        raise HTTPException(status_code=422, detail="Cada métrica só pode aparecer uma vez.")
    for metric in metrics:
        if metric["key"] != "exercise":
            continue
        exercise = db.get(Exercise, metric["exercise_id"])
        if exercise is None or exercise.user_id is not None or (exercise.tracking or "reps") != "reps":
            raise HTTPException(status_code=422, detail="Escolha um exercício de musculação da biblioteca padrão.")
        if metric["scope"] == "family" and not exercise.family:
            raise HTTPException(status_code=422, detail="Esse exercício não tem variações. Use só o exercício escolhido.")
    challenge = Challenge(
        owner_id=me.user_id,
        name=data.name,
        description=(data.description or "").strip() or None,
        start_date=data.start_date,
        end_date=data.end_date,
        metrics=metrics,
        min_rule=data.min_rule.model_dump(),
        invite_code=secrets.token_urlsafe(9)[:12],
    )
    db.add(challenge)
    db.flush()
    db.add(ChallengeMember(challenge_id=challenge.id, user_id=me.user_id))
    db.commit()
    db.refresh(challenge)
    return detail(db, challenge, me.user_id)


@fitness_challenges_router.get("", response_model=ChallengeListsSchema)
def list_challenges(me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    today = today_br()
    challenges = (
        db.query(Challenge)
        .join(ChallengeMember, ChallengeMember.challenge_id == Challenge.id)
        .filter(ChallengeMember.user_id == me.user_id)
        .order_by(Challenge.start_date.desc(), Challenge.id.desc())
        .all()
    )
    result = {"active": [], "upcoming": [], "finished": [], "invites": []}
    for challenge in challenges:
        status = status_of(challenge, today)
        summary = {
            "id": challenge.id,
            "name": challenge.name,
            "start_date": challenge.start_date,
            "end_date": challenge.end_date,
            "status": status,
            "member_count": len(challenge.members),
            "metrics": metrics_out(db, challenge),
        }
        if status != "upcoming":
            rows = ranking(db, challenge, me.user_id)
            mine = next(row for row in rows if row["is_me"])
            summary.update(my_position=mine["position"], my_score=mine["score"], leader_name=rows[0]["name"])
        result[status].append(summary)
    result["active"].sort(key=lambda c: c["end_date"])
    result["upcoming"].sort(key=lambda c: c["start_date"])
    invites = (
        db.query(Challenge)
        .join(ChallengeInvite, ChallengeInvite.challenge_id == Challenge.id)
        .filter(ChallengeInvite.user_id == me.user_id, Challenge.end_date >= today)
        .order_by(ChallengeInvite.created_at.desc())
        .all()
    )
    result["invites"] = [preview(db, challenge, me.user_id) for challenge in invites]
    return result


def detail(db: Session, challenge: Challenge, user_id: int) -> dict:
    today = today_br()
    status = status_of(challenge, today)
    owner_profile = db.get(FitnessProfile, challenge.owner_id)
    if status == "upcoming":
        days_left = (challenge.start_date - today).days
    elif status == "active":
        days_left = (challenge.end_date - today).days
    else:
        days_left = 0
    rows = ranking(db, challenge, user_id)
    return {
        "id": challenge.id,
        "name": challenge.name,
        "description": challenge.description,
        "start_date": challenge.start_date,
        "end_date": challenge.end_date,
        "status": status,
        "days_left": days_left,
        "metrics": metrics_out(db, challenge),
        "min_rule": challenge.min_rule or {"kind": "none", "value": None},
        "owner_username": owner_profile.username if owner_profile else None,
        "is_owner": challenge.owner_id == user_id,
        "invite_code": challenge.invite_code,
        "member_count": len(challenge.members),
        "ranking": [{key: row[key] for key in ("position", "username", "name", "score", "values", "is_me")} for row in rows],
    }


@fitness_challenges_router.get("/invite/{code}", response_model=ChallengePreviewSchema)
def get_invite(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    challenge = db.query(Challenge).filter(Challenge.invite_code == code).first()
    if challenge is None:
        raise HTTPException(status_code=404, detail="Convite inválido ou desafio excluído.")
    return preview(db, challenge, user.id)


@fitness_challenges_router.post("/invite/{code}/join", response_model=ChallengeDetailSchema)
def join_by_code(code: str, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    challenge = db.query(Challenge).filter(Challenge.invite_code == code).first()
    if challenge is None:
        raise HTTPException(status_code=404, detail="Convite inválido ou desafio excluído.")
    join(db, challenge, me.user_id)
    db.refresh(challenge)
    return detail(db, challenge, me.user_id)


@fitness_challenges_router.get("/{challenge_id}", response_model=ChallengeDetailSchema)
def get_challenge(challenge_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return detail(db, get_member_challenge(db, challenge_id, user.id), user.id)


@fitness_challenges_router.post("/{challenge_id}/invites", status_code=201)
def invite_friend(
    challenge_id: int,
    data: ChallengeInviteSchema,
    me: FitnessProfile = Depends(own_profile),
    db: Session = Depends(get_db),
):
    challenge = get_member_challenge(db, challenge_id, me.user_id)
    if status_of(challenge, today_br()) == "finished":
        raise HTTPException(status_code=409, detail="Esse desafio já terminou.")
    target = find_profile(db, data.username)
    if target is None or has_blocked(db, target.user_id, me.user_id) or has_blocked(db, me.user_id, target.user_id):
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    friendship = friendship_between(db, me.user_id, target.user_id)
    if friendship is None or friendship.status != "accepted":
        raise HTTPException(status_code=403, detail="Você só pode convidar amigos. Para outras pessoas, mande o link.")
    if target.user_id in member_ids(challenge):
        raise HTTPException(status_code=409, detail="Essa pessoa já está no desafio.")
    if db.get(ChallengeInvite, (challenge.id, target.user_id)) is None:
        db.add(ChallengeInvite(challenge_id=challenge.id, user_id=target.user_id, invited_by=me.user_id))
        db.commit()
    return {"message": "Convite enviado."}


@fitness_challenges_router.post("/{challenge_id}/join", response_model=ChallengeDetailSchema)
def accept_invite(challenge_id: int, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    challenge = db.get(Challenge, challenge_id)
    if challenge is None or db.get(ChallengeInvite, (challenge_id, me.user_id)) is None:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    join(db, challenge, me.user_id)
    db.refresh(challenge)
    return detail(db, challenge, me.user_id)


@fitness_challenges_router.delete("/{challenge_id}/invites/me", status_code=204)
def decline_invite(challenge_id: int, me: FitnessProfile = Depends(own_profile), db: Session = Depends(get_db)):
    db.query(ChallengeInvite).filter(
        ChallengeInvite.challenge_id == challenge_id, ChallengeInvite.user_id == me.user_id
    ).delete()
    db.commit()


@fitness_challenges_router.delete("/{challenge_id}/members/me", status_code=204)
def leave_challenge(challenge_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    challenge = get_member_challenge(db, challenge_id, user.id)
    if challenge.owner_id == user.id:
        raise HTTPException(status_code=409, detail="Quem criou o desafio não pode sair. Exclua o desafio se quiser encerrá-lo.")
    db.query(ChallengeMember).filter(
        ChallengeMember.challenge_id == challenge_id, ChallengeMember.user_id == user.id
    ).delete()
    db.commit()


@fitness_challenges_router.delete("/{challenge_id}/members/{username}", status_code=204)
def remove_member(
    challenge_id: int,
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    challenge = get_owned_challenge(db, challenge_id, user.id)
    target = find_profile(db, username)
    if target is None or target.user_id not in member_ids(challenge):
        raise HTTPException(status_code=404, detail="Essa pessoa não está no desafio.")
    if target.user_id == user.id:
        raise HTTPException(status_code=409, detail="Você não pode se remover do próprio desafio.")
    db.query(ChallengeMember).filter(
        ChallengeMember.challenge_id == challenge_id, ChallengeMember.user_id == target.user_id
    ).delete()
    db.commit()


@fitness_challenges_router.delete("/{challenge_id}", status_code=204)
def delete_challenge(challenge_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    challenge = get_owned_challenge(db, challenge_id, user.id)
    db.query(ChallengeInvite).filter(ChallengeInvite.challenge_id == challenge.id).delete()
    db.delete(challenge)
    db.commit()


@fitness_challenges_router.get("/pending/count")
def pending_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.get(FitnessProfile, user.id)
    if profile is None or not profile.username:
        return {"friend_requests": 0, "challenge_invites": 0}
    requests = (
        db.query(func.count(Friendship.id))
        .filter(
            Friendship.status == "pending",
            Friendship.requester_id != user.id,
            or_(Friendship.user_low_id == user.id, Friendship.user_high_id == user.id),
        )
        .scalar()
    )
    invites = (
        db.query(func.count(ChallengeInvite.challenge_id))
        .join(Challenge, Challenge.id == ChallengeInvite.challenge_id)
        .filter(ChallengeInvite.user_id == user.id, Challenge.end_date >= today_br())
        .scalar()
    )
    return {"friend_requests": requests, "challenge_invites": invites}
