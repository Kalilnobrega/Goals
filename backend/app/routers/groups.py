import secrets
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Goal,
    User,
    GoalGroup,
    GroupMember,
    GroupInvite,
    GroupKind,
    GroupRole,
)
from app.schemas import (
    CreateGroupSchema,
    GroupResponseSchema,
    GroupInviteSchema,
    InvitePreviewSchema,
    InviteAcceptSchema,
    MemberRoleSchema,
    TransferLeadershipSchema,
)
from app.access import (
    EDITOR_ROLES,
    MEMBER_LIMIT,
    find_member,
    next_goal_position,
)
from app.sharing import remove_member, set_leader, copy_challenge_goal
from .auth import get_current_user
from .tasks import (
    is_late,
    to_aware_utc,
    check_and_reset_recurring_goals,
    check_and_reset_recurring_tasks,
)

groups_router = APIRouter(prefix="/groups", tags=["groups"])

INVITE_LIFETIME = timedelta(days=7)
ROLE_ORDER = {GroupRole.LEADER: 0, GroupRole.MODERATOR: 1, GroupRole.MEMBER: 2}
FAR_FUTURE = datetime.max.replace(tzinfo=timezone.utc)


def get_membership(group_id: int, user: User, session: Session) -> GroupMember:
    member = (
        session.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return member


def get_target(group: GoalGroup, user_id: int) -> GroupMember:
    target = find_member(group, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Participante não encontrado")
    return target


def get_valid_invite(token: str, session: Session) -> GroupInvite:
    invite = session.query(GroupInvite).filter(GroupInvite.token == token).first()
    if not invite or to_aware_utc(invite.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Convite inválido ou expirado.")
    return invite


def leader_goal(group: GoalGroup) -> Goal:
    if group.kind == GroupKind.COLLABORATIVE:
        return group.goals[0]
    leader = next(m for m in group.members if m.role == GroupRole.LEADER)
    return next(g for g in group.goals if g.user_id == leader.user_id)


def group_detail(group: GoalGroup, user: User, session: Session) -> dict:
    me = find_member(group, user.id)
    copies = {goal.user_id: goal for goal in group.goals}

    if group.kind == GroupKind.CHALLENGE:
        for member in group.members:
            if member.user_id != user.id:
                check_and_reset_recurring_goals(member.user_id, session)
                check_and_reset_recurring_tasks(member.user_id, session)
        goal = copies[user.id]
    else:
        goal = group.goals[0]

    members = []
    for member in group.members:
        row = {
            "user_id": member.user_id,
            "name": member.user.name,
            "role": member.role,
            "joined_at": member.joined_at,
            "is_me": member.user_id == user.id,
        }
        copy = copies.get(member.user_id) if group.kind == GroupKind.CHALLENGE else None
        if copy:
            row.update(
                goal_id=copy.id,
                progress=copy.progress,
                status=copy.status,
                completed_at=copy.completed_at,
            )
        members.append(row)

    if group.kind == GroupKind.CHALLENGE:
        members.sort(
            key=lambda m: (
                -(m["progress"] or 0),
                to_aware_utc(m["completed_at"]) if m["completed_at"] else FAR_FUTURE,
            )
        )
    else:
        members.sort(key=lambda m: ROLE_ORDER[m["role"]])

    return {
        "id": group.id,
        "kind": group.kind,
        "my_role": me.role,
        "goal_id": goal.id,
        "goal_title": goal.title,
        "deadline": goal.deadline,
        "finished": bool(
            goal.deadline and is_late(goal.deadline, datetime.now(timezone.utc))
        ),
        "member_limit": MEMBER_LIMIT,
        "members": members,
    }


@groups_router.post("/", response_model=GroupResponseSchema)
async def create_group(
    payload: CreateGroupSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    goal = (
        session.query(Goal)
        .filter(Goal.id == payload.goal_id, Goal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    if goal.group_id:
        raise HTTPException(status_code=400, detail="Essa meta já é compartilhada.")

    group = GoalGroup(kind=payload.kind)
    group.members.append(
        GroupMember(
            user_id=current_user.id,
            role=GroupRole.LEADER,
            position=goal.position,
            joined_at=datetime.now(timezone.utc),
        )
    )
    goal.group = group
    if payload.kind == GroupKind.CHALLENGE:
        for task in goal.tasks:
            task.group_task_key = str(uuid.uuid4())

    session.add(group)
    session.commit()
    session.refresh(group)

    return group_detail(group, current_user, session)


@groups_router.get("/invites/{token}", response_model=InvitePreviewSchema)
async def preview_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    group = get_valid_invite(token, session).group
    goal = leader_goal(group)
    leader = next(m for m in group.members if m.role == GroupRole.LEADER)
    me = find_member(group, current_user.id)

    goal_id = None
    if me:
        goal_id = (
            goal.id
            if group.kind == GroupKind.COLLABORATIVE
            else next(g.id for g in group.goals if g.user_id == current_user.id)
        )

    return {
        "kind": group.kind,
        "goal_title": goal.title,
        "leader_name": leader.user.name,
        "member_count": len(group.members),
        "member_limit": MEMBER_LIMIT,
        "is_member": me is not None,
        "goal_id": goal_id,
    }


@groups_router.post("/invites/{token}/accept", response_model=InviteAcceptSchema)
async def accept_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    group = get_valid_invite(token, session).group

    if find_member(group, current_user.id):
        if group.kind == GroupKind.COLLABORATIVE:
            return {"goal_id": group.goals[0].id}
        return {
            "goal_id": next(g.id for g in group.goals if g.user_id == current_user.id)
        }

    if len(group.members) >= MEMBER_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Essa meta já atingiu o limite de {MEMBER_LIMIT} participantes.",
        )

    position = next_goal_position(current_user.id, session)
    template = leader_goal(group)

    group.members.append(
        GroupMember(
            user_id=current_user.id,
            role=GroupRole.MEMBER,
            position=position,
            joined_at=datetime.now(timezone.utc),
        )
    )

    if group.kind == GroupKind.CHALLENGE:
        goal = copy_challenge_goal(template, current_user.id, position)
        session.add(goal)
    else:
        goal = template

    session.commit()
    session.refresh(goal)

    return {"goal_id": goal.id}


@groups_router.get("/{group_id}", response_model=GroupResponseSchema)
async def get_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    member = get_membership(group_id, current_user, session)
    return group_detail(member.group, current_user, session)


@groups_router.post("/{group_id}/invites", response_model=GroupInviteSchema)
async def create_invite(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    member = get_membership(group_id, current_user, session)
    if member.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=403, detail="Só o líder e os moderadores podem convidar."
        )

    invite = GroupInvite(
        group_id=group_id,
        token=secrets.token_urlsafe(24),
        expires_at=datetime.now(timezone.utc) + INVITE_LIFETIME,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)

    return invite


@groups_router.patch("/{group_id}/members/{user_id}", response_model=GroupResponseSchema)
async def change_member_role(
    group_id: int,
    user_id: int,
    payload: MemberRoleSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    member = get_membership(group_id, current_user, session)
    if member.role != GroupRole.LEADER:
        raise HTTPException(
            status_code=403, detail="Só o líder pode mudar os cargos."
        )

    target = get_target(member.group, user_id)
    if target.role == GroupRole.LEADER:
        raise HTTPException(
            status_code=400,
            detail="Para deixar de ser líder, transfira a liderança para outra pessoa.",
        )

    target.role = payload.role
    session.commit()

    return group_detail(member.group, current_user, session)


@groups_router.post("/{group_id}/transfer", response_model=GroupResponseSchema)
async def transfer_leadership(
    group_id: int,
    payload: TransferLeadershipSchema,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    member = get_membership(group_id, current_user, session)
    if member.role != GroupRole.LEADER:
        raise HTTPException(
            status_code=403, detail="Só o líder pode transferir a liderança."
        )

    target = get_target(member.group, payload.user_id)
    if target is member:
        raise HTTPException(status_code=400, detail="Você já é o líder.")

    member.role = GroupRole.MODERATOR
    set_leader(member.group, target)
    session.commit()

    return group_detail(member.group, current_user, session)


@groups_router.delete("/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    member = get_membership(group_id, current_user, session)
    group = member.group
    target = get_target(group, user_id)

    if target is not member:
        allowed = member.role == GroupRole.LEADER or (
            member.role == GroupRole.MODERATOR and target.role == GroupRole.MEMBER
        )
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="Você não tem permissão para remover essa pessoa.",
            )

    remove_member(group, target, session)
    session.commit()

    if target is member:
        return {"message": "Você saiu da meta"}
    return {"message": "Participante removido"}
