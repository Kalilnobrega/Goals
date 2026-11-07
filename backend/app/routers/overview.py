from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import GoalOverviewSchema
from .auth import get_current_user
from .goals import get_single_goal, list_goal_cycles, list_goal_entries
from .tasks import list_tasks_by_goal
from .groups import get_group
from .stats import numeric_summary
from .super_goals import list_super_goals

overview_router = APIRouter(prefix="/goals", tags=["goals"])


@overview_router.get("/{goal_id}/overview", response_model=GoalOverviewSchema)
async def get_goal_overview(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = await get_single_goal(goal_id, current_user, session)
    tasks = await list_tasks_by_goal(goal_id, current_user, session)
    cycles = await list_goal_cycles(goal_id, current_user, session)
    entries = await list_goal_entries(goal_id, current_user, session)
    super_goals = await list_super_goals(current_user, session)

    progress = None
    if goal.has_target and not goal.is_recurring:
        progress = numeric_summary(goal, datetime.now(timezone.utc))

    group = None
    if goal.group_id:
        group = await get_group(goal.group_id, current_user, session)

    return {
        "goal": goal,
        "tasks": tasks,
        "cycles": cycles,
        "entries": entries,
        "progress": progress,
        "group": group,
        "super_goals": super_goals,
    }
