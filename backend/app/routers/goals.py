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
from app.access import (
    member_goal_filter,
    get_goal_with_access,
    goal_permissions,
    annotate_goal,
    goal_copies,
    is_collaborative,
    sort_for_user,
    collaborative_positions,
    next_goal_position,
    find_member,
)
from app.sharing import delete_shared_goal
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


def mark_late(goals: list[Goal], session: Session):
    now = datetime.now(timezone.utc)
    late = False

    for goal in goals:
        if goal.status == GoalStatus.OPEN and goal.deadline and is_late(goal.deadline, now):
            goal.status = GoalStatus.LATE
            late = True

    if late:
        session.commit()


def apply_goal_edit(goal: Goal, schema: EditGoalSchema, session: Session):
    if schema.title is not None:
        goal.title = schema.title
    if schema.description is not None:
        goal.description = schema.description
    if schema.deadline is not None:
        goal.deadline = schema.deadline
    if schema.is_recurring is not None:
        if schema.is_recurring and not goal.is_recurring:
            goal.cycle_start_date = br_day_start_utc(today_br())
        goal.is_recurring = schema.is_recurring
    if schema.recurrence_interval_days is not None:
        goal.recurrence_interval_days = schema.recurrence_interval_days
    if schema.recurrence_target is not None:
        goal.recurrence_target = schema.recurrence_target
    if schema.cycle_start_date is not None and goal.is_recurring:
        last_cycle_end = (
            session.query(func.max(GoalCycleLog.cycle_end))
            .filter(GoalCycleLog.goal_id == goal.id)
            .scalar()
        )
        goal.cycle_start_date = resolve_cycle_start(
            schema.cycle_start_date,
            goal.recurrence_interval_days,
            goal.deadline,
            to_aware_utc(last_cycle_end) if last_cycle_end else None,
        )
    if goal.is_numeric:
        if schema.target_value is not None:
            goal.target_value = schema.target_value
        if schema.start_value is not None:
            goal.start_value = schema.start_value
        if schema.unit is not None:
            goal.unit = schema.unit or None

    validate_numeric_goal(goal)


@goals_router.post("/", response_model=GoalResponseSchema)
async def create_goal(
    goals_schema: GoalsSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    new_goal = Goal(
        position=next_goal_position(current_user.id, session),
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
                else br_day_start_utc(today_br())
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

    return annotate_goal(new_goal, goal_permissions(new_goal, current_user.id), current_user.id)


@goals_router.get("/", response_model=List[GoalResponseSchema])
async def list_goals(
    status: Optional[GoalStatus] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)
    check_and_reset_recurring_tasks(current_user.id, session)

    query = session.query(Goal).filter(member_goal_filter(current_user.id))

    if status is not None:
        query = query.filter(Goal.status == status)

    my_goals = sort_for_user(query.all(), current_user.id, session)
    mark_late(my_goals, session)

    return [
        annotate_goal(goal, goal_permissions(goal, current_user.id), current_user.id)
        for goal in my_goals
    ]


@goals_router.put("/order")
async def reorder_goals(
    payload: ReorderSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goals = sort_for_user(
        session.query(Goal).filter(member_goal_filter(current_user.id)).all(),
        current_user.id,
        session,
    )
    shared = collaborative_positions(current_user.id, session)
    own_positions = {goal.id: goal.position for goal in goals if goal.id in shared}

    apply_order(goals, payload.ids)

    for goal in goals:
        if goal.id in shared:
            find_member(goal.group, current_user.id).position = goal.position
            goal.position = own_positions[goal.id]

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

    goal = get_goal_with_access(goal_id, current_user, session)
    if goal.user_id != current_user.id:
        check_and_reset_recurring_goals(goal.user_id, session)
        check_and_reset_recurring_tasks(goal.user_id, session)

    mark_late([goal], session)

    return goal


@goals_router.put("/{goal_id}", response_model=GoalResponseSchema)
async def edit_goal(
    goal_id: int,
    edit_goal_schema: EditGoalSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session)
    perms = goal_permissions(goal, current_user.id)

    edits = {
        field
        for field in edit_goal_schema.model_fields_set
        if field != "status" and getattr(edit_goal_schema, field) is not None
    }
    if (edits and not perms["edit"]) or (
        edit_goal_schema.status is not None and not perms["complete"]
    ):
        raise HTTPException(
            status_code=403, detail="Você não tem permissão para fazer isso nesta meta."
        )

    if edit_goal_schema.status is not None:
        goal.status = edit_goal_schema.status
        if edit_goal_schema.status == GoalStatus.COMPLETED:
            update_streak(current_user.id, session)

    if edits:
        try:
            for copy in goal_copies(goal):
                apply_goal_edit(copy, edit_goal_schema, session)
        except HTTPException:
            session.rollback()
            raise

    session.commit()
    session.refresh(goal)

    return annotate_goal(goal, perms, current_user.id)


@goals_router.get("/{goal_id}/cycles", response_model=List[GoalCycleLogSchema])
async def list_goal_cycles(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    get_goal_with_access(goal_id, current_user, session)

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
    goal = get_goal_with_access(goal_id, current_user, session)

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
    goal = get_goal_with_access(goal_id, current_user, session, "delete")

    if goal.group:
        delete_shared_goal(goal, session)
    else:
        session.delete(goal)
    session.commit()

    return {"message": "Meta apagada com sucesso"}


@goals_router.get("/{goal_id}/entries", response_model=List[GoalEntryResponseSchema])
async def list_goal_entries(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session)

    for entry in goal.entries:
        entry.can_delete = goal.can_act and (
            not is_collaborative(goal)
            or goal.can_edit
            or entry.user_id == current_user.id
        )

    return goal.entries


@goals_router.post("/{goal_id}/entries", response_model=GoalEntryResponseSchema)
async def add_goal_entry(
    goal_id: int,
    entry_schema: GoalEntrySchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session, "act")

    if not goal.is_numeric:
        raise HTTPException(
            status_code=400, detail="Só metas numéricas aceitam registros."
        )

    check_and_reset_recurring_goals(current_user.id, session)

    entry = GoalEntry(
        goal_id=goal.id,
        user_id=current_user.id,
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

    entry.can_delete = True
    return entry


@goals_router.delete("/{goal_id}/entries/{entry_id}")
async def delete_goal_entry(
    goal_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = get_goal_with_access(goal_id, current_user, session, "act")

    entry = (
        session.query(GoalEntry)
        .filter(GoalEntry.id == entry_id, GoalEntry.goal_id == goal.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    if is_collaborative(goal) and not goal.can_edit and entry.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Você só pode apagar os seus próprios registros."
        )

    author_id = entry.user_id or goal.user_id
    session.delete(entry)
    session.commit()
    session.refresh(goal)

    refresh_goal_status(goal)
    session.commit()

    undo_today_streak_if_inactive(author_id, session)

    return {"message": "Registro apagado com sucesso"}
