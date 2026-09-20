from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from app.models import GoalStatus


class UserSchema(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)

    class Config:
        from_attributes = True


class UserResponseSchema(BaseModel):
    id: int
    email: EmailStr
    name: str

    class Config:
        from_attributes = True


class TokenSchema(BaseModel):
    refresh_token: str

    class Config:
        from_attributes = True


class GoalsSchema(BaseModel):
    title: str
    description: str | None = None
    deadline: datetime | None = None
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    recurrence_target: int | None = None

    class Config:
        from_attributes = True


class EditGoalSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    status: GoalStatus | None = None
    is_recurring: bool | None = None
    recurrence_interval_days: int | None = None
    recurrence_target: int | None = None

    class Config:
        from_attributes = True


class GoalResponseSchema(BaseModel):
    id: int
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    status: GoalStatus | None = None
    progress: float
    total_tasks: int
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    recurrence_target: int | None = None
    cycle_start_date: datetime | None = None
    cycle_ends_at: datetime | None = None
    current_cycle_progress: int | None = None

    class Config:
        from_attributes = True


class GoalCycleLogSchema(BaseModel):
    id: int
    cycle_start: datetime
    cycle_end: datetime
    target_count: int
    achieved_count: int
    completed: bool

    class Config:
        from_attributes = True


class TaskSchema(BaseModel):
    title: str
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    max_recurrences: int | None = None
    end_of_goal: bool = False

    class Config:
        from_attributes = True


class EditTaskSchema(BaseModel):
    title: str | None = None
    status: bool | None = None
    is_recurring: bool | None = None
    recurrence_interval_days: int | None = None
    max_recurrences: int | None = None

    class Config:
        from_attributes = True


class TaskResponseSchema(BaseModel):
    id: int
    goal_id: int
    title: str
    goal_title: str
    status: bool
    created_at: datetime | None = None
    is_recurring: bool
    recurrence_interval_days: int | None = None
    max_recurrences: int | None = None
    recurrence_count: int | None = None
    last_reset_date: datetime | None = None

    class Config:
        from_attributes = True


class TaskTodaySchema(TaskSchema):
    goal_id: int
    goal_title: str

    class Config:
        from_attributes = True


class GoogleTokenSchema(BaseModel):
    token: str


class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    token: str
    new_password: str = Field(min_length=6)
