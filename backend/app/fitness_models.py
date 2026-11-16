from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
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
