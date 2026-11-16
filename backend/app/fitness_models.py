from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Exercise(Base):
    __tablename__ = "fitness_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    slug = Column(String(60), nullable=True, unique=True)
    name = Column(String(60), nullable=False)
    muscle_group = Column(String(20), nullable=False)
    equipment = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def is_custom(self) -> bool:
        return self.user_id is not None


class Workout(Base):
    __tablename__ = "fitness_workouts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    description = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    exercises = relationship(
        "WorkoutExercise",
        order_by="WorkoutExercise.position",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkoutExercise(Base):
    __tablename__ = "fitness_workout_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workout_id = Column(ForeignKey("fitness_workouts.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    target_sets = Column(Integer, nullable=False)
    reps_min = Column(Integer, nullable=False)
    reps_max = Column(Integer, nullable=True)

    exercise = relationship("Exercise", lazy="joined")
