from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Literal
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


def validate_weekdays(value):
    if value is None:
        return value
    if any(day < 0 or day > 6 for day in value):
        raise ValueError("dias da semana devem estar entre 0 (segunda) e 6 (domingo)")
    return sorted(set(value))


class GoalsSchema(BaseModel):
    title: str
    description: str | None = None
    deadline: datetime | None = None
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    recurrence_target: int | None = None
    target_value: float | None = None
    start_value: float | None = None
    unit: str | None = Field(default=None, max_length=20)
    numeric_mode: Literal["sum", "latest"] | None = None

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
    target_value: float | None = None
    start_value: float | None = None
    unit: str | None = Field(default=None, max_length=20)

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
    is_numeric: bool = False
    target_value: float | None = None
    start_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    numeric_mode: str | None = None

    class Config:
        from_attributes = True


class GoalCycleLogSchema(BaseModel):
    id: int
    cycle_start: datetime
    cycle_end: datetime
    target_count: int
    achieved_count: int
    target_value: float | None = None
    achieved_value: float | None = None
    completed: bool

    class Config:
        from_attributes = True


class GoalEntrySchema(BaseModel):
    value: float
    note: str | None = Field(default=None, max_length=100)


class GoalEntryResponseSchema(BaseModel):
    id: int
    value: float
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TaskSchema(BaseModel):
    title: str
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    recurrence_weekdays: list[int] | None = None
    max_recurrences: int | None = None
    end_of_goal: bool = False

    _check_weekdays = field_validator("recurrence_weekdays")(validate_weekdays)

    class Config:
        from_attributes = True


class EditTaskSchema(BaseModel):
    title: str | None = None
    status: bool | None = None
    is_recurring: bool | None = None
    recurrence_interval_days: int | None = None
    recurrence_weekdays: list[int] | None = None
    max_recurrences: int | None = None

    _check_weekdays = field_validator("recurrence_weekdays")(validate_weekdays)

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
    recurrence_weekdays: list[int] | None = None
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
