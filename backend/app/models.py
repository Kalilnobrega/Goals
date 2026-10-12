import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Enum,
    Boolean,
    DateTime,
    Date,
    Float,
    JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from datetime import timedelta, timezone
from app.dates import today_br, count_weekdays


def _aware_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column("id", Integer, primary_key=True, autoincrement=True, index=True)
    name = Column("name", String)
    email = Column("email", String, unique=True, index=True, nullable=False)
    password = Column("password", String)
    is_verify = Column("is_verify", Boolean, default=False)
    goals = relationship("Goal", back_populates="owner")
    streak = relationship("Streak", back_populates="user", uselist=False)


class GoalStatus(str, enum.Enum):
    OPEN = "open"
    COMPLETED = "completed"
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
    is_recurring = Column(Boolean, default=False)
    recurrence_interval_days = Column(Integer, nullable=True)
    recurrence_target = Column(Integer, nullable=True)
    cycle_start_date = Column(DateTime(timezone=True), nullable=True)
    target_value = Column(Float, nullable=True)
    start_value = Column(Float, nullable=True)
    unit = Column(String(20), nullable=True)
    numeric_mode = Column(String(10), nullable=True)
    owner = relationship("User", back_populates="goals")
    entries = relationship(
        "GoalEntry",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalEntry.created_at.desc()",
    )
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")
    cycle_logs = relationship(
        "GoalCycleLog",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalCycleLog.cycle_start.desc()",
    )

    @property
    def total_tasks(self) -> int:
        return len(self.tasks)

    @property
    def is_numeric(self) -> bool:
        return self.target_value is not None

    @property
    def current_value(self) -> float | None:
        if not self.is_numeric:
            return None

        if self.numeric_mode == "latest":
            if self.entries:
                return self.entries[0].value
            return self.start_value

        if self.is_recurring:
            if not self.cycle_start_date:
                return 0.0
            start = _aware_utc(self.cycle_start_date)
            return sum(
                entry.value
                for entry in self.entries
                if _aware_utc(entry.created_at) >= start
            )

        return (self.start_value or 0.0) + sum(entry.value for entry in self.entries)

    def _numeric_progress(self) -> float:
        start = 0.0 if self.is_recurring else (self.start_value or 0.0)
        current = self.current_value
        if current is None or self.target_value == start:
            return 100.0 if current == self.target_value else 0.0

        ratio = (current - start) / (self.target_value - start)
        return min(max(round(ratio * 100, 1), 0.0), 100.0)

    @property
    def cycle_ends_at(self):
        if not self.is_recurring or not self.cycle_start_date or not self.recurrence_interval_days:
            return None
        return _aware_utc(self.cycle_start_date) + timedelta(days=self.recurrence_interval_days)

    @property
    def current_cycle_progress(self) -> int | None:
        if not self.is_recurring or not self.cycle_start_date:
            return None

        start = _aware_utc(self.cycle_start_date)
        return sum(
            1
            for task in self.tasks
            for completion in task.completions
            if _aware_utc(completion.completed_at) >= start
        )

    @property
    def days_remaining(self) -> int:
        if not self.deadline:
            return None

        return (self.deadline.date() - today_br()).days

    @property
    def progress(self) -> float:
        if self.is_numeric:
            return self._numeric_progress()

        if self.is_recurring:
            target = self.recurrence_target or 1
            current = self.current_cycle_progress or 0
            if target <= 0:
                return 0.0
            return min(round((current / target) * 100, 1), 100.0)

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

                    if task.recurrence_weekdays:
                        task_total = max(
                            count_weekdays(start, end, task.recurrence_weekdays), 1
                        )
                    else:
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
    recurrence_weekdays = Column(JSON, nullable=True)
    max_recurrences = Column(Integer, nullable=True)
    recurrence_count = Column(Integer, default=0)
    last_reset_date = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(Date, nullable=True)
    goal = relationship("Goal", back_populates="tasks")
    completions = relationship(
        "TaskCompletion", back_populates="task", cascade="all, delete-orphan"
    )


class TaskCompletion(Base):
    __tablename__ = "task_completions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(ForeignKey("tasks.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())
    task = relationship("Task", back_populates="completions")


class GoalCycleLog(Base):
    __tablename__ = "goal_cycle_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    goal_id = Column(ForeignKey("goals.id"), nullable=False)
    cycle_start = Column(DateTime(timezone=True), nullable=False)
    cycle_end = Column(DateTime(timezone=True), nullable=False)
    target_count = Column(Integer, nullable=False)
    achieved_count = Column(Integer, nullable=False)
    target_value = Column(Float, nullable=True)
    achieved_value = Column(Float, nullable=True)
    completed = Column(Boolean, nullable=False)
    goal = relationship("Goal", back_populates="cycle_logs")


class GoalEntry(Base):
    __tablename__ = "goal_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    goal_id = Column(ForeignKey("goals.id"), nullable=False, index=True)
    value = Column(Float, nullable=False)
    note = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    goal = relationship("Goal", back_populates="entries")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    revoked = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    user = relationship("User")


class Streak(Base):
    __tablename__ = "streaks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id"), unique=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    longest_before_today = Column(Integer, nullable=True)
    last_activity = Column(Date, nullable=True)
    user = relationship("User", back_populates="streak")
