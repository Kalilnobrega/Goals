from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.schemas import (
    SuperGoalSchema,
    EditSuperGoalSchema,
    SuperGoalGoalsSchema,
    SuperGoalResponseSchema,
    ReorderSchema,
)
from app.database import get_db
from app.models import Goal, User, SuperGoal, SuperGoalItem
from app.access import member_goal_filter, sort_for_user
from .auth import get_current_user
from .tasks import apply_order
from typing import List

super_goals_router = APIRouter(prefix="/super-goals", tags=["super-goals"])


def visible_goal_ids(user_id: int, session: Session) -> list[int]:
    goals = session.query(Goal).filter(member_goal_filter(user_id)).all()
    return [goal.id for goal in sort_for_user(goals, user_id, session)]


def serialize(super_goal: SuperGoal, ordered_ids: list[int]) -> dict:
    inside = {item.goal_id for item in super_goal.items}
    return {
        "id": super_goal.id,
        "title": super_goal.title,
        "goal_ids": [goal_id for goal_id in ordered_ids if goal_id in inside],
    }


def get_own_super_goal(super_goal_id: int, user: User, session: Session) -> SuperGoal:
    super_goal = (
        session.query(SuperGoal)
        .filter(SuperGoal.id == super_goal_id, SuperGoal.user_id == user.id)
        .first()
    )
    if not super_goal:
        raise HTTPException(status_code=404, detail="Supermeta não encontrada")
    return super_goal


def add_goals(super_goal: SuperGoal, goal_ids: list[int], user: User, session: Session):
    if len(set(goal_ids)) != len(goal_ids):
        raise HTTPException(status_code=400, detail="Lista de metas inválida")
    allowed = set(visible_goal_ids(user.id, session))
    if any(goal_id not in allowed for goal_id in goal_ids):
        raise HTTPException(status_code=400, detail="Lista de metas inválida")

    existing = (
        session.query(SuperGoalItem)
        .filter(SuperGoalItem.user_id == user.id, SuperGoalItem.goal_id.in_(goal_ids))
        .all()
    )
    already_here = {item.goal_id for item in existing if item.super_goal_id == super_goal.id}
    for item in existing:
        if item.super_goal_id != super_goal.id:
            session.delete(item)
    session.flush()
    for goal_id in goal_ids:
        if goal_id not in already_here:
            super_goal.items.append(SuperGoalItem(goal_id=goal_id, user_id=user.id))


def ordered_super_goals(user_id: int, session: Session) -> list[SuperGoal]:
    return (
        session.query(SuperGoal)
        .filter(SuperGoal.user_id == user_id)
        .order_by(SuperGoal.position, SuperGoal.id)
        .all()
    )


@super_goals_router.get("/", response_model=List[SuperGoalResponseSchema])
async def list_super_goals(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    ordered_ids = visible_goal_ids(current_user.id, session)
    return [serialize(sg, ordered_ids) for sg in ordered_super_goals(current_user.id, session)]


@super_goals_router.post("/", response_model=SuperGoalResponseSchema)
async def create_super_goal(
    payload: SuperGoalSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    lowest = (
        session.query(func.min(SuperGoal.position))
        .filter(SuperGoal.user_id == current_user.id)
        .scalar()
    )
    super_goal = SuperGoal(
        user_id=current_user.id,
        title=payload.title,
        position=0 if lowest is None else lowest - 1,
    )
    session.add(super_goal)
    if payload.goal_ids:
        session.flush()
        add_goals(super_goal, payload.goal_ids, current_user, session)
    session.commit()
    session.refresh(super_goal)
    return serialize(super_goal, visible_goal_ids(current_user.id, session))


@super_goals_router.put("/order")
async def reorder_super_goals(
    payload: ReorderSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    apply_order(ordered_super_goals(current_user.id, session), payload.ids)
    session.commit()
    return {"message": "Ordem atualizada"}


@super_goals_router.get("/{super_goal_id}", response_model=SuperGoalResponseSchema)
async def get_super_goal(
    super_goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    super_goal = get_own_super_goal(super_goal_id, current_user, session)
    return serialize(super_goal, visible_goal_ids(current_user.id, session))


@super_goals_router.put("/{super_goal_id}", response_model=SuperGoalResponseSchema)
async def rename_super_goal(
    super_goal_id: int,
    payload: EditSuperGoalSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    super_goal = get_own_super_goal(super_goal_id, current_user, session)
    super_goal.title = payload.title
    session.commit()
    return serialize(super_goal, visible_goal_ids(current_user.id, session))


@super_goals_router.delete("/{super_goal_id}")
async def delete_super_goal(
    super_goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    session.delete(get_own_super_goal(super_goal_id, current_user, session))
    session.commit()
    return {"message": "Supermeta excluída"}


@super_goals_router.post("/{super_goal_id}/goals", response_model=SuperGoalResponseSchema)
async def add_goals_to_super_goal(
    super_goal_id: int,
    payload: SuperGoalGoalsSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    super_goal = get_own_super_goal(super_goal_id, current_user, session)
    add_goals(super_goal, payload.goal_ids, current_user, session)
    session.commit()
    session.refresh(super_goal)
    return serialize(super_goal, visible_goal_ids(current_user.id, session))


@super_goals_router.delete(
    "/{super_goal_id}/goals/{goal_id}", response_model=SuperGoalResponseSchema
)
async def remove_goal_from_super_goal(
    super_goal_id: int,
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    super_goal = get_own_super_goal(super_goal_id, current_user, session)
    item = next((item for item in super_goal.items if item.goal_id == goal_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Meta não está nesta supermeta")
    super_goal.items.remove(item)
    session.commit()
    session.refresh(super_goal)
    return serialize(super_goal, visible_goal_ids(current_user.id, session))
