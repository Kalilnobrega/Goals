import enum
from sqlalchemy import Column, Integer, String, ForeignKey, Enum, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from datetime import date


class User(Base):
    __tablename__ = "users"

    id = Column("id", Integer, primary_key=True, autoincrement=True, index=True)
    name = Column("name", String)
    email = Column("email", String, unique=True, index=True, nullable=False)
    password = Column("password", String)
    goals = relationship("Goal", back_populates="owner")


class GoalStatus(str, enum.Enum):
    OPEN = "open"
    COMPLETED = "completed"
    PAUSED = "paused"
    LATE = "late"


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(ForeignKey("users.id"))
    title = Column(String(100), nullable=False)
    description = Column(String, nullable=True)
    status = Column(Enum(GoalStatus), default=GoalStatus.OPEN)
    create = Column(DateTime(timezone=True), server_default=func.now())
    deadline = Column(DateTime(timezone=True), nullable=True)
    owner = relationship("User", back_populates="goals")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")

    @property
    def total_tasks(self) -> int:
        return len(self.tasks)

    @property
    def days_remaining(self) -> int:
        if not self.deadline:
            return None

        return (self.deadline.date() - date.today()).days

    @property
    def progress(self) -> float:
        if not self.tasks:
            return 0.0

        total_base_tasks = len(self.tasks)
        weight_per_task = 100.0 / total_base_tasks
        percentage = 0.0

        for task in self.tasks:
            task_pct = 0.0

            if task.is_recurring and task.max_recurrences is not None:
                total_steps = task.max_recurrences
                completed = task.recurrence_count or 0  # Blindagem adicionada

                if task.status == True and completed < total_steps:
                    completed += 1

                if total_steps > 0:
                    task_pct = completed / total_steps

            elif task.is_recurring and task.max_recurrences is None:
                task_total = 1

                if self.deadline and task.created_at:
                    end = (
                        self.deadline.date()
                        if hasattr(self.deadline, "date")
                        else self.deadline
                    )
                    start = (
                        task.created_at.date()
                        if hasattr(task.created_at, "date")
                        else task.created_at
                    )

                    total_days = (end - start).days
                    if total_days < 0:
                        total_days = 0

                    interval = task.recurrence_interval_days or 1
                    task_total = (total_days // interval) + 1

                else:
                    task_total = (task.recurrence_count or 0) + 1

                completed = task.recurrence_count or 0

                if task.status == True and completed < task_total:
                    completed += 1

                if task_total > 0:
                    task_pct = completed / task_total

            else:
                if task.status == True:
                    task_pct = 1.0

            percentage += task_pct * weight_per_task

        return min(round(percentage, 1), 100.0)


class Task(Base):
    __tablename__ = "tasks"

    id = Column("id", Integer, primary_key=True, autoincrement=True)
    goals_id = Column("goals_id", ForeignKey("goals.id"))
    title = Column("title", String(50), nullable=False)
    status = Column("status", Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    is_recurring = Column(Boolean, default=False)
    recurrence_interval_days = Column(Integer, nullable=True)
    max_recurrences = Column(Integer, nullable=True)
    recurrence_count = Column(Integer, default=0)
    last_reset_date = Column(DateTime(timezone=True), server_default=func.now())
    goal = relationship("Goal", back_populates="tasks")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    revoked = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    user = relationship("User")
