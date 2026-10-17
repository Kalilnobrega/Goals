from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
import uuid
from app.schemas import (
    TaskSchema,
    EditTaskSchema,
    TaskResponseSchema,
    GoalTaskResponseSchema,
    ReorderSchema,
)
from app.database import get_db
from app.models import (
    Goal,
    Task,
    User,
    GoalStatus,
    Streak,
    TaskCompletion,
    GoalEntry,
    GoalCycleLog,
    GoalGroup,
    GroupKind,
)
from app.access import (
    member_goal_filter,
    entry_by,
    get_goal_with_access,
    get_task_with_access,
    goal_copies,
    task_copies,
    is_challenge,
    sort_for_user,
)
from .auth import get_current_user
from datetime import datetime, timezone, timedelta
from app.dates import (
    today_br,
    to_br_date,
    br_day_start_utc,
    count_weekdays,
    last_scheduled_day,
)
from typing import List

tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


def to_aware_utc(dt):
    """Normaliza um datetime pra UTC-aware, funcionando tanto com valores
    naive (SQLite) quanto com valores ja timezone-aware (Postgres)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# O app nao guarda o fuso horario de cada usuario, entao assume-se Brasil
# (UTC-3, sem horario de verao desde 2019) — coerente com o app ser todo em
# portugues. O deadline chega do frontend como um input type="date" (ex:
# "2026-09-25"), vira um datetime naive de meia-noite, e o Postgres em
# producao guarda isso como se ja fosse UTC (sessao em UTC) — ou seja, o
# valor salvo eh "dia D, 00:00 UTC", nao a meia-noite real em Brasilia.
# Pra a meta so virar atrasada depois que o dia D inteiro passar no horario
# de Brasilia, soma-se 1 dia (o proprio dia D) + 3h (offset ate a meia-noite
# real de Brasilia).
LATE_GRACE_PERIOD = timedelta(days=1, hours=3)


def apply_order(items, ids):
    by_id = {item.id: item for item in items}
    if len(set(ids)) != len(ids) or any(item_id not in by_id for item_id in ids):
        raise HTTPException(status_code=400, detail="Lista de ordenação inválida")

    selected = set(ids)
    slots = [index for index, item in enumerate(items) if item.id in selected]
    ordered = list(items)
    for slot, item_id in zip(slots, ids):
        ordered[slot] = by_id[item_id]

    for position, item in enumerate(ordered):
        item.position = position


def is_late(deadline, now):
    return to_aware_utc(deadline) + LATE_GRACE_PERIOD < now


def uncheck_goal_tasks(goal: Goal):
    for task in goal.tasks:
        if not task.status:
            continue

        if task.is_recurring and (
            task.max_recurrences is None
            or task.recurrence_count < task.max_recurrences
        ):
            task.recurrence_count += 1

        task.status = False


def check_and_reset_recurring_goals(user_id: int, session: Session):
    now = datetime.now(timezone.utc)

    recurring_goals = (
        session.query(Goal)
        .filter(member_goal_filter(user_id), Goal.is_recurring == True)
        .all()
    )

    for goal in recurring_goals:
        if not goal.cycle_start_date or not goal.recurrence_interval_days:
            continue

        interval = timedelta(days=goal.recurrence_interval_days)
        deadline = to_aware_utc(goal.deadline) if goal.deadline else None
        target = goal.recurrence_target or 1
        cycle_start = to_aware_utc(goal.cycle_start_date)
        cycle_end = cycle_start + interval

        if now < cycle_end:
            continue

        while cycle_end <= now and (deadline is None or cycle_start < deadline):
            if goal.is_numeric:
                achieved_value = sum(
                    entry.value
                    for entry in goal.entries
                    if cycle_start <= to_aware_utc(entry.created_at) < cycle_end
                )
                log = GoalCycleLog(
                    target_count=0,
                    achieved_count=0,
                    target_value=goal.target_value,
                    achieved_value=achieved_value,
                    completed=achieved_value >= goal.target_value,
                )
            else:
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
                log = GoalCycleLog(
                    target_count=target,
                    achieved_count=achieved,
                    completed=achieved >= target,
                )

            log.goal_id = goal.id
            log.cycle_start = cycle_start
            log.cycle_end = cycle_end
            session.add(log)

            cycle_start = cycle_end
            cycle_end = cycle_start + interval

        if deadline and deadline <= now:
            goal.is_recurring = False
        else:
            goal.cycle_start_date = cycle_start
            uncheck_goal_tasks(goal)

    session.commit()


def check_and_reset_recurring_tasks(user_id: int, session: Session):
    now = datetime.now(timezone.utc)

    recurring_tasks = (
        session.query(Task)
        .join(Goal)
        .filter(member_goal_filter(user_id), Task.is_recurring == True)
        .all()
    )

    for task in recurring_tasks:
        if not task.last_reset_date:
            continue

        last_reset = to_aware_utc(task.last_reset_date)
        next_reset = next_reset_date(task, last_reset, now)

        if next_reset is None:
            continue

        if task.max_recurrences is None or task.recurrence_count < task.max_recurrences:
            if task.status == True:
                task.recurrence_count += 1

            task.status = False
            task.last_reset_date = next_reset

        elif task.recurrence_count >= task.max_recurrences:
            task.is_recurring = False

    session.commit()


def next_reset_date(task: Task, last_reset: datetime, now: datetime):
    if task.recurrence_weekdays:
        day = last_scheduled_day(
            to_br_date(last_reset), today_br(now), task.recurrence_weekdays
        )
        return br_day_start_utc(day) if day else None

    if task.recurrence_interval_days:
        interval = timedelta(days=task.recurrence_interval_days)
        elapsed_periods = (now - last_reset) // interval
        if elapsed_periods >= 1:
            return last_reset + elapsed_periods * interval

    return None


def is_scheduled_today(task: Task) -> bool:
    if not task.is_recurring or not task.recurrence_weekdays:
        return True
    return today_br().weekday() in task.recurrence_weekdays


def has_activity_today(user_id: int, session: Session) -> bool:
    today = today_br()

    completed_task = (
        session.query(Task)
        .join(Goal)
        .outerjoin(GoalGroup, GoalGroup.id == Goal.group_id)
        .filter(
            Goal.user_id == user_id,
            or_(Goal.group_id.is_(None), GoalGroup.kind == GroupKind.CHALLENGE),
            Task.status == True,
            Task.completed_at == today,
        )
        .first()
    )
    if completed_task:
        return True

    shared_completion = (
        session.query(TaskCompletion)
        .join(Task, Task.id == TaskCompletion.task_id)
        .join(Goal)
        .join(GoalGroup, GoalGroup.id == Goal.group_id)
        .filter(
            TaskCompletion.user_id == user_id,
            GoalGroup.kind == GroupKind.COLLABORATIVE,
            Task.status == True,
            Task.completed_at == today,
            TaskCompletion.completed_at >= br_day_start_utc(today),
        )
        .first()
    )
    if shared_completion:
        return True

    entry = (
        session.query(GoalEntry)
        .join(Goal)
        .filter(
            member_goal_filter(user_id),
            entry_by(user_id),
            GoalEntry.created_at >= br_day_start_utc(today),
            GoalEntry.created_at < br_day_start_utc(today + timedelta(days=1)),
        )
        .first()
    )
    return entry is not None


def undo_today_streak_if_inactive(user_id: int, session: Session):
    if has_activity_today(user_id, session):
        return

    streak_db = session.query(Streak).filter(Streak.user_id == user_id).first()

    if streak_db and streak_db.last_activity == today_br():
        # Desfaz exatamente o incremento de hoje feito por update_streak,
        # em vez de tentar redescobrir "teve atividade ontem" consultando
        # tarefas (frágil: hábitos recorrentes já resetados não deixam
        # rastro e zeravam a streak inteira indevidamente).
        streak_db.current_streak = max(0, streak_db.current_streak - 1)

        if streak_db.longest_before_today is not None:
            streak_db.longest_streak = streak_db.longest_before_today

        if streak_db.current_streak == 0:
            streak_db.last_activity = None
        else:
            streak_db.last_activity = today_br() - timedelta(days=1)

        session.commit()


def refresh_goal_status(goal: Goal):
    if goal.is_recurring:
        return

    if goal.progress >= 100.0:
        goal.status = GoalStatus.COMPLETED

    elif goal.status == GoalStatus.COMPLETED:
        now = datetime.now(timezone.utc)

        if goal.deadline and is_late(goal.deadline, now):
            goal.status = GoalStatus.LATE
        else:
            goal.status = GoalStatus.OPEN


def update_streak(user_id: int, session: Session):
    today = today_br()

    if not has_activity_today(user_id, session):
        return

    streak_db = session.query(Streak).filter(Streak.user_id == user_id).first()

    if not streak_db:
        streak_db = Streak(
            user_id=user_id,
            current_streak=1,
            longest_streak=1,
            longest_before_today=0,
            last_activity=today,
        )
        session.add(streak_db)
        session.commit()
        return

    if streak_db.last_activity == today:
        return

    if streak_db.last_activity == today - timedelta(days=1):
        streak_db.current_streak += 1
    else:
        streak_db.current_streak = 1

    streak_db.longest_before_today = streak_db.longest_streak
    streak_db.longest_streak = max(streak_db.longest_streak, streak_db.current_streak)
    streak_db.last_activity = today
    session.commit()


@tasks_router.post("/{goal_id}")
async def create_task(
    goal_id: int,
    task_schema: TaskSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session, "edit")

    if task_schema.end_of_goal:
        if not goal.deadline:
            raise HTTPException(
                status_code=400,
                detail="A meta precisa ter uma data final para usar essa opção.",
            )

        days_remaining = (goal.deadline.date() - today_br()).days

        if days_remaining < 0:
            raise HTTPException(status_code=400, detail="A meta já venceu.")

        if task_schema.recurrence_weekdays:
            task_schema.max_recurrences = count_weekdays(
                today_br(), goal.deadline.date(), task_schema.recurrence_weekdays
            )
        else:
            task_schema.max_recurrences = (
                days_remaining // task_schema.recurrence_interval_days
            )

    key = str(uuid.uuid4()) if is_challenge(goal) else None
    new_task = None

    for copy in goal_copies(goal):
        last_position = (
            session.query(func.max(Task.position))
            .filter(Task.goals_id == copy.id)
            .scalar()
        )
        task = Task(
            title=task_schema.title,
            goals_id=copy.id,
            position=0 if last_position is None else last_position + 1,
            is_recurring=task_schema.is_recurring,
            recurrence_interval_days=task_schema.recurrence_interval_days,
            recurrence_weekdays=task_schema.recurrence_weekdays or None,
            max_recurrences=task_schema.max_recurrences,
            recurrence_count=0,
            group_task_key=key,
        )
        session.add(task)
        if copy is goal:
            new_task = task

    session.commit()
    session.refresh(new_task)

    return new_task


@tasks_router.get("/today", response_model=List[TaskResponseSchema])
async def list_today_tasks(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    check_and_reset_recurring_goals(current_user.id, session)
    check_and_reset_recurring_tasks(current_user.id, session)

    tasks = (
        session.query(Task)
        .join(Goal)
        .filter(
            member_goal_filter(current_user.id),
            Goal.status.in_([GoalStatus.OPEN, GoalStatus.LATE]),
            Task.status == False,
        )
        .order_by(Task.position, Task.id)
        .all()
    )
    goal_order = {
        goal.id: index
        for index, goal in enumerate(
            sort_for_user({task.goal for task in tasks}, current_user.id, session)
        )
    }
    tasks.sort(key=lambda task: goal_order[task.goals_id])

    task_response = []
    for task in tasks:
        if not is_scheduled_today(task):
            continue
        task_data = TaskResponseSchema(
            id=task.id,
            goal_id=task.goals_id,
            title=task.title,
            goal_title=task.goal.title,
            status=task.status,
            created_at=task.created_at,
            is_recurring=task.is_recurring,
            recurrence_interval_days=task.recurrence_interval_days,
            recurrence_weekdays=task.recurrence_weekdays,
            max_recurrences=task.max_recurrences,
            recurrence_count=task.recurrence_count,
            last_reset_date=task.last_reset_date,
        )
        task_response.append(task_data)

    return task_response


@tasks_router.get("/goal/{goal_id}", response_model=List[GoalTaskResponseSchema])
async def list_tasks_by_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session)
    owner_id = goal.user_id

    check_and_reset_recurring_goals(current_user.id, session)
    check_and_reset_recurring_tasks(current_user.id, session)
    if owner_id != current_user.id:
        check_and_reset_recurring_goals(owner_id, session)
        check_and_reset_recurring_tasks(owner_id, session)

    tasks = (
        session.query(Task)
        .filter(Task.goals_id == goal_id)
        .order_by(Task.position, Task.id)
        .all()
    )

    return tasks


@tasks_router.put("/goal/{goal_id}/order")
async def reorder_tasks(
    goal_id: int,
    payload: ReorderSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session, "edit")

    tasks = (
        session.query(Task)
        .filter(Task.goals_id == goal_id)
        .order_by(Task.position, Task.id)
        .all()
    )
    apply_order(tasks, payload.ids)

    if is_challenge(goal):
        keys = {task.id: task.group_task_key for task in tasks}
        ordered_keys = [keys[task_id] for task_id in payload.ids]
        for copy in goal_copies(goal):
            if copy is goal:
                continue
            copy_tasks = sorted(copy.tasks, key=lambda t: (t.position, t.id))
            by_key = {t.group_task_key: t.id for t in copy_tasks if t.group_task_key}
            copy_ids = [by_key[key] for key in ordered_keys if key in by_key]
            if copy_ids:
                apply_order(copy_tasks, copy_ids)

    session.commit()

    return {"message": "Ordem atualizada"}


@tasks_router.patch("/{task_id}/toggle")
async def toggle_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)

    task = get_task_with_access(task_id, current_user, session, "act")

    task.status = not task.status
    task.completed_at = today_br() if task.status else None
    author_id = current_user.id

    if task.status:
        session.add(
            TaskCompletion(
                task_id=task.id,
                user_id=current_user.id,
                completed_at=datetime.now(timezone.utc),
            )
        )
    else:
        last_completion = (
            session.query(TaskCompletion)
            .filter(TaskCompletion.task_id == task.id)
            .order_by(TaskCompletion.completed_at.desc())
            .first()
        )
        if last_completion:
            author_id = last_completion.user_id or task.goal.user_id
            session.delete(last_completion)

    session.commit()
    session.refresh(task)

    if task.status:
        update_streak(current_user.id, session)
    else:
        undo_today_streak_if_inactive(author_id, session)

    refresh_goal_status(task.goal)

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
    task = get_task_with_access(task_id, current_user, session, "edit")

    if task_schema.status is not None:
        task.status = task_schema.status

    for copy in task_copies(task):
        if task_schema.title is not None:
            copy.title = task_schema.title
        if task_schema.is_recurring is not None:
            if task_schema.is_recurring == True and copy.is_recurring == False:
                copy.last_reset_date = datetime.now(timezone.utc)
                copy.recurrence_count = 0
            copy.is_recurring = task_schema.is_recurring
        if task_schema.recurrence_interval_days is not None:
            copy.recurrence_interval_days = task_schema.recurrence_interval_days
        if task_schema.recurrence_weekdays is not None:
            copy.recurrence_weekdays = task_schema.recurrence_weekdays or None
        if task_schema.max_recurrences is not None:
            copy.max_recurrences = task_schema.max_recurrences

    session.commit()
    session.refresh(task)

    return task


@tasks_router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = get_task_with_access(task_id, current_user, session, "edit")

    for copy in task_copies(task):
        session.delete(copy)
    session.commit()

    return {"message": "Tarefa apagada com sucesso"}
