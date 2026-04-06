from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas import GoalsSchema, EditGoalSchema, GoalResponseSchema
from app.database import get_db
from app.models import Goal, User, GoalStatus
from .tasks import check_and_reset_recurring_tasks
from .auth import get_current_user
from typing import Optional, List


goals_router = APIRouter(prefix='/goals', tags=['goals'])


@goals_router.post('/')
async def create_goal(goals_schema: GoalsSchema, current_user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    new_goal = Goal(title=goals_schema.title, description=goals_schema.description, deadline=goals_schema.deadline, user_id=current_user.id)
    session.add(new_goal)
    session.commit()
    session.refresh(new_goal)

    return new_goal


@goals_router.get('/', response_model=List[GoalResponseSchema])
async def list_goals(status: Optional[GoalStatus] = None, current_user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    check_and_reset_recurring_tasks(current_user.id, session)

    query = session.query(Goal).filter(Goal.user_id == current_user.id)

    if status is not None:
        query = query.filter(Goal.status == status)

    my_goals = query.all()

    return my_goals

@goals_router.put('/{goal_id}')
async def edit_goal(goal_id: int, edit_goal_schema: EditGoalSchema, current_user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    goal = session.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()

    if not goal:
        raise HTTPException(status_code=404, detail='Meta não encontrada ou não tem permissão para a alterar')

    if edit_goal_schema.title is not None:
        goal.title = edit_goal_schema.title
    if edit_goal_schema.description is not None:
        goal.description = edit_goal_schema.description
    if edit_goal_schema.deadline is not None:
        goal.deadline = edit_goal_schema.deadline
    if edit_goal_schema.status is not None:
        goal.status = edit_goal_schema.status

    session.commit()
    session.refresh(goal)

    return goal

@goals_router.delete('/{goal_id}')
async def delete_goal(goal_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    goal = session.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()

    if not goal:
        raise HTTPException(status_code=404, detail='Meta não encontrada ou não tem permissão para apagar')

    session.delete(goal)
    session.commit()
    
    return {"message": "Meta apagada com sucesso"}