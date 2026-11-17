from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.fitness_models import Plan, PlanDay, Workout
from app.fitness_schemas import PlanSchema, PlanResponseSchema
from .auth import get_current_user
from .fitness_sessions import aware

fitness_plans_router = APIRouter(prefix="/fitness", tags=["fitness"])


def workout_muscles(workout: Workout) -> list[str]:
    groups: list[str] = []
    for item in workout.exercises:
        if item.exercise.muscle_group not in groups:
            groups.append(item.exercise.muscle_group)
    return groups


def serialize_plan(plan: Plan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "is_active": plan.is_active,
        "days": [
            {
                "weekday": day.weekday,
                "workout_id": day.workout_id,
                "workout_name": day.workout.name,
                "exercise_count": len(day.workout.exercises),
                "total_sets": sum(item.target_sets for item in day.workout.exercises),
                "muscle_groups": workout_muscles(day.workout),
            }
            for day in plan.days
        ],
        "updated_at": aware(plan.updated_at),
    }


def active_plan(user: User, db: Session) -> Plan | None:
    return db.query(Plan).filter(Plan.user_id == user.id, Plan.is_active.is_(True)).first()


def get_own_plan(plan_id: int, user: User, db: Session) -> Plan:
    plan = db.query(Plan).filter(Plan.id == plan_id, Plan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return plan


def build_days(data: PlanSchema, user: User, db: Session) -> list[PlanDay]:
    ids = {day.workout_id for day in data.days}
    owned = {
        workout.id
        for workout in db.query(Workout).filter(Workout.id.in_(ids), Workout.user_id == user.id)
    } if ids else set()
    if ids - owned:
        raise HTTPException(status_code=404, detail="Ficha não encontrada")
    days: list[PlanDay] = []
    seen: set[tuple[int, int]] = set()
    for day in data.days:
        key = (day.weekday, day.workout_id)
        if key in seen:
            continue
        seen.add(key)
        position = sum(1 for d in days if d.weekday == day.weekday)
        days.append(PlanDay(weekday=day.weekday, workout_id=day.workout_id, position=position))
    return days


def set_active(plan: Plan, active: bool, user: User, db: Session):
    if active:
        db.query(Plan).filter(Plan.user_id == user.id, Plan.id != plan.id, Plan.is_active.is_(True)).update(
            {Plan.is_active: False}, synchronize_session=False
        )
        db.flush()
    plan.is_active = active


def save(plan: Plan, db: Session) -> dict:
    db.commit()
    db.refresh(plan)
    return serialize_plan(plan)


@fitness_plans_router.get("/plans", response_model=list[PlanResponseSchema])
def list_plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plans = (
        db.query(Plan)
        .filter(Plan.user_id == user.id)
        .order_by(Plan.is_active.desc(), Plan.updated_at.desc(), Plan.id.desc())
        .all()
    )
    return [serialize_plan(plan) for plan in plans]


@fitness_plans_router.post("/plans", response_model=PlanResponseSchema)
def create_plan(data: PlanSchema, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(Plan).filter(Plan.user_id == user.id).count() >= 20:
        raise HTTPException(status_code=400, detail="Você pode ter no máximo 20 planos.")
    plan = Plan(user_id=user.id, name=data.name, is_active=False, days=build_days(data, user, db))
    db.add(plan)
    db.flush()
    activate = data.is_active if data.is_active is not None else active_plan(user, db) is None
    set_active(plan, activate, user, db)
    return save(plan, db)


@fitness_plans_router.get("/plans/{plan_id}", response_model=PlanResponseSchema)
def get_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_plan(get_own_plan(plan_id, user, db))


@fitness_plans_router.put("/plans/{plan_id}", response_model=PlanResponseSchema)
def update_plan(
    plan_id: int,
    data: PlanSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = get_own_plan(plan_id, user, db)
    days = build_days(data, user, db)
    plan.name = data.name
    plan.days = []
    db.flush()
    plan.days = days
    if data.is_active is not None:
        set_active(plan, data.is_active, user, db)
    return save(plan, db)


@fitness_plans_router.post("/plans/{plan_id}/activate", response_model=PlanResponseSchema)
def activate_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = get_own_plan(plan_id, user, db)
    set_active(plan, True, user, db)
    return save(plan, db)


@fitness_plans_router.post("/plans/{plan_id}/deactivate", response_model=PlanResponseSchema)
def deactivate_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = get_own_plan(plan_id, user, db)
    set_active(plan, False, user, db)
    return save(plan, db)


@fitness_plans_router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_plan(plan_id, user, db))
    db.commit()
    return {"message": "Plano excluído"}
