from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Enum, Boolean
from sqlalchemy.orm import declarative_base
import enum

db = create_engine('sqlite:///banco.db') 

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column('id', Integer, primary_key=True, autoincrement=True)
    name = Column('name', String)
    email = Column('email', String, unique=True, nullable=False)
    password = Column('password', String)

    def __init__(self, name, email, password):
        self.name = name
        self.email = email
        self.password = password

class GoalStatus(enum.Enum):
    OPEN = 'open'
    COMPLETED = 'completed'
    PAUSED = 'paused'

class Goal(Base):
    __tablename__ = 'goals'

    id = Column('id', Integer, primary_key=True, autoincrement=True)
    user_id = Column('user_id', ForeignKey('users.id'))
    title = Column('title', String(50), nullable=False)
    description = Column('description', String, nullable=True)
    status = Column('status', Enum(GoalStatus), default=GoalStatus.OPEN)

    def __init__(self, title, description, status):
        self.title = title
        self.description = description
        self.status = status

    
class Task(Base):
    __tablename__ = 'tasks'

    id = Column('id', Integer, primary_key=True, autoincrement=True)
    goals_id = Column('goals_id', ForeignKey('goals.id'))
    title = Column('title', String(50), nullable=False)
    status = Column('status', Boolean, default=True)

    def __init__(self, title, status):
        self.title = title
        self.status = status




