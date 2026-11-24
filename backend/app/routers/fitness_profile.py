import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import FitnessProfile
from app.fitness_schemas import (
    FitnessProfileResponseSchema,
    FitnessProfileSchema,
    UsernameAvailabilitySchema,
    ShareWeightSchema,
    UsernameUpdateSchema,
    VisibilityUpdateSchema,
)
from .auth import get_current_user

fitness_profile_router = APIRouter(prefix="/fitness", tags=["fitness"])

USERNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9_]|\.(?!\.))*[a-z0-9_]$")
RESERVED_USERNAMES = {
    "admin", "administrador", "api", "apps", "conta", "gym", "gymgoals", "goals",
    "help", "login", "me", "perfil", "profile", "root", "settings", "social", "suporte", "support",
}
TAKEN_MESSAGE = "Esse username já está em uso."


def normalize_username(value: str) -> str:
    return value.strip().lstrip("@").lower()


def username_problem(username: str) -> str | None:
    if len(username) < 3:
        return "Use pelo menos 3 caracteres."
    if len(username) > 20:
        return "Use no máximo 20 caracteres."
    if not USERNAME_PATTERN.match(username):
        return "Use só letras minúsculas, números, ponto e _, sem começar com ponto ou _ e sem terminar com ponto."
    if username in RESERVED_USERNAMES:
        return "Esse username é reservado."
    return None


def username_taken(db: Session, username: str, user_id: int) -> bool:
    owner = db.scalar(
        select(FitnessProfile.user_id).where(func.lower(FitnessProfile.username) == username)
    )
    return owner is not None and owner != user_id


def profile_response(profile: FitnessProfile | None) -> dict:
    if profile is None:
        return {"body_type": "male", "username": None, "visibility": "friends", "share_weight_close": False, "share_gym": False, "share_live": True}
    return {
        "body_type": profile.body_type,
        "username": profile.username,
        "visibility": profile.visibility or "friends",
        "share_weight_close": bool(profile.share_weight_close),
        "share_gym": bool(profile.share_gym),
        "share_live": profile.share_live is not False,
    }


def get_or_create_profile(db: Session, user: User) -> FitnessProfile:
    profile = db.get(FitnessProfile, user.id)
    if profile is None:
        profile = FitnessProfile(user_id=user.id, body_type="male", visibility="friends")
        db.add(profile)
    return profile


@fitness_profile_router.get("/profile", response_model=FitnessProfileResponseSchema)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_response(db.get(FitnessProfile, user.id))


@fitness_profile_router.put("/profile", response_model=FitnessProfileResponseSchema)
def update_profile(
    data: FitnessProfileSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    profile.body_type = data.body_type
    db.commit()
    return profile_response(profile)


@fitness_profile_router.get("/profile/username-available", response_model=UsernameAvailabilitySchema)
def check_username(
    username: str = Query(max_length=40),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized = normalize_username(username)
    problem = username_problem(normalized)
    if problem is None and username_taken(db, normalized, user.id):
        problem = TAKEN_MESSAGE
    return {"username": normalized, "available": problem is None, "reason": problem}


@fitness_profile_router.put("/profile/username", response_model=FitnessProfileResponseSchema)
def update_username(
    data: UsernameUpdateSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    username = normalize_username(data.username)
    problem = username_problem(username)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if username_taken(db, username, user.id):
        raise HTTPException(status_code=409, detail=TAKEN_MESSAGE)
    profile = get_or_create_profile(db, user)
    profile.username = username
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=TAKEN_MESSAGE)
    return profile_response(profile)


@fitness_profile_router.put("/profile/visibility", response_model=FitnessProfileResponseSchema)
def update_visibility(
    data: VisibilityUpdateSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    profile.visibility = data.visibility
    db.commit()
    return profile_response(profile)


@fitness_profile_router.put("/profile/close-weight", response_model=FitnessProfileResponseSchema)
def update_close_weight(
    data: ShareWeightSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    profile.share_weight_close = data.share
    db.commit()
    return profile_response(profile)


@fitness_profile_router.put("/profile/share-gym", response_model=FitnessProfileResponseSchema)
def update_share_gym(
    data: ShareWeightSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    profile.share_gym = data.share
    db.commit()
    return profile_response(profile)


@fitness_profile_router.put("/profile/share-live", response_model=FitnessProfileResponseSchema)
def update_share_live(
    data: ShareWeightSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    profile.share_live = data.share
    db.commit()
    return profile_response(profile)
