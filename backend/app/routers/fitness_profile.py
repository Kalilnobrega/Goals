from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import FitnessProfile
from app.fitness_schemas import FitnessProfileSchema
from .auth import get_current_user

fitness_profile_router = APIRouter(prefix="/fitness", tags=["fitness"])


@fitness_profile_router.get("/profile", response_model=FitnessProfileSchema)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.get(FitnessProfile, user.id)
    return {"body_type": profile.body_type if profile else "male"}


@fitness_profile_router.put("/profile", response_model=FitnessProfileSchema)
def update_profile(
    data: FitnessProfileSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(FitnessProfile, user.id)
    if profile is None:
        profile = FitnessProfile(user_id=user.id)
        db.add(profile)
    profile.body_type = data.body_type
    db.commit()
    return {"body_type": profile.body_type}
