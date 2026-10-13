from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.schemas import (
    GoalsSchema,
    EditGoalSchema,
    GoalResponseSchema,
    GoalCycleLogSchema,
    GoalEntrySchema,
    GoalEntryResponseSchema,
    ReorderSchema,
    StatsNumericGoalSchema,
)
from app.database import get_db
from app.models import (
    Goal,
    User,
    GoalStatus,
    Task,
    GoalCycleLog,
    GoalEntry,
)
from .auth import get_current_user
from .tasks import (
    update_streak,
    is_late,
    to_aware_utc,
    check_and_reset_recurring_tasks,
    check_and_reset_recurring_goals,
    undo_today_streak_if_inactive,
    refresh_goal_status,
    apply_order,
)
from app.dates import today_br, br_day_start_utc
from .stats import numeric_summary
from typing import Optional, List
from datetime import date, datetime, timezone, timedelta

goals_router = APIRouter(prefix="/goals", tags=["goals"])


def validate_numeric_goal(goal: Goal):
    if not goal.is_numeric:
        return

    if goal.numeric_mode == "latest":
        if goal.is_recurring:
            raise HTTPException(
                status_code=400,
                detail="Metas de medição não podem ser recorrentes.",
            )
        if goal.start_value is None:
            raise HTTPException(
                status_code=400,
                detail="Informe o valor inicial para metas de medição.",
            )
        if goal.start_value == goal.target_value:
            raise HTTPException(
                status_code=400,
                detail="O valor alvo precisa ser diferente do valor inicial.",
            )
    elif goal.is_recurring and goal.target_value <= 0:
        raise HTTPException(
            status_code=400, detail="A meta por ciclo precisa ser maior que zero."
        )
    elif not goal.is_recurring and goal.target_value <= (goal.start_value or 0):
        raise HTTPException(
            status_code=400,
            detail="O valor alvo precisa ser maior que o valor inicial.",
        )


def resolve_cycle_start(
    day: date,
    interval_days: int | None,
    deadline: datetime | None = None,
    not_before: datetime | None = None,
) -> datetime:
    today = today_br()
    if interval_days and (today - day).days >= interval_days:
        raise HTTPException(
            status_code=400,
            detail="O início do ciclo precisa estar dentro do ciclo atual.",
        )

    start = br_day_start_utc(day)
    if deadline and start >= to_aware_utc(deadline):
        raise HTTPException(
            status_code=400,
            detail="O início do ciclo precisa ser antes do prazo da meta.",
        )
    if not_before and start < not_before:
        raise HTTPException(
            status_code=400,
            detail="O início do ciclo não pode ser antes do fim do último ciclo registrado.",
        )
    return start


def get_user_goal(goal_id: int, user: User, session: Session) -> Goal:
    goal = (
        session.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return goal


@goals_router.post("/", response_model=GoalResponseSchema)
async def create_goal(
    goals_schema: GoalsSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    last_position = (
        session.query(func.max(Goal.position))
        .filter(Goal.user_id == current_user.id)
        .scalar()
    )

    new_goal = Goal(
        position=0 if last_position is None else last_position + 1,
        title=goals_schema.title,
        description=goals_schema.description,
        deadline=goals_schema.deadline,
        user_id=current_user.id,
        is_recurring=goals_schema.is_recurring,
        recurrence_interval_days=goals_schema.recurrence_interval_days,
        recurrence_target=goals_schema.recurrence_target,
        cycle_start_date=(
            (
                resolve_cycle_start(
                    goals_schema.cycle_start_date,
                    goals_schema.recurrence_interval_days,
                    goals_schema.deadline,
                )
                if goals_schema.cycle_start_date
                else datetime.now(timezone.utc)
            )
            if goals_schema.is_recurring
            else None
        ),
        target_value=goals_schema.target_value,
        start_value=goals_schema.start_value,
        unit=goals_schema.unit,
        numeric_mode=(
            (goals_schema.numeric_mode or "sum")
            if goals_schema.target_value is not None
            else None
        ),
    )
    validate_numeric_goal(new_goal)
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
    check_and_reset_recurring_tasks(current_user.id, session)

    query = session.query(Goal).filter(Goal.user_id == current_user.id)

    if status is not None:
        query = query.filter(Goal.status == status)

    my_goals = query.order_by(Goal.position, Goal.id).all()

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


@goals_router.put("/order")
async def reorder_goals(
    payload: ReorderSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goals = (
        session.query(Goal)
        .filter(Goal.user_id == current_user.id)
        .order_by(Goal.position, Goal.id)
        .all()
    )
    apply_order(goals, payload.ids)
    session.commit()

    return {"message": "Ordem atualizada"}


@goals_router.get("/{goal_id}", response_model=GoalResponseSchema)
async def get_single_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)
    check_and_reset_recurring_tasks(current_user.id, session)

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


@goals_router.put("/{goal_id}", response_model=GoalResponseSchema)
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
    if edit_goal_schema.cycle_start_date is not None and goal.is_recurring:
        last_cycle_end = (
            session.query(func.max(GoalCycleLog.cycle_end))
            .filter(GoalCycleLog.goal_id == goal.id)
            .scalar()
        )
        try:
            goal.cycle_start_date = resolve_cycle_start(
                edit_goal_schema.cycle_start_date,
                goal.recurrence_interval_days,
                goal.deadline,
                to_aware_utc(last_cycle_end) if last_cycle_end else None,
            )
        except HTTPException:
            session.rollback()
            raise
    if goal.is_numeric:
        if edit_goal_schema.target_value is not None:
            goal.target_value = edit_goal_schema.target_value
        if edit_goal_schema.start_value is not None:
            goal.start_value = edit_goal_schema.start_value
        if edit_goal_schema.unit is not None:
            goal.unit = edit_goal_schema.unit or None

    try:
        validate_numeric_goal(goal)
    except HTTPException:
        session.rollback()
        raise

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


@goals_router.get("/{goal_id}/progress", response_model=StatsNumericGoalSchema)
async def get_goal_progress(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_user_goal(goal_id, current_user, session)

    if not goal.is_numeric or goal.is_recurring:
        raise HTTPException(
            status_code=400,
            detail="Só metas de progresso não recorrentes têm evolução.",
        )

    return numeric_summary(goal, datetime.now(timezone.utc))


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


@goals_router.get("/{goal_id}/entries", response_model=List[GoalEntryResponseSchema])
async def list_goal_entries(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    return get_user_goal(goal_id, current_user, session).entries


@goals_router.post("/{goal_id}/entries", response_model=GoalEntryResponseSchema)
async def add_goal_entry(
    goal_id: int,
    entry_schema: GoalEntrySchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_user_goal(goal_id, current_user, session)

    if not goal.is_numeric:
        raise HTTPException(
            status_code=400, detail="Só metas numéricas aceitam registros."
        )

    check_and_reset_recurring_goals(current_user.id, session)

    entry = GoalEntry(
        goal_id=goal.id,
        value=entry_schema.value,
        note=entry_schema.note or None,
        created_at=datetime.now(timezone.utc),
    )
    session.add(entry)
    session.commit()
    session.refresh(goal)

    refresh_goal_status(goal)
    session.commit()
    session.refresh(entry)

    update_streak(current_user.id, session)

    return entry


@goals_router.delete("/{goal_id}/entries/{entry_id}")
async def delete_goal_entry(
    goal_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_user_goal(goal_id, current_user, session)

    entry = (
        session.query(GoalEntry)
        .filter(GoalEntry.id == entry_id, GoalEntry.goal_id == goal.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    session.delete(entry)
    session.commit()
    session.refresh(goal)

    refresh_goal_status(goal)
    session.commit()

    undo_today_streak_if_inactive(current_user.id, session)

    return {"message": "Registro apagado com sucesso"}
