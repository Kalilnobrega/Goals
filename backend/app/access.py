from fastapi import HTTPException
from sqlalchemy import or_, and_, select, func
from sqlalchemy.orm import Session
from app.models import (
    Goal,
    Task,
    GoalGroup,
    GroupMember,
    GroupKind,
    GroupRole,
    TaskCompletion,
    GoalEntry,
    User,
)

EDITOR_ROLES = (GroupRole.LEADER, GroupRole.MODERATOR)
MEMBER_LIMIT = 20


def collaborative_goal_ids(user_id: int):
    return (
        select(Goal.id)
        .join(GoalGroup, GoalGroup.id == Goal.group_id)
        .join(GroupMember, GroupMember.group_id == GoalGroup.id)
        .where(
            GroupMember.user_id == user_id,
            GoalGroup.kind == GroupKind.COLLABORATIVE,
        )
    )


def member_goal_filter(user_id: int):
    return or_(Goal.user_id == user_id, Goal.id.in_(collaborative_goal_ids(user_id)))


def completion_by(user_id: int):
    return or_(
        TaskCompletion.user_id == user_id,
        and_(TaskCompletion.user_id.is_(None), Goal.user_id == user_id),
    )


def entry_by(user_id: int):
    return or_(
        GoalEntry.user_id == user_id,
        and_(GoalEntry.user_id.is_(None), Goal.user_id == user_id),
    )


def is_collaborative(goal: Goal) -> bool:
    return goal.group is not None and goal.group.kind == GroupKind.COLLABORATIVE


def is_challenge(goal: Goal) -> bool:
    return goal.group is not None and goal.group.kind == GroupKind.CHALLENGE


def find_member(group: GoalGroup, user_id: int) -> GroupMember | None:
    return next((m for m in group.members if m.user_id == user_id), None)


def goal_permissions(goal: Goal, user_id: int) -> dict | None:
    if goal.group is None:
        if goal.user_id != user_id:
            return None
        return {
            "role": None,
            "edit": True,
            "act": True,
            "delete": True,
            "complete": True,
        }

    member = find_member(goal.group, user_id)
    if member is None:
        return None

    editor = member.role in EDITOR_ROLES
    leader = member.role == GroupRole.LEADER

    if goal.group.kind == GroupKind.COLLABORATIVE:
        return {
            "role": member.role,
            "edit": editor,
            "act": True,
            "delete": leader,
            "complete": editor,
        }

    own = goal.user_id == user_id
    return {
        "role": member.role,
        "edit": editor and own,
        "act": own,
        "delete": leader and own,
        "complete": own,
    }


def annotate_goal(goal: Goal, perms: dict, user_id: int) -> Goal:
    goal.group_kind = goal.group.kind.value if goal.group else None
    goal.my_role = perms["role"].value if perms["role"] else None
    goal.can_edit = perms["edit"]
    goal.can_act = perms["act"]
    goal.can_delete = perms["delete"]
    goal.can_complete = perms["complete"]
    goal.is_mine = goal.user_id == user_id
    goal.owner_name = goal.owner.name if goal.owner else None
    goal.member_count = len(goal.group.members) if goal.group else None
    return goal


def get_goal_with_access(
    goal_id: int, user: User, session: Session, need: str = "view"
) -> Goal:
    goal = session.query(Goal).filter(Goal.id == goal_id).first()
    perms = goal_permissions(goal, user.id) if goal else None
    if perms is None:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    if need != "view" and not perms[need]:
        raise HTTPException(
            status_code=403, detail="Você não tem permissão para fazer isso nesta meta."
        )
    return annotate_goal(goal, perms, user.id)


def get_task_with_access(
    task_id: int, user: User, session: Session, need: str = "view"
) -> Task:
    task = session.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    try:
        get_goal_with_access(task.goals_id, user, session, need)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        raise
    return task


def goal_copies(goal: Goal) -> list[Goal]:
    if is_challenge(goal):
        return list(goal.group.goals)
    return [goal]


def task_copies(task: Task) -> list[Task]:
    if not task.group_task_key or not is_challenge(task.goal):
        return [task]
    return [
        copy
        for goal in task.goal.group.goals
        for copy in goal.tasks
        if copy.group_task_key == task.group_task_key
    ]


def collaborative_positions(user_id: int, session: Session) -> dict[int, int]:
    rows = (
        session.query(Goal.id, GroupMember.position)
        .join(GoalGroup, GoalGroup.id == Goal.group_id)
        .join(GroupMember, GroupMember.group_id == GoalGroup.id)
        .filter(
            GroupMember.user_id == user_id,
            GoalGroup.kind == GroupKind.COLLABORATIVE,
        )
        .all()
    )
    return {goal_id: position for goal_id, position in rows}


def sort_for_user(goals: list[Goal], user_id: int, session: Session) -> list[Goal]:
    positions = collaborative_positions(user_id, session)
    return sorted(goals, key=lambda goal: (positions.get(goal.id, goal.position), goal.id))


def next_goal_position(user_id: int, session: Session) -> int:
    own = (
        session.query(func.max(Goal.position)).filter(Goal.user_id == user_id).scalar()
    )
    shared = max(collaborative_positions(user_id, session).values(), default=None)
    values = [value for value in (own, shared) if value is not None]
    return max(values) + 1 if values else 0
