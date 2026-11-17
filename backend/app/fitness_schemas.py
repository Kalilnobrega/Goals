from typing import Literal
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MuscleGroup = Literal[
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "quads",
    "hamstrings",
    "calves",
    "adductors",
    "glutes",
    "abs",
    "cardio",
    "other",
]

Equipment = Literal[
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "smith",
    "bodyweight",
    "kettlebell",
    "band",
    "other",
]


def clean_name(value: str, message: str = "Dê um nome para o exercício.") -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError(message)
    return value


class ExerciseSchema(BaseModel):
    name: str = Field(max_length=60)
    muscle_group: MuscleGroup
    equipment: Equipment

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return clean_name(value)


class EditExerciseSchema(BaseModel):
    name: str | None = Field(default=None, max_length=60)
    muscle_group: MuscleGroup | None = None
    equipment: Equipment | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        return None if value is None else clean_name(value)


class ExerciseResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str
    equipment: str
    is_custom: bool


class WorkoutExerciseSchema(BaseModel):
    exercise_id: int
    target_sets: int = Field(ge=1, le=20)
    reps_min: int = Field(ge=1, le=100)
    reps_max: int | None = Field(default=None, ge=1, le=100)
    rest_seconds: int | None = Field(default=None, ge=0, le=900)

    @model_validator(mode="after")
    def reps_range(self):
        if self.rest_seconds == 0:
            self.rest_seconds = None
        if self.reps_max is not None:
            if self.reps_max < self.reps_min:
                raise ValueError("O máximo de repetições não pode ser menor que o mínimo.")
            if self.reps_max == self.reps_min:
                self.reps_max = None
        return self


class WorkoutSchema(BaseModel):
    name: str = Field(max_length=60)
    description: str | None = Field(default=None, max_length=300)
    exercises: list[WorkoutExerciseSchema] = Field(default_factory=list, max_length=40)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return clean_name(value, "Dê um nome para a ficha.")

    @field_validator("description")
    @classmethod
    def description_blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class WorkoutExerciseResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise: ExerciseResponseSchema
    target_sets: int
    reps_min: int
    reps_max: int | None
    rest_seconds: int | None


class WorkoutResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    exercises: list[WorkoutExerciseResponseSchema]
    updated_at: datetime | None


class StartSessionSchema(BaseModel):
    workout_id: int | None = None


class AddSessionExerciseSchema(BaseModel):
    exercise_id: int


class ReorderSessionSchema(BaseModel):
    exercise_ids: list[int]


class EditSessionExerciseSchema(BaseModel):
    exercise_id: int | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=900)


class SetSchema(BaseModel):
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(ge=1, le=1000)
    client_id: str | None = Field(default=None, min_length=8, max_length=36, pattern=r"^[A-Za-z0-9-]+$")


class EditSetSchema(BaseModel):
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    reps: int | None = Field(default=None, ge=1, le=1000)


class FinishSessionSchema(BaseModel):
    completed_at: datetime | None = None


class SetResponseSchema(BaseModel):
    id: int
    position: int
    weight_kg: float
    reps: int
    created_at: datetime
    client_id: str | None = None


class PreviousSetSchema(BaseModel):
    weight_kg: float
    reps: int


class SessionExerciseResponseSchema(BaseModel):
    id: int
    exercise_id: int | None
    exercise_name: str
    muscle_group: str
    equipment: str
    target_sets: int | None
    reps_min: int | None
    reps_max: int | None
    rest_seconds: int | None
    sets: list[SetResponseSchema]
    previous: list[PreviousSetSchema]
    previous_at: datetime | None


class SessionHistoryItemSchema(BaseModel):
    id: int
    workout_id: int | None
    name: str
    started_at: datetime
    completed_at: datetime
    exercise_count: int
    total_sets: int
    volume_kg: float
    muscle_groups: list[str]


class SessionHistorySchema(BaseModel):
    items: list[SessionHistoryItemSchema]
    total: int
    has_more: bool


class SessionResponseSchema(BaseModel):
    id: int
    workout_id: int | None
    name: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    last_activity_at: datetime
    total_sets: int
    volume_kg: float
    exercises: list[SessionExerciseResponseSchema]


class ProgressExerciseSchema(BaseModel):
    exercise_id: int
    name: str
    muscle_group: str
    equipment: str
    sessions: int
    last_at: datetime
    best_weight_kg: float
    max_reps: int


class ProgressPointSchema(BaseModel):
    session_id: int
    session_name: str
    completed_at: datetime
    sets: int
    max_weight_kg: float
    reps_at_max: int
    max_reps: int
    estimated_1rm_kg: float | None
    volume_kg: float


class ExerciseProgressSchema(BaseModel):
    exercise_id: int
    name: str
    muscle_group: str
    equipment: str
    points: list[ProgressPointSchema]


class BodyWeightSchema(BaseModel):
    weight_kg: float = Field(ge=20, le=400)
    measured_on: date | None = None
    note: str | None = Field(default=None, max_length=140)

    @field_validator("note")
    @classmethod
    def clean_note(cls, value):
        if value is None:
            return None
        value = value.strip()
        return value or None


class EditBodyWeightSchema(BaseModel):
    weight_kg: float | None = Field(default=None, ge=20, le=400)
    measured_on: date | None = None
    note: str | None = Field(default=None, max_length=140)

    @field_validator("note")
    @classmethod
    def clean_note(cls, value):
        if value is None:
            return None
        value = value.strip()
        return value or None


class BodyWeightResponseSchema(BaseModel):
    id: int
    measured_on: date
    weight_kg: float
    note: str | None


class OverviewActiveSchema(BaseModel):
    id: int
    name: str
    started_at: datetime
    total_sets: int


class OverviewPlannedSchema(BaseModel):
    workout_id: int
    name: str
    done: bool


class OverviewDaySessionSchema(BaseModel):
    id: int
    name: str


class OverviewDaySchema(BaseModel):
    date: date
    sessions: int
    trained: list[OverviewDaySessionSchema] = []
    planned: list[OverviewPlannedSchema] = []


class OverviewWeekSchema(BaseModel):
    days: list[OverviewDaySchema]
    sessions: int
    sets: int
    volume_kg: float
    minutes: int


class OverviewWorkoutSchema(BaseModel):
    id: int
    name: str
    exercise_count: int
    muscle_groups: list[str]
    last_done_at: datetime | None


class OverviewBodyWeightSchema(BaseModel):
    weight_kg: float
    measured_on: date
    change_kg: float | None
    previous_on: date | None


class OverviewPlanTodaySchema(BaseModel):
    workout_id: int
    name: str
    exercise_count: int
    muscle_groups: list[str]
    last_done_at: datetime | None
    done: bool


class OverviewPlanNextSchema(BaseModel):
    date: date
    workouts: list[str]


class OverviewPlanSchema(BaseModel):
    id: int
    name: str
    today: list[OverviewPlanTodaySchema]
    next: OverviewPlanNextSchema | None


class OverviewSchema(BaseModel):
    today: date
    active_session: OverviewActiveSchema | None
    plan: OverviewPlanSchema | None = None
    week: OverviewWeekSchema
    total_sessions: int
    last_session: SessionHistoryItemSchema | None
    suggested_workout: OverviewWorkoutSchema | None
    workout_count: int
    body_weight: OverviewBodyWeightSchema | None


class CalendarSessionSchema(BaseModel):
    id: int
    name: str
    started_at: datetime
    completed_at: datetime
    total_sets: int
    volume_kg: float


class CalendarDaySchema(BaseModel):
    date: date
    sessions: list[CalendarSessionSchema]


class CalendarSchema(BaseModel):
    month: str
    today: date
    first_session_on: date | None
    total_sessions: int
    days_trained: int
    days: list[CalendarDaySchema]


class StatsTotalsSchema(BaseModel):
    sessions: int
    minutes: int
    sets: int
    reps: int
    volume_kg: float
    active_days: int
    avg_minutes: int
    per_week: float


class StatsBucketSchema(BaseModel):
    start: date
    sessions: int
    sets: int
    volume_kg: float
    minutes: int


class StatsDayPartSchema(BaseModel):
    part: str
    sessions: int


class StatsConsistencySchema(BaseModel):
    current_week_streak: int
    best_week_streak: int
    weekdays: list[int]
    day_parts: list[StatsDayPartSchema]


class StatsMuscleSchema(BaseModel):
    muscle_group: str
    sets: int
    volume_kg: float
    sessions: int
    share: float
    previous_sets: int
    last_trained_on: date | None
    days_since: int | None
    series: list[int]


class StatsExerciseUsageSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    sessions: int
    sets: int
    volume_kg: float


class StatsProgressionSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    metric: str
    first_kg: float
    last_kg: float
    change_kg: float
    change_pct: float
    sessions: int


class StatsRecordSchema(BaseModel):
    exercise_id: int | None
    name: str
    weight_kg: float
    reps: int
    previous_kg: float
    session_id: int
    date: date


class StatsWorkoutSchema(BaseModel):
    workout_id: int | None
    name: str
    sessions: int
    avg_minutes: int
    avg_volume_kg: float
    volume_change_pct: float | None
    last_done_on: date


class StatsSessionRefSchema(BaseModel):
    session_id: int
    name: str
    date: date
    value: float


class StatsHeaviestSetSchema(BaseModel):
    session_id: int
    name: str
    date: date
    weight_kg: float
    reps: int


class StatsAllTimeRecordsSchema(BaseModel):
    biggest_volume: StatsSessionRefSchema
    longest: StatsSessionRefSchema
    most_sets: StatsSessionRefSchema
    heaviest_set: StatsHeaviestSetSchema | None


class StatsAllTimeSchema(BaseModel):
    sessions: int
    volume_kg: float
    minutes: int
    first_session_on: date | None
    records: StatsAllTimeRecordsSchema | None


class StatsSchema(BaseModel):
    period: str
    start: date
    end: date
    bucket: str
    summary: StatsTotalsSchema
    previous: StatsTotalsSchema | None
    timeline: list[StatsBucketSchema]
    consistency: StatsConsistencySchema
    muscles: list[StatsMuscleSchema]
    most_done: list[StatsExerciseUsageSchema]
    progressions: list[StatsProgressionSchema]
    declines: list[StatsProgressionSchema]
    records: list[StatsRecordSchema]
    workouts: list[StatsWorkoutSchema]
    all_time: StatsAllTimeSchema


class PlanDaySchema(BaseModel):
    weekday: int = Field(ge=0, le=6)
    workout_id: int


class PlanSchema(BaseModel):
    name: str = Field(max_length=60)
    days: list[PlanDaySchema] = Field(default_factory=list, max_length=28)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return clean_name(value, "Dê um nome para o plano.")


class PlanDayResponseSchema(BaseModel):
    weekday: int
    workout_id: int
    workout_name: str
    exercise_count: int
    muscle_groups: list[str]


class PlanResponseSchema(BaseModel):
    id: int
    name: str
    is_active: bool
    days: list[PlanDayResponseSchema]
    updated_at: datetime | None
