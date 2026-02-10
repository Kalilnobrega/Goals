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
  
class Task(Base):
    __tablename__ = 'tasks'

    id = Column('id', Integer, primary_key=True, autoincrement=True)
    goals_id = Column('goals_id', ForeignKey('goals.id'))
    title = Column('title', String(50), nullable=False)
    status = Column('status', Boolean, default=False)
    goal = relationship("Goal", back_populates="tasks")

