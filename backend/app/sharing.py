from sqlalchemy.orm import Session
from app.models import (
    Goal,
    Task,
    GoalGroup,
    GroupMember,
    GroupKind,
    GroupRole,
    GoalStatus,
)


def detach_goal(goal: Goal):
    goal.group = None
    for task in goal.tasks:
        task.group_task_key = None


def pick_successor(members: list[GroupMember]) -> GroupMember:
    moderators = [m for m in members if m.role == GroupRole.MODERATOR]
    return (moderators or members)[0]


def set_leader(group: GoalGroup, member: GroupMember):
    member.role = GroupRole.LEADER
    if group.kind == GroupKind.COLLABORATIVE:
        for goal in group.goals:
            goal.user_id = member.user_id


def remove_member(group: GoalGroup, member: GroupMember, session: Session):
    leaving_leader = member.role == GroupRole.LEADER

    if group.kind == GroupKind.CHALLENGE:
        copy = next((g for g in group.goals if g.user_id == member.user_id), None)
        if copy:
            detach_goal(copy)

    group.members.remove(member)

    if not group.members:
        if group.kind == GroupKind.COLLABORATIVE:
            for goal in list(group.goals):
                session.delete(goal)
        session.delete(group)
        return

    if leaving_leader:
        set_leader(group, pick_successor(group.members))


def delete_shared_goal(goal: Goal, session: Session):
    group = goal.group
    for other in list(group.goals):
        if other is not goal:
            detach_goal(other)
    session.delete(goal)
    session.delete(group)


def copy_challenge_goal(template: Goal, user_id: int, position: int) -> Goal:
    goal = Goal(
        user_id=user_id,
        group_id=template.group_id,
        position=position,
        title=template.title,
        description=template.description,
        status=GoalStatus.OPEN,
        deadline=template.deadline,
        is_recurring=template.is_recurring,
        recurrence_interval_days=template.recurrence_interval_days,
        recurrence_target=template.recurrence_target,
        cycle_start_date=template.cycle_start_date,
        target_value=template.target_value,
        start_value=template.start_value,
        unit=template.unit,
        numeric_mode=template.numeric_mode,
    )
    for task in template.tasks:
        goal.tasks.append(
            Task(
                title=task.title,
                status=False,
                is_recurring=task.is_recurring,
                recurrence_interval_days=task.recurrence_interval_days,
                recurrence_weekdays=task.recurrence_weekdays,
                max_recurrences=task.max_recurrences,
                recurrence_count=0,
                last_reset_date=task.last_reset_date,
                position=task.position,
                group_task_key=task.group_task_key,
            )
        )
    return goal
