import enum
from sqlalchemy import Column, Integer, String, ForeignKey, Enum, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = 'users'

    id = Column('id', Integer, primary_key=True, autoincrement=True, index=True)
    name = Column('name', String)
    email = Column('email', String, unique=True, index=True, nullable=False)
    password = Column('password', String)
    goals = relationship("Goal", back_populates="owner")


class GoalStatus(str, enum.Enum):
    OPEN = 'open'
    COMPLETED = 'completed'
    PAUSED = 'paused'


class Goal(Base):
    __tablename__ = 'goals'

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(ForeignKey('users.id'))
    title = Column(String(100), nullable=False)
    description = Column(String, nullable=True)
    status = Column(Enum(GoalStatus), default=GoalStatus.OPEN)
    create = Column(DateTime(timezone=True), server_default=func.now())
    deadline = Column(DateTime(timezone=True), nullable=True)
    owner = relationship("User", back_populates="goals")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")
    
    @property
    def progress(self) -> float:
        if not self.tasks:
            return 0.0

        total_points = 0
        completed_points = 0

        for task in self.tasks:
            if task.is_recurring and task.max_recurrences is not None:
                total_points += task.max_recurrences
                completed_points += task.recurrence_count
                
                if task.status == True and task.recurrence_count < task.max_recurrences:
                    completed_points += 1
            elif task.is_recurring and task.max_recurrences is None:
                total_points += 1
                if task.status == True:
                    completed_points += 1
            else:
                total_points += 1
                if task.status == True:
                    completed_points += 1
        if total_points == 0:
            return 0.0

        percentage = (completed_points / total_points) * 100
        return min(round(percentage, 1), 100.0)


class Task(Base):
    __tablename__ = 'tasks'

    id = Column('id', Integer, primary_key=True, autoincrement=True)
    goals_id = Column('goals_id', ForeignKey('goals.id'))
    title = Column('title', String(50), nullable=False)
    status = Column('status', Boolean, default=False)
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