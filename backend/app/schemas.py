from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models import GoalStatus


class UserSchema(BaseModel):
    name: str
    email: EmailStr
    password: str

    class Config:
        from_attributes = True


class LoginSchema(BaseModel):
    email: EmailStr
    password: str

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

    class Config:
        from_attributes = True


class EditGoalSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    status: GoalStatus | None = None

    class Config:
        from_attributes = True


class TaskSchema(BaseModel):
    title: str
    is_recurring: bool = False
    recurrence_interval_days: int | None = None
    max_recurrences: int | None = None

    class Config:
        from_attributes = True


class EditTaskschema(BaseModel):
    title: str | None = None
    status: bool | None = None
    is_recurring: bool | None = None
    recurrence_interval_days: int | None = None
    max_recurrences: int | None = None

    class Config:
        from_attributes = True