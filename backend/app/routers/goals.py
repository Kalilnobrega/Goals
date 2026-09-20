from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas import (
    GoalsSchema,
    EditGoalSchema,
    GoalResponseSchema,
    GoalCycleLogSchema,
)
from app.database import get_db
from app.models import Goal, User, GoalStatus, Task, TaskCompletion, GoalCycleLog
from .auth import get_current_user
from .tasks import update_streak, is_late, to_aware_utc
from typing import Optional, List
from datetime import datetime, timezone, timedelta

goals_router = APIRouter(prefix="/goals", tags=["goals"])


def check_and_reset_recurring_goals(user_id: int, session: Session):
    now = datetime.now(timezone.utc)

    recurring_goals = (
        session.query(Goal)
        .filter(Goal.user_id == user_id, Goal.is_recurring == True)
        .all()
    )

    for goal in recurring_goals:
        if not goal.cycle_start_date or not goal.recurrence_interval_days:
            continue

        cycle_start = to_aware_utc(goal.cycle_start_date)
        cycle_end = cycle_start + timedelta(days=goal.recurrence_interval_days)

        if now < cycle_end:
            continue

        achieved = (
            session.query(TaskCompletion)
            .join(Task, Task.id == TaskCompletion.task_id)
            .filter(
                Task.goals_id == goal.id,
                TaskCompletion.completed_at >= cycle_start,
                TaskCompletion.completed_at < cycle_end,
            )
            .count()
        )
        target = goal.recurrence_target or 1

        session.add(
            GoalCycleLog(
                goal_id=goal.id,
                cycle_start=cycle_start,
                cycle_end=cycle_end,
                target_count=target,
                achieved_count=achieved,
                completed=achieved >= target,
            )
        )

        if goal.deadline and to_aware_utc(goal.deadline) <= now:
            goal.is_recurring = False
        else:
            goal.cycle_start_date = now

    session.commit()


@goals_router.post("/")
async def create_goal(
    goals_schema: GoalsSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    new_goal = Goal(
        title=goals_schema.title,
        description=goals_schema.description,
        deadline=goals_schema.deadline,
        user_id=current_user.id,
        is_recurring=goals_schema.is_recurring,
        recurrence_interval_days=goals_schema.recurrence_interval_days,
        recurrence_target=goals_schema.recurrence_target,
        cycle_start_date=(
            datetime.now(timezone.utc) if goals_schema.is_recurring else None
        ),
    )
    session.add(new_goal)
    session.commit()
    session.refresh(new_goal)

    return new_goal


@goals_router.get("/", response_model=List[GoalResponseSchema])
async def list_goals(
    status: Optional[GoalStatus] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)

    query = session.query(Goal).filter(Goal.user_id == current_user.id)

    if status is not None:
        query = query.filter(Goal.status == status)

    my_goals = query.all()

    now = datetime.now(timezone.utc)
    late = False

    for goals in my_goals:
        if (
            goals.status == GoalStatus.OPEN
            and goals.deadline
            and is_late(goals.deadline, now)
        ):
            goals.status = GoalStatus.LATE
            late = True

    if late:
        session.commit()

    return my_goals


@goals_router.get("/{goal_id}", response_model=GoalResponseSchema)
async def get_single_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)

    goal = (
        session.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")

    now = datetime.now(timezone.utc)
    if goal.status == GoalStatus.OPEN and goal.deadline and is_late(goal.deadline, now):
        goal.status = GoalStatus.LATE
        session.commit()

    return goal


@goals_router.put("/{goal_id}")
async def edit_goal(
    goal_id: int,
    edit_goal_schema: EditGoalSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = (
        session.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=404,
            detail="Meta não encontrada ou não tem permissão para a alterar",
        )

    if edit_goal_schema.title is not None:
        goal.title = edit_goal_schema.title
    if edit_goal_schema.description is not None:
        goal.description = edit_goal_schema.description
    if edit_goal_schema.deadline is not None:
        goal.deadline = edit_goal_schema.deadline
    if edit_goal_schema.status is not None:
        goal.status = edit_goal_schema.status
        if edit_goal_schema.status == GoalStatus.COMPLETED:
            update_streak(current_user.id, session)
    if edit_goal_schema.is_recurring is not None:
        if edit_goal_schema.is_recurring and not goal.is_recurring:
            goal.cycle_start_date = datetime.now(timezone.utc)
        goal.is_recurring = edit_goal_schema.is_recurring
    if edit_goal_schema.recurrence_interval_days is not None:
        goal.recurrence_interval_days = edit_goal_schema.recurrence_interval_days
    if edit_goal_schema.recurrence_target is not None:
        goal.recurrence_target = edit_goal_schema.recurrence_target

    session.commit()
    session.refresh(goal)

    return goal


@goals_router.get("/{goal_id}/cycles", response_model=List[GoalCycleLogSchema])
async def list_goal_cycles(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = (
        session.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")

    return (
        session.query(GoalCycleLog)
        .filter(GoalCycleLog.goal_id == goal_id)
        .order_by(GoalCycleLog.cycle_start.desc())
        .all()
    )


@goals_router.delete("/{goal_id}")
async def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = (
        session.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=404,
            detail="Meta não encontrada ou não tem permissão para apagar",
        )

    session.delete(goal)
    session.commit()

    return {"message": "Meta apagada com sucesso"}
