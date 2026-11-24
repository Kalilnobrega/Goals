from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import Exercise, ExerciseGymLink, ExerciseGymSetting, FitnessProfile, Gym, WorkoutSession
from app.fitness_gyms import default_specific
from app.fitness_schemas import CurrentGymSchema, ExerciseGymSettingSchema, GymCreateSchema, GymListSchema, GymRenameSchema
from .auth import get_current_user
from .fitness import visible_exercises

fitness_gyms_router = APIRouter(prefix="/fitness", tags=["fitness"])


def profile_of(db: Session, user: User) -> FitnessProfile:
    profile = db.get(FitnessProfile, user.id)
    if profile is None:
        profile = FitnessProfile(user_id=user.id, body_type="male")
        db.add(profile)
        db.flush()
    return profile


def own_gym(db: Session, user: User, gym_id: int) -> Gym:
    gym = db.get(Gym, gym_id)
    if gym is None or gym.user_id != user.id:
        raise HTTPException(status_code=404, detail="Academia não encontrada.")
    return gym


def gym_list(db: Session, user: User) -> dict:
    counts = dict(
        db.query(WorkoutSession.gym_id, func.count(WorkoutSession.id))
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.gym_id.isnot(None))
        .group_by(WorkoutSession.gym_id)
        .all()
    )
    profile = db.get(FitnessProfile, user.id)
    current = profile.current_gym_id if profile else None
    gyms = db.query(Gym).filter(Gym.user_id == user.id).order_by(Gym.created_at, Gym.id).all()
    return {
        "current_gym_id": current,
        "gyms": [{"id": g.id, "name": g.name, "sessions": counts.get(g.id, 0), "current": g.id == current} for g in gyms],
    }


@fitness_gyms_router.get("/gyms", response_model=GymListSchema)
def list_gyms(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return gym_list(db, user)


@fitness_gyms_router.post("/gyms", response_model=GymListSchema)
def create_gym(data: GymCreateSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(Gym.id).filter(Gym.user_id == user.id, func.lower(Gym.name) == data.name.lower()).first():
        raise HTTPException(status_code=409, detail="Você já tem uma academia com esse nome.")
    first = db.query(Gym.id).filter(Gym.user_id == user.id).first() is None
    gym = Gym(user_id=user.id, name=data.name)
    db.add(gym)
    db.flush()
    if first:
        db.query(WorkoutSession).filter(WorkoutSession.user_id == user.id, WorkoutSession.gym_id.is_(None)).update(
            {WorkoutSession.gym_id: gym.id}, synchronize_session=False
        )
    if first or data.make_current:
        profile_of(db, user).current_gym_id = gym.id
    db.commit()
    return gym_list(db, user)


@fitness_gyms_router.patch("/gyms/{gym_id}", response_model=GymListSchema)
def rename_gym(gym_id: int, data: GymRenameSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    gym = own_gym(db, user, gym_id)
    clash = db.query(Gym.id).filter(Gym.user_id == user.id, Gym.id != gym.id, func.lower(Gym.name) == data.name.lower()).first()
    if clash:
        raise HTTPException(status_code=409, detail="Você já tem uma academia com esse nome.")
    gym.name = data.name
    db.commit()
    return gym_list(db, user)


@fitness_gyms_router.delete("/gyms/{gym_id}", response_model=GymListSchema)
def delete_gym(gym_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    gym = own_gym(db, user, gym_id)
    if db.query(WorkoutSession.id).filter(WorkoutSession.gym_id == gym.id).first():
        raise HTTPException(status_code=409, detail="Essa academia tem treinos registrados. Renomeie em vez de excluir.")
    profile = db.get(FitnessProfile, user.id)
    if profile and profile.current_gym_id == gym.id:
        other = db.query(Gym).filter(Gym.user_id == user.id, Gym.id != gym.id).order_by(Gym.created_at).first()
        profile.current_gym_id = other.id if other else None
    db.delete(gym)
    db.commit()
    return gym_list(db, user)


@fitness_gyms_router.put("/gyms/current", response_model=GymListSchema)
def set_current_gym(data: CurrentGymSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    gym = own_gym(db, user, data.gym_id)
    profile_of(db, user).current_gym_id = gym.id
    db.commit()
    return gym_list(db, user)


@fitness_gyms_router.put("/exercises/{exercise_id}/gym-setting", response_model=ExerciseGymSettingSchema)
def set_exercise_gym_setting(
    exercise_id: int,
    data: ExerciseGymSettingSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exercise = visible_exercises(user, db).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercício não encontrado.")
    mine = {gym_id for (gym_id,) in db.query(Gym.id).filter(Gym.user_id == user.id)}
    wanted = data.gym_specific
    links: set[int] = set()
    if data.shared_gym_ids is not None:
        links = set(data.shared_gym_ids)
        if not links <= mine:
            raise HTTPException(status_code=404, detail="Academia não encontrada.")
        if len(links) < 2:
            raise HTTPException(status_code=422, detail="Marque pelo menos duas academias com o mesmo aparelho.")
        if links == mine:
            wanted, links = False, set()
        else:
            wanted = True
    db.query(ExerciseGymLink).filter(ExerciseGymLink.user_id == user.id, ExerciseGymLink.exercise_id == exercise.id).delete()
    db.add_all(ExerciseGymLink(user_id=user.id, exercise_id=exercise.id, gym_id=gym_id) for gym_id in links)
    setting = db.get(ExerciseGymSetting, (user.id, exercise.id))
    default = default_specific(exercise.equipment)
    if wanted is None or wanted == default:
        if setting is not None:
            db.delete(setting)
    elif setting is None:
        db.add(ExerciseGymSetting(user_id=user.id, exercise_id=exercise.id, gym_specific=wanted))
    else:
        setting.gym_specific = wanted
    db.commit()
    value = default if wanted is None else wanted
    return {"gym_specific": value, "shared_gym_ids": sorted(links)}
