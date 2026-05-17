from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas import TaskSchema, EditTaskSchema, TaskResponseSchema
from app.database import get_db
from app.models import Goal, Task, User, GoalStatus
from .auth import get_current_user
from datetime import datetime, timezone, date
from typing import List

tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


def check_and_reset_recurring_tasks(user_id: int, session: Session):
    now = datetime.now(timezone.utc)

    recurring_tasks = (
        session.query(Task)
        .join(Goal)
        .filter(Goal.user_id == user_id, Task.is_recurring == True)
        .all()
    )

    for task in recurring_tasks:
        if task.last_reset_date and task.recurrence_interval_days:
            last_reset = task.last_reset_date.replace(tzinfo=timezone.utc)
            past_days = (now - last_reset).days

            if past_days >= task.recurrence_interval_days:
                if (
                    task.max_recurrences is None
                    or task.recurrence_count < task.max_recurrences
                ):
                    if task.status == True:
                        task.recurrence_count += 1

                    task.status = False
                    task.last_reset_date = now

                elif task.recurrence_count >= task.max_recurrences:
                    task.is_recurring = False

    session.commit()


@tasks_router.post("/{goal_id}")
async def create_task(
    goal_id: int,
    task_schema: TaskSchema,
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

    if task_schema.end_of_goal:
        if not goal.deadline:
            raise HTTPException(
                status_code=400,
                detail="A meta precisa ter uma data final para usar essa opção.",
            )

        days_remaining = (goal.deadline.date() - date.today()).days

        if days_remaining < 0:
            raise HTTPException(status_code=400, detail="A meta já venceu.")

        task_schema.max_recurrences = (
            days_remaining // task_schema.recurrence_interval_days
        )

    new_task = Task(
        title=task_schema.title,
        goals_id=goal.id,
        is_recurring=task_schema.is_recurring,
        recurrence_interval_days=task_schema.recurrence_interval_days,
        max_recurrences=task_schema.max_recurrences,
        recurrence_count=0,
    )

    session.add(new_task)
    session.commit()
    session.refresh(new_task)

    return new_task


@tasks_router.get("/today", response_model=List[TaskResponseSchema])
async def list_today_tasks(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    check_and_reset_recurring_tasks(current_user.id, session)

    tasks = (
        session.query(Task)
        .join(Goal)
        .filter(
            Goal.user_id == current_user.id,
            Goal.status.in_([GoalStatus.OPEN, GoalStatus.LATE]),
            Task.status == False,
        )
        .all()
    )

    task_response = []
    for task in tasks:
        task_data = TaskResponseSchema(
            id=task.id,
            goals_id=task.goals_id,
            title=task.title,
            goal_title=task.goal.title,
            status=task.status,
            created_at=task.created_at,
            is_recurring=task.is_recurring,
            recurrence_interval_days=task.recurrence_interval_days,
            max_recurrences=task.max_recurrences,
            recurrence_count=task.recurrence_count,
            last_reset_date=task.last_reset_date,
        )
        task_response.append(task_data)

    return task_response


@tasks_router.get("/goal/{goal_id}")
async def list_tasks_by_goal(
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
            status_code=404, detail="Meta não encontrada ou acesso negado"
        )

    tasks = session.query(Task).filter(Task.goals_id == goal_id).all()

    return tasks


@tasks_router.patch("/{task_id}/toggle")
async def toggle_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = (
        session.query(Task)
        .join(Goal)
        .filter(Task.id == task_id, Goal.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    task.status = not task.status
    session.commit()
    session.refresh(task)

    goal = task.goal

    if goal.progress >= 100.0:
        goal.status = GoalStatus.COMPLETED

    elif goal.progress < 100.0 and goal.status == GoalStatus.COMPLETED:
        now = datetime.now()

        if goal.deadline and goal.deadline < now:
            goal.status = GoalStatus.LATE
        else:
            goal.status = GoalStatus.OPEN

    session.commit()
    session.refresh(task)

    return task


@tasks_router.put("/{task_id}")
async def edit_task(
    task_id: int,
    task_schema: EditTaskSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = (
        session.query(Task)
        .join(Goal)
        .filter(Task.id == task_id, Goal.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if task_schema.status is not None:
        task.status = task_schema.status
    if task_schema.title is not None:
        task.title = task_schema.title
    if task_schema.is_recurring is not None:
        if task_schema.is_recurring == True and task.is_recurring == False:
            task.last_reset_date = datetime.now(timezone.utc)
            task.recurrence_count = 0
        task.is_recurring = task_schema.is_recurring
    if task_schema.recurrence_interval_days is not None:
        task.recurrence_interval_days = task_schema.recurrence_interval_days
    if task_schema.max_recurrences is not None:
        task.max_recurrences = task_schema.max_recurrences

    session.commit()
    session.refresh(task)

    return task


@tasks_router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = (
        session.query(Task)
        .join(Goal)
        .filter(Task.id == task_id, Goal.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404, detail="Tarefa não encontrada ou acesso negado"
        )

    session.delete(task)
    session.commit()

    return {"message": "Tarefa apagada com sucesso"}
