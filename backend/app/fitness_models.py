from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime, Time, Numeric, Index, UniqueConstraint, JSON, case, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from .fitness_intensity import guess_intensity


class Exercise(Base):
    __tablename__ = "fitness_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    slug = Column(String(60), nullable=True, unique=True)
    name = Column(String(60), nullable=False)
    muscle_group = Column(String(20), nullable=False)
    equipment = Column(String(20), nullable=False)
    grip = Column(String(10), nullable=True)
    is_unilateral = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    family = Column(String(60), nullable=True, index=True)
    bodyweight_factor = Column(Numeric(3, 2), nullable=True)
    tracking = Column(String(10), nullable=False, default="reps", server_default="reps")
    intensity = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    muscles = relationship(
        "ExerciseMuscle",
        order_by=lambda: (
            case({"primary": 0, "secondary": 1}, value=ExerciseMuscle.role, else_=2),
            ExerciseMuscle.id,
        ),
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def is_custom(self) -> bool:
        return self.user_id is not None

    def muscle_list(self) -> list[dict]:
        return [{"muscle": item.muscle, "role": item.role} for item in self.muscles]

    @property
    def level(self) -> str | None:
        if (self.tracking or "reps") != "reps":
            return None
        return self.intensity or guess_intensity(self.muscle_group, self.muscle_list(), self.tracking)


class ExerciseIntensity(Base):
    __tablename__ = "fitness_exercise_intensities"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id", name="uq_fitness_exercise_intensities"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="CASCADE"), nullable=False)
    intensity = Column(String(10), nullable=False)


class ExerciseMuscle(Base):
    __tablename__ = "fitness_exercise_muscles"
    __table_args__ = (UniqueConstraint("exercise_id", "muscle", name="uq_fitness_exercise_muscles"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    muscle = Column(String(30), nullable=False)
    role = Column(String(10), nullable=False)


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
    cardio = relationship(
        "WorkoutCardio",
        order_by="(WorkoutCardio.phase.desc(), WorkoutCardio.position)",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkoutCardio(Base):
    __tablename__ = "fitness_workout_cardio"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workout_id = Column(ForeignKey("fitness_workouts.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="SET NULL"), nullable=True, index=True)
    phase = Column(String(5), nullable=False)
    position = Column(Integer, nullable=False)
    minutes = Column(Integer, nullable=False)

    exercise = relationship("Exercise", lazy="joined")


class WorkoutExercise(Base):
    __tablename__ = "fitness_workout_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workout_id = Column(ForeignKey("fitness_workouts.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    target_sets = Column(Integer, nullable=False)
    reps_min = Column(Integer, nullable=False)
    reps_max = Column(Integer, nullable=True)
    rest_seconds = Column(Integer, nullable=True)
    unilateral = Column(Boolean, nullable=True)
    load_mode = Column(String(5), nullable=True)
    superset = Column(Integer, nullable=True)
    set_plan = Column(JSON, nullable=True)

    exercise = relationship("Exercise", lazy="joined")


class WorkoutSession(Base):
    __tablename__ = "fitness_sessions"
    __table_args__ = (
        Index(
            "ix_fitness_sessions_one_active",
            "user_id",
            unique=True,
            sqlite_where=text("status = 'in_progress'"),
            postgresql_where=text("status = 'in_progress'"),
        ),
        Index("ix_fitness_sessions_user_started", "user_id", "started_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workout_id = Column(ForeignKey("fitness_workouts.id", ondelete="SET NULL"), nullable=True, index=True)
    gym_id = Column(ForeignKey("fitness_gyms.id", ondelete="SET NULL"), nullable=True, index=True)
    gym = relationship("Gym", lazy="joined")
    name = Column(String(60), nullable=False)
    status = Column(String(20), nullable=False, default="in_progress")
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    exercises = relationship(
        "SessionExercise",
        order_by="SessionExercise.position",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SessionExercise(Base):
    __tablename__ = "fitness_session_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(ForeignKey("fitness_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="SET NULL"), nullable=True, index=True)
    workout_exercise_id = Column(
        ForeignKey("fitness_workout_exercises.id", ondelete="SET NULL"), nullable=True
    )
    exercise_name = Column(String(60), nullable=False)
    muscle_group = Column(String(20), nullable=False)
    equipment = Column(String(20), nullable=False)
    position = Column(Integer, nullable=False)
    target_sets = Column(Integer, nullable=True)
    reps_min = Column(Integer, nullable=True)
    reps_max = Column(Integer, nullable=True)
    rest_seconds = Column(Integer, nullable=True)
    muscles = Column(JSON, nullable=True)
    note = Column(String(200), nullable=True)
    unilateral = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    tracking = Column(String(10), nullable=False, default="reps", server_default="reps")
    load_mode = Column(String(5), nullable=True)
    phase = Column(String(5), nullable=True)
    superset = Column(Integer, nullable=True)
    set_plan = Column(JSON, nullable=True)

    sets = relationship(
        "SetEntry",
        order_by="(SetEntry.position, SetEntry.id)",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SetEntry(Base):
    __tablename__ = "fitness_sets"
    __table_args__ = (
        UniqueConstraint("session_exercise_id", "client_id", name="uq_fitness_sets_client_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_exercise_id = Column(
        ForeignKey("fitness_session_exercises.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position = Column(Integer, nullable=False)
    weight_kg = Column(Numeric(6, 2), nullable=False)
    reps = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    client_id = Column(String(36), nullable=True)
    side = Column(String(5), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    distance_km = Column(Numeric(6, 2), nullable=True)
    speed_kmh = Column(Numeric(4, 1), nullable=True)
    level = Column(Integer, nullable=True)
    incline_pct = Column(Numeric(3, 1), nullable=True)
    calories = Column(Integer, nullable=True)
    rir = Column(Integer, nullable=True)
    kind = Column(String(12), nullable=False, default="normal", server_default="normal")
    stages = Column(JSON, nullable=True)
    stage_volume_kg = Column(Numeric(10, 2), nullable=False, default=0, server_default=text("0"))
    stage_reps = Column(Integer, nullable=False, default=0, server_default=text("0"))


class BodyWeightEntry(Base):
    __tablename__ = "fitness_body_weights"
    __table_args__ = (UniqueConstraint("user_id", "measured_on", name="uq_fitness_body_weights_user_day"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    measured_on = Column(Date, nullable=False)
    measured_time = Column(Time, nullable=True)
    weight_kg = Column(Numeric(5, 2), nullable=False)
    note = Column(String(140), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Plan(Base):
    __tablename__ = "fitness_plans"
    __table_args__ = (
        Index(
            "ix_fitness_plans_one_active",
            "user_id",
            unique=True,
            sqlite_where=text("is_active"),
            postgresql_where=text("is_active"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    days = relationship(
        "PlanDay",
        order_by="(PlanDay.weekday, PlanDay.position)",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class PlanDay(Base):
    __tablename__ = "fitness_plan_days"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(ForeignKey("fitness_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    workout_id = Column(ForeignKey("fitness_workouts.id", ondelete="CASCADE"), nullable=False, index=True)
    weekday = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False)

    workout = relationship("Workout", lazy="joined")


class FitnessProfile(Base):
    __tablename__ = "fitness_profiles"

    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    body_type = Column(String(10), nullable=False, default="male")
    username = Column(String(20), nullable=True, unique=True, index=True)
    current_gym_id = Column(ForeignKey("fitness_gyms.id", ondelete="SET NULL"), nullable=True)
    visibility = Column(String(10), nullable=False, default="friends", server_default="friends")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FitnessGoal(Base):
    __tablename__ = "fitness_goals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="CASCADE"), nullable=True, index=True)
    target_kg = Column(Numeric(6, 2), nullable=False)
    deadline = Column(Date, nullable=True)
    start_kg = Column(Numeric(6, 2), nullable=True)
    start_on = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Gym(Base):
    __tablename__ = "fitness_gyms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ExerciseGymSetting(Base):
    __tablename__ = "fitness_exercise_gym_settings"

    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    exercise_id = Column(ForeignKey("fitness_exercises.id", ondelete="CASCADE"), primary_key=True)
    gym_specific = Column(Boolean, nullable=False)



class Friendship(Base):
    __tablename__ = "fitness_friendships"
    __table_args__ = (UniqueConstraint("user_low_id", "user_high_id", name="uq_fitness_friendship_pair"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_low_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_high_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(10), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)


class UserBlock(Base):
    __tablename__ = "fitness_blocks"

    blocker_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserReport(Base):
    __tablename__ = "fitness_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reporter_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(String(20), nullable=False)
    details = Column(String(500), nullable=True)
    post_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Challenge(Base):
    __tablename__ = "fitness_challenges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    description = Column(String(300), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    metrics = Column(JSON, nullable=False)
    min_rule = Column(JSON, nullable=True)
    invite_code = Column(String(16), nullable=False, unique=True, index=True)
    hide_weight = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    allow_manual = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    members = relationship("ChallengeMember", cascade="all, delete-orphan", lazy="selectin")


class ChallengeMember(Base):
    __tablename__ = "fitness_challenge_members"

    challenge_id = Column(ForeignKey("fitness_challenges.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    joined_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ChallengeInvite(Base):
    __tablename__ = "fitness_challenge_invites"

    challenge_id = Column(ForeignKey("fitness_challenges.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    invited_by = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Post(Base):
    __tablename__ = "fitness_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(ForeignKey("fitness_sessions.id", ondelete="CASCADE"), nullable=True, unique=True)
    caption = Column(String(500), nullable=True)
    activity = Column(String(40), nullable=True)
    minutes = Column(Integer, nullable=True)
    performed_on = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    media = relationship("Media", order_by="Media.position", lazy="selectin")


class Media(Base):
    __tablename__ = "fitness_media"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id = Column(ForeignKey("fitness_posts.id", ondelete="CASCADE"), nullable=True, index=True)
    kind = Column(String(10), nullable=False, default="post")
    storage_key = Column(String(200), nullable=False, unique=True)
    content_type = Column(String(30), nullable=False)
    size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    full_key = Column(String(200), nullable=True)
    full_content_type = Column(String(30), nullable=True)
    full_width = Column(Integer, nullable=True)
    full_height = Column(Integer, nullable=True)
    position = Column(Integer, nullable=False, default=0)
    taken_on = Column(Date, nullable=True)
    note = Column(String(140), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PostReaction(Base):
    __tablename__ = "fitness_post_reactions"

    post_id = Column(ForeignKey("fitness_posts.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    kind = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PostComment(Base):
    __tablename__ = "fitness_post_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(ForeignKey("fitness_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Notification(Base):
    __tablename__ = "fitness_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(20), nullable=False)
    post_id = Column(ForeignKey("fitness_posts.id", ondelete="CASCADE"), nullable=True)
    challenge_id = Column(ForeignKey("fitness_challenges.id", ondelete="CASCADE"), nullable=True)
    comment_id = Column(ForeignKey("fitness_post_comments.id", ondelete="CASCADE"), nullable=True)
    detail = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
