from typing import Literal
from datetime import date, datetime, time
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from app.fitness_muscles import MuscleKey, MuscleRole
from app.fitness_sets import clean_plan
from app.fitness_intensity import Intensity


LoadMode = Literal["total", "side"]
SetKind = Literal["normal", "warmup", "failure", "drop", "rest_pause"]

MuscleGroup = Literal[
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "quads",
    "hamstrings",
    "calves",
    "adductors",
    "glutes",
    "abs",
    "cardio",
    "other",
]

Tracking = Literal["reps", "time", "cardio"]

Grip = Literal["pronated", "supinated", "neutral"]

CardioPhase = Literal["start", "end"]

Equipment = Literal[
    "barbell",
    "dumbbell",
    "machine",
    "plate_loaded",
    "cable",
    "cardio",
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


class ExerciseMuscleSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    muscle: MuscleKey
    role: MuscleRole


def unique_muscles(value):
    if value is None:
        return value
    keys = [item.muscle for item in value]
    if len(keys) != len(set(keys)):
        raise ValueError("Cada músculo só pode aparecer uma vez.")
    return value


class ExerciseSchema(BaseModel):
    name: str = Field(max_length=60)
    muscle_group: MuscleGroup
    equipment: Equipment
    grip: Grip | None = None
    is_unilateral: bool = False
    family: str | None = Field(default=None, max_length=60)
    bodyweight_factor: float | None = Field(default=None, ge=0, le=1)
    tracking: Tracking = "reps"
    intensity: Intensity | None = None
    muscles: list[ExerciseMuscleSchema] = Field(default_factory=list, max_length=15)

    @field_validator("muscles")
    @classmethod
    def no_repeated_muscles(cls, value):
        return unique_muscles(value)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return clean_name(value)


class ExerciseIntensitySchema(BaseModel):
    intensity: Intensity | None = None


class EditExerciseSchema(BaseModel):
    name: str | None = Field(default=None, max_length=60)
    muscle_group: MuscleGroup | None = None
    equipment: Equipment | None = None
    grip: Grip | None = None
    is_unilateral: bool | None = None
    family: str | None = Field(default=None, max_length=60)
    bodyweight_factor: float | None = Field(default=None, ge=0, le=1)
    tracking: Tracking | None = None
    intensity: Intensity | None = None
    muscles: list[ExerciseMuscleSchema] | None = Field(default=None, max_length=15)

    @field_validator("muscles")
    @classmethod
    def no_repeated_muscles(cls, value):
        return unique_muscles(value)

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
    grip: str | None = None
    is_custom: bool
    is_unilateral: bool = False
    family: str | None = None
    bodyweight_factor: float | None = None
    tracking: str = "reps"
    intensity: str | None = Field(default=None, validation_alias=AliasChoices("user_level", "level"))
    default_intensity: str | None = Field(default=None, validation_alias="level")
    muscles: list[ExerciseMuscleSchema] = []
    gym_specific: bool | None = None


class WorkoutExerciseSchema(BaseModel):
    exercise_id: int
    target_sets: int = Field(ge=1, le=20)
    reps_min: int = Field(ge=1, le=600)
    reps_max: int | None = Field(default=None, ge=1, le=600)
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    unilateral: bool | None = None
    load_mode: LoadMode | None = None
    superset: int | None = Field(default=None, ge=1, le=40)
    set_plan: list[SetKind] | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def reps_range(self):
        self.set_plan = clean_plan(self.set_plan, self.target_sets)
        if self.rest_seconds == 0:
            self.rest_seconds = None
        if self.reps_max is not None:
            if self.reps_max < self.reps_min:
                raise ValueError("O máximo de repetições não pode ser menor que o mínimo.")
            if self.reps_max == self.reps_min:
                self.reps_max = None
        return self


class WorkoutCardioSchema(BaseModel):
    exercise_id: int | None = None
    phase: CardioPhase
    minutes: int = Field(ge=1, le=300)


class WorkoutSchema(BaseModel):
    name: str = Field(max_length=60)
    description: str | None = Field(default=None, max_length=300)
    exercises: list[WorkoutExerciseSchema] = Field(default_factory=list, max_length=40)
    cardio: list[WorkoutCardioSchema] = Field(default_factory=list, max_length=6)

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
    unilateral: bool | None = None
    load_mode: str | None = None
    superset: int | None = None
    set_plan: list[str] | None = None


class WorkoutCardioResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise: ExerciseResponseSchema | None = None
    phase: str
    minutes: int


class WorkoutResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    exercises: list[WorkoutExerciseResponseSchema]
    cardio: list[WorkoutCardioResponseSchema] = []
    updated_at: datetime | None


class StartSessionSchema(BaseModel):
    workout_id: int | None = None
    gym_id: int | None = None


class SessionGymSchema(BaseModel):
    gym_id: int | None = None


class AddSessionExerciseSchema(BaseModel):
    exercise_id: int


class ReorderSessionSchema(BaseModel):
    exercise_ids: list[int]
    supersets: list[int | None] | None = None

    @model_validator(mode="after")
    def same_length(self):
        if self.supersets is not None and len(self.supersets) != len(self.exercise_ids):
            raise ValueError("A lista de supersets precisa ter um valor para cada exercício.")
        return self


class EditSessionExerciseSchema(BaseModel):
    exercise_id: int | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    note: str | None = Field(default=None, max_length=200)
    unilateral: bool | None = None
    load_mode: LoadMode | None = None

    @field_validator("note")
    @classmethod
    def clean_note(cls, value):
        if value is None:
            return None
        value = value.strip()
        return value or None


class SetRecordSchema(BaseModel):
    type: Literal["weight", "reps"]
    weight_kg: float
    reps: int
    previous_weight_kg: float
    previous_reps: int


class SetSchema(BaseModel):
    weight_kg: float = Field(default=0, ge=0, le=1000)
    reps: int = Field(default=0, ge=0, le=1000)
    duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    distance_km: float | None = Field(default=None, gt=0, le=1000)
    speed_kmh: float | None = Field(default=None, gt=0, le=100)
    level: int | None = Field(default=None, ge=1, le=100)
    incline_pct: float | None = Field(default=None, ge=0, le=40)
    calories: int | None = Field(default=None, ge=1, le=5000)
    client_id: str | None = Field(default=None, min_length=8, max_length=36, pattern=r"^[A-Za-z0-9-]+$")
    side: Literal["left", "right"] | None = None
    rir: int | None = Field(default=None, ge=0, le=4)
    kind: SetKind = "normal"


class StageSchema(BaseModel):
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(ge=1, le=1000)


class EditSetSchema(BaseModel):
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    reps: int | None = Field(default=None, ge=1, le=1000)
    duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    distance_km: float | None = Field(default=None, gt=0, le=1000)
    speed_kmh: float | None = Field(default=None, gt=0, le=100)
    level: int | None = Field(default=None, ge=1, le=100)
    incline_pct: float | None = Field(default=None, ge=0, le=40)
    calories: int | None = Field(default=None, ge=1, le=5000)
    rir: int | None = Field(default=None, ge=0, le=4)
    kind: SetKind | None = None
    stages: list[StageSchema] | None = Field(default=None, max_length=8)


class FinishSessionSchema(BaseModel):
    completed_at: datetime | None = None


class SetResponseSchema(BaseModel):
    id: int
    position: int
    weight_kg: float
    reps: int
    created_at: datetime
    client_id: str | None = None
    side: str | None = None
    duration_seconds: int | None = None
    distance_km: float | None = None
    speed_kmh: float | None = None
    level: int | None = None
    incline_pct: float | None = None
    calories: int | None = None
    rir: int | None = None
    kind: str = "normal"
    stages: list[StageSchema] = []
    record: SetRecordSchema | None = None


class PreviousSetSchema(BaseModel):
    weight_kg: float
    reps: int
    side: str | None = None
    rir: int | None = None
    kind: str = "normal"
    stages: list[StageSchema] = []
    duration_seconds: int | None = None
    distance_km: float | None = None
    speed_kmh: float | None = None
    level: int | None = None
    incline_pct: float | None = None
    calories: int | None = None


class PreviousPerformanceSchema(BaseModel):
    scope: Literal["workout", "any"]
    workout_name: str
    at: datetime | None
    note: str | None = None
    sets: list[PreviousSetSchema]


class SessionExerciseResponseSchema(BaseModel):
    id: int
    exercise_id: int | None
    exercise_name: str
    muscle_group: str
    equipment: str
    muscles: list[ExerciseMuscleSchema] = []
    target_sets: int | None
    reps_min: int | None
    reps_max: int | None
    rest_seconds: int | None
    note: str | None = None
    unilateral: bool = False
    tracking: str = "reps"
    load_mode: str | None = None
    phase: str | None = None
    superset: int | None = None
    set_plan: list[str] | None = None
    from_plan: bool = False
    sets: list[SetResponseSchema]
    previous: list[PreviousSetSchema]
    previous_at: datetime | None
    previous_note: str | None = None
    previous_scope: Literal["workout", "any"] | None = None
    history: list[PreviousPerformanceSchema] = []


class SessionHistoryItemSchema(BaseModel):
    id: int
    workout_id: int | None
    name: str
    started_at: datetime
    completed_at: datetime
    exercise_count: int
    total_sets: int
    volume_kg: float
    cardio_seconds: int = 0
    cardio_km: float = 0
    cardio_km_estimated: bool = False
    cardio_calories: int | None = None
    cardio_calories_estimated: bool = False
    muscle_groups: list[str]
    gym_name: str | None = None


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
    gym_id: int | None = None
    gym_name: str | None = None


class ProgressExerciseSchema(BaseModel):
    exercise_id: int
    name: str
    muscle_group: str
    equipment: str
    tracking: str = "reps"
    sessions: int
    last_at: datetime
    best_weight_kg: float
    max_reps: int
    goal_kg: float | None = None


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
    duration_seconds: int = 0
    best_duration_seconds: int = 0
    distance_km: float | None = None
    km_estimated: bool = False
    speed_kmh: float | None = None
    level: int | None = None
    calories: int | None = None
    calories_estimated: bool = False
    pace_seconds_per_km: int | None = None
    left_max_weight_kg: float | None = None
    right_max_weight_kg: float | None = None
    left_estimated_1rm_kg: float | None = None
    right_estimated_1rm_kg: float | None = None


class ProgressGymSchema(BaseModel):
    id: int
    name: str
    sessions: int


class ExerciseProgressSchema(BaseModel):
    gym_specific: bool = False
    gym_id: int | None = None
    gyms: list[ProgressGymSchema] = []
    exercise_id: int
    name: str
    muscle_group: str
    equipment: str
    tracking: str = "reps"
    intensity: str | None = None
    default_intensity: str | None = None
    points: list[ProgressPointSchema]
    goal: "FitnessGoalResponseSchema | None" = None
    time: "ExerciseTimeSchema | None" = None
    rep_records: list["RepRecordSchema"] = []
    pace: "ProgressPaceSchema | None" = None
    stagnation: "StagnationSchema | None" = None
    ready: "ExerciseReadySchema | None" = None
    frequency: "ExerciseFrequencySchema | None" = None
    techniques: list["TechniqueSessionSchema"] = []


class TechniqueSetSchema(BaseModel):
    kind: str
    weight_kg: float
    reps: int
    stages: list[StageSchema] = []


class TechniqueSessionSchema(BaseModel):
    session_id: int
    date: date
    sets: list[TechniqueSetSchema]


class RepRecordSchema(BaseModel):
    reps: int
    weight_kg: float
    actual_reps: int
    session_id: int
    date: date


class ProgressPaceSchema(BaseModel):
    metric: str
    kg_per_month: float
    pct_per_month: float | None
    current_kg: float
    projected_kg: float
    sessions: int
    since: date


class StagnationSchema(BaseModel):
    sessions: int
    since: date
    best_kg: float


class ExerciseReadySchema(BaseModel):
    weight_kg: float
    reps: int
    sets: int
    reps_max: int
    workout_name: str


class ExerciseFrequencySchema(BaseModel):
    per_week: float
    weeks: float = 8
    avg_interval_days: float | None
    days_since_last: int
    last_on: date


class ExerciseTimeSchema(BaseModel):
    sessions: int
    avg_seconds: int | None
    avg_set_seconds: int | None
    avg_rest_seconds: int | None
    avg_prep_seconds: int | None = None


class BodyWeightSchema(BaseModel):
    weight_kg: float = Field(ge=20, le=400)
    measured_on: date | None = None
    measured_time: time | None = None
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
    measured_time: time | None = None
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
    measured_time: str | None = None
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
    workout_id: int | None = None


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


class OverviewWeightPointSchema(BaseModel):
    measured_on: date
    weight_kg: float


class OverviewBodyWeightSchema(BaseModel):
    weight_kg: float
    measured_on: date
    change_kg: float | None
    previous_on: date | None
    month_change_kg: float | None = None
    month_from_on: date | None = None
    recent: list[OverviewWeightPointSchema] = []
    goal: "FitnessGoalResponseSchema | None" = None


class OverviewRecordSchema(BaseModel):
    exercise_id: int | None
    name: str
    weight_kg: float
    reps: int
    previous_kg: float
    session_id: int
    date: date


class OverviewMuscleMapSchema(BaseModel):
    muscle: str
    done_sets: float
    planned_sets: float | None


class OverviewMuscleSchema(BaseModel):
    muscle_group: str
    done_sets: int
    planned_sets: int | None
    last_trained_on: date | None
    days_since: int | None


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
    first_session_on: date | None = None
    suggested_workout: OverviewWorkoutSchema | None
    workout_count: int
    body_weight: OverviewBodyWeightSchema | None
    muscles_week: list[OverviewMuscleSchema] = []
    muscle_map: list[OverviewMuscleMapSchema] = []
    recent_records: list[OverviewRecordSchema] = []


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
    density_kg_min: float = 0


class StatsBucketSchema(BaseModel):
    start: date
    sessions: int
    sets: int
    volume_kg: float
    minutes: int
    density_kg_min: float = 0


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


class StatsRepProgressionSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    first_reps: int
    last_reps: int
    change_reps: int
    change_pct: float
    sessions: int


class StatsProgressAverageSchema(BaseModel):
    load_pct: float | None
    reps_pct: float | None
    exercises: int


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
    progress_pct: float | None = None
    last_done_on: date


class WorkoutProgressSessionSchema(BaseModel):
    session_id: int
    completed_at: datetime
    day: date
    minutes: int
    sets: int
    volume_kg: float


class WorkoutProgressExerciseSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    in_workout: bool
    sessions: int
    metric: str | None
    first_kg: float | None
    last_kg: float | None
    best_kg: float | None
    load_change_pct: float | None
    first_reps: int
    last_reps: int
    reps_change_pct: float | None
    last_weight_kg: float
    last_reps_at_weight: int
    last_on: date


class WorkoutReadySchema(BaseModel):
    exercise_id: int
    name: str
    weight_kg: float
    reps: int
    sets: int
    reps_max: int


class WorkoutRepRangeSchema(BaseModel):
    in_range: int
    below: int
    above: int


class WorkoutCompletionExerciseSchema(BaseModel):
    exercise_id: int
    name: str
    target_sets: int
    avg_sets: float
    skipped: int
    incomplete: int


class WorkoutCompletionSchema(BaseModel):
    planned_sets: int
    done_sets: int
    extra_sets: int
    pct: int | None
    exercises: list[WorkoutCompletionExerciseSchema]


class WorkoutVolumeShareSchema(BaseModel):
    exercise_id: int | None
    name: str
    volume_kg: float
    share: float


class WorkoutProgressSchema(BaseModel):
    workout_id: int
    name: str
    sessions: list[WorkoutProgressSessionSchema]
    avg_minutes: int | None
    avg_volume_kg: float | None
    volume_change_pct: float | None
    load_pct: float | None
    reps_pct: float | None
    exercises: list[WorkoutProgressExerciseSchema]
    ready_to_progress: list[WorkoutReadySchema] = []
    rep_range: WorkoutRepRangeSchema | None = None
    completion: WorkoutCompletionSchema | None = None
    time: "StatsTimeSchema | None" = None
    records: list["StatsRecordSchema"] = []
    volume_share: list[WorkoutVolumeShareSchema] = []
    cardio: "WorkoutCardioProgressSchema | None" = None


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
    best_periods: "StatsBestPeriodsSchema | None" = None


class StatsBestPeriodSchema(BaseModel):
    start: date
    sessions: int
    volume_kg: float


class StatsBestPeriodsSchema(BaseModel):
    week_sessions: StatsBestPeriodSchema
    week_volume: StatsBestPeriodSchema
    month_sessions: StatsBestPeriodSchema
    month_volume: StatsBestPeriodSchema


class StatsAdherenceWeekdaySchema(BaseModel):
    weekday: int
    planned: int
    done: int


class StatsAdherenceSchema(BaseModel):
    since: date
    planned: int
    done: int
    pct: int | None
    extra_days: int
    weekdays: list[StatsAdherenceWeekdaySchema]


class StatsPlanWeekSchema(BaseModel):
    start: date
    planned: int
    done: int
    pct: int | None


class StatsPlanSkippedSchema(BaseModel):
    date: date
    workouts: list[str]


class StatsPlanWorkoutSchema(BaseModel):
    workout_id: int
    name: str
    planned: int
    done: int
    completion_pct: float | None
    avg_minutes: int | None


class StatsPlanMuscleSchema(BaseModel):
    muscle_group: str
    planned_sets: int
    done_sets: float


class StatsPlanCardioSchema(BaseModel):
    planned_minutes: int
    done_minutes: float
    done_km: float = 0
    km_estimated: bool = False
    done_calories: float | None = None
    calories_estimated: bool = False


class StatsPlanDetailsSchema(BaseModel):
    weeks: list[StatsPlanWeekSchema]
    current_streak: int
    best_streak: int
    skipped: list[StatsPlanSkippedSchema]
    most_skipped_weekday: int | None
    workouts: list[StatsPlanWorkoutSchema]
    muscles: list[StatsPlanMuscleSchema]
    cardio: StatsPlanCardioSchema | None


class StatsRelativeStrengthItemSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    e1rm_kg: float
    body_weight_kg: float
    ratio: float
    first_ratio: float | None
    sessions: int
    series: list["StatsRelativeStrengthPointSchema"] = []


class StatsRelativeStrengthPointSchema(BaseModel):
    session_id: int
    completed_at: datetime
    date: date
    ratio: float
    e1rm_kg: float
    body_weight_kg: float


class WeightWeekSchema(BaseModel):
    start: date
    weight_kg: float | None
    sessions: int
    sets: int
    volume_kg: float
    cardio_minutes: int
    cardio_calories: int


class WeightMonthSchema(BaseModel):
    start: date
    first_kg: float | None
    last_kg: float | None
    change_kg: float | None
    weighings: int
    sessions: int
    sets: int
    volume_kg: float
    cardio_minutes: int
    cardio_calories: int


class WeightComparisonSchema(BaseModel):
    period: str
    weighings: int
    weeks: list[WeightWeekSchema]
    months: list[WeightMonthSchema]


class StatsRelativeStrengthSchema(BaseModel):
    has_body_weight: bool
    items: list[StatsRelativeStrengthItemSchema]


class StatsActivityDaySchema(BaseModel):
    date: date
    sessions: int
    sets: int
    minutes: int
    volume_kg: float
    workouts: list[str]


class StatsTimeExerciseSchema(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str
    sessions: int
    avg_seconds: int
    set_seconds: int | None
    prep_seconds: int | None = None


class StatsTimeSchema(BaseModel):
    avg_session_seconds: int
    avg_set_seconds: int | None
    avg_prep_seconds: int | None = None
    avg_exercise_seconds: int | None
    avg_rest_seconds: int | None
    exercises_per_session: float
    longest_exercises: list[StatsTimeExerciseSchema]


class StatsCardioExerciseSchema(BaseModel):
    exercise_id: int | None
    name: str
    minutes: int
    distance_km: float
    sessions: int
    calories: int | None = None
    calories_estimated: bool = False
    avg_speed_kmh: float | None = None
    avg_level: float | None = None
    level_change: int | None = None


class StatsCardioBucketSchema(BaseModel):
    start: date
    minutes: int
    sessions: int
    km: float = 0
    calories: int = 0


class StatsCardioPlanSchema(BaseModel):
    planned: int
    done: int
    skipped: int
    short: int
    over: int
    planned_minutes: int
    done_minutes: int
    completion_pct: float | None


class StatsCardioPhaseSchema(BaseModel):
    phase: str
    minutes: int
    sessions: int
    planned: int
    skipped: int


class StatsCardioRecordSchema(BaseModel):
    minutes: int
    session_id: int | None = None
    name: str | None = None
    date: date
    km: float | None = None


class StatsCardioSpeedSchema(BaseModel):
    kmh: float
    session_id: int
    name: str
    date: date


class StatsCardioSchema(BaseModel):
    sessions: int
    minutes: int
    distance_km: float
    avg_minutes: int
    exercises: list[StatsCardioExerciseSchema]
    km_estimated: bool = False
    avg_km: float | None = None
    avg_speed_kmh: float | None = None
    pace_seconds_per_km: int | None = None
    calories: int | None = None
    avg_calories: int | None = None
    calories_estimated: bool = False
    farthest: StatsCardioRecordSchema | None = None
    fastest: StatsCardioSpeedSchema | None = None
    previous_minutes: int | None = None
    timeline: list[StatsCardioBucketSchema] = []
    plan: StatsCardioPlanSchema | None = None
    phases: list[StatsCardioPhaseSchema] = []
    longest: StatsCardioRecordSchema | None = None
    best_week: StatsCardioRecordSchema | None = None


class WorkoutCardioProgressSchema(BaseModel):
    planned_minutes: int
    sessions: int
    avg_done_minutes: int | None
    avg_km: float | None = None
    km_estimated: bool = False
    avg_calories: int | None = None
    calories_estimated: bool = False
    skipped: int
    completion_pct: float | None
    phases: list[StatsCardioPhaseSchema] = []


class StatsSchema(BaseModel):
    period: str
    time: StatsTimeSchema | None = None
    cardio: StatsCardioSchema | None = None
    plan_id: int | None = None
    activity: list[StatsActivityDaySchema] = []
    adherence: StatsAdherenceSchema | None = None
    plan_details: StatsPlanDetailsSchema | None = None
    relative_strength: StatsRelativeStrengthSchema | None = None
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
    rep_progressions: list[StatsRepProgressionSchema] = []
    progress_average: StatsProgressAverageSchema | None = None
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
    total_sets: int
    muscle_groups: list[str]


class PlanResponseSchema(BaseModel):
    id: int
    name: str
    is_active: bool
    days: list[PlanDayResponseSchema]
    updated_at: datetime | None


class WeekSchema(OverviewWeekSchema):
    start: date
    today: date
    has_plan: bool
    first_session_on: date | None


class WeekStreakRunSchema(BaseModel):
    start: date
    end: date
    length: int
    current: bool


class WeekStreakSchema(BaseModel):
    current: int
    best: int
    target: int
    trained_days: int
    week_done: bool
    top: list[WeekStreakRunSchema]
    total_runs: int


class FitnessProfileSchema(BaseModel):
    body_type: Literal["male", "female"]


class FitnessProfileResponseSchema(BaseModel):
    body_type: Literal["male", "female"]
    username: str | None = None
    visibility: Literal["public", "friends", "private"] = "friends"


class VisibilityUpdateSchema(BaseModel):
    visibility: Literal["public", "friends", "private"]


Relation = Literal["self", "friends", "request_sent", "request_received", "none", "blocked"]


class SocialUserSchema(BaseModel):
    username: str
    name: str
    relation: Relation


class FriendSchema(BaseModel):
    username: str
    name: str
    since: datetime | None = None


class FriendsSchema(BaseModel):
    friends: list[FriendSchema]
    incoming: list[FriendSchema]
    outgoing: list[FriendSchema]


class SocialStatsSchema(BaseModel):
    workouts: int
    workouts_this_month: int
    week_streak: int
    best_week_streak: int
    friends: int
    member_since: date | None = None


class SocialRecordSchema(BaseModel):
    name: str
    weight_kg: float
    reps: int
    previous_kg: float
    date: date


class SocialSessionSchema(BaseModel):
    name: str
    date: date
    minutes: int
    volume_kg: float
    exercises: int


class SocialProfileSchema(BaseModel):
    username: str
    name: str
    visibility: Literal["public", "friends", "private"]
    relation: Relation
    can_view: bool
    stats: SocialStatsSchema | None = None
    records: list[SocialRecordSchema] | None = None
    recent_sessions: list[SocialSessionSchema] | None = None


class FriendRequestSchema(BaseModel):
    username: str = Field(max_length=40)


class ReportSchema(BaseModel):
    reason: Literal["spam", "offensive", "fake", "other"]
    details: str | None = Field(default=None, max_length=500)


class UsernameUpdateSchema(BaseModel):
    username: str = Field(max_length=40)


class UsernameAvailabilitySchema(BaseModel):
    username: str
    available: bool
    reason: str | None = None


class SessionPerformanceSchema(BaseModel):
    session_id: int
    date: date
    weight_kg: float
    reps: int
    volume_kg: float
    estimated_1rm_kg: float | None
    sets: int
    scope: Literal["workout", "any"] | None = None
    workout_name: str | None = None


class SessionExerciseInsightSchema(BaseModel):
    item_id: int
    current: SessionPerformanceSchema
    previous: SessionPerformanceSchema | None
    seconds: int | None = None
    prep_seconds: int | None = None
    rest_seconds: int | None = None


class SessionTimeSchema(BaseModel):
    prep_seconds: int
    work_seconds: int
    rest_seconds: int


class PreviousSessionSchema(BaseModel):
    id: int
    date: date
    minutes: int
    sets: int
    volume_kg: float


class MuscleSetsSchema(BaseModel):
    muscle: str
    sets: float


class SessionCardioItemSchema(BaseModel):
    item_id: int
    km: float = 0
    km_estimated: bool = False
    calories: int | None = None
    calories_estimated: bool = False


class SessionCardioSchema(BaseModel):
    minutes: int
    km: float
    km_estimated: bool
    calories: int | None
    calories_estimated: bool
    items: list[SessionCardioItemSchema] = []


class SessionInsightsSchema(BaseModel):
    previous_session: PreviousSessionSchema | None
    cardio: SessionCardioSchema | None = None
    minutes: int
    set_seconds: int | None = None
    rest_seconds: int | None = None
    time: SessionTimeSchema | None = None
    exercises: list[SessionExerciseInsightSchema]
    records: list[StatsRecordSchema]
    muscle_sets: list[MuscleSetsSchema]


class FitnessGoalSchema(BaseModel):
    target_kg: float = Field(gt=0, le=1000)
    deadline: date | None = None


class FitnessGoalResponseSchema(BaseModel):
    target_kg: float
    deadline: date | None
    start_on: date
    status: Literal["reached", "on_track", "behind", "no_trend", "no_data"]
    start_kg: float | None
    current_kg: float | None
    progress: float | None
    eta: date | None
    rate_per_day: float | None
    needed_per_day: float | None


ChallengeMetricKey = Literal[
    "days", "workouts", "minutes", "volume", "cardio_minutes", "cardio_km", "cardio_kcal", "exercise", "records", "plan", "muscle",
    "progress", "body_weight", "relative_strength",
]
EXERCISE_METRICS = {"exercise", "progress", "relative_strength"}
WEIGHT_METRICS = {"body_weight", "relative_strength"}
ExerciseMeasure = Literal["reps", "volume", "max_weight"]
ChallengeStatus = Literal["upcoming", "active", "finished"]


class ChallengeMetricSchema(BaseModel):
    key: ChallengeMetricKey
    weight: int = Field(default=1, ge=1, le=5)
    exercise_id: int | None = None
    measure: ExerciseMeasure | None = None
    scope: Literal["exact", "family"] | None = None
    muscle_group: MuscleGroup | None = None
    unit: Literal["pct", "kg"] | None = None
    direction: Literal["lose", "gain"] | None = None

    @model_validator(mode="after")
    def metric_fields(self):
        if self.key == "muscle":
            if self.muscle_group is None or self.muscle_group == "cardio":
                raise ValueError("Escolha o grupo muscular.")
        else:
            self.muscle_group = None
        if self.key in EXERCISE_METRICS:
            if self.exercise_id is None:
                raise ValueError("Escolha o exercício do desafio.")
            self.scope = self.scope or "exact"
        else:
            self.exercise_id = None
            self.scope = None
        if self.key == "exercise":
            if self.measure is None:
                raise ValueError("Escolha o que conta no exercício.")
        else:
            self.measure = None
        self.unit = (self.unit or "pct") if self.key == "progress" else None
        self.direction = (self.direction or "lose") if self.key == "body_weight" else None
        return self


class ChallengeMinRuleSchema(BaseModel):
    kind: Literal["none", "minutes", "exercises"] = "none"
    value: int | None = None

    @model_validator(mode="after")
    def valid_value(self):
        if self.kind == "none":
            self.value = None
        elif self.kind == "minutes" and not (self.value and 5 <= self.value <= 240):
            raise ValueError("O treino mínimo deve ter entre 5 e 240 minutos.")
        elif self.kind == "exercises" and not (self.value and 1 <= self.value <= 20):
            raise ValueError("O treino mínimo deve ter entre 1 e 20 exercícios.")
        return self


class ChallengeCreateSchema(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    start_date: date
    end_date: date
    metrics: list[ChallengeMetricSchema] = Field(min_length=1, max_length=4)
    min_rule: ChallengeMinRuleSchema = Field(default_factory=ChallengeMinRuleSchema)
    hide_weight: bool = False
    accept_weight: bool = False

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Dê um nome ao desafio.")
        return value


class ChallengeMetricOutSchema(ChallengeMetricSchema):
    id: str
    exercise_name: str | None = None
    family: str | None = None


class ChallengeRankingSchema(BaseModel):
    position: int
    username: str | None
    name: str
    score: float
    values: dict[str, float]
    details: dict[str, dict[str, float]] = {}
    missing: list[str] = []
    is_me: bool


class ChallengeSummarySchema(BaseModel):
    id: int
    name: str
    hide_weight: bool = False
    start_date: date
    end_date: date
    status: ChallengeStatus
    member_count: int
    metrics: list[ChallengeMetricOutSchema]
    my_position: int | None = None
    my_score: float | None = None
    leader_name: str | None = None


class ChallengePreviewSchema(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
    start_date: date
    end_date: date
    status: ChallengeStatus
    owner_name: str
    member_count: int
    metrics: list[ChallengeMetricOutSchema]
    min_rule: ChallengeMinRuleSchema
    is_member: bool
    hide_weight: bool = False
    uses_weight: bool = False


class ChallengeListsSchema(BaseModel):
    active: list[ChallengeSummarySchema]
    upcoming: list[ChallengeSummarySchema]
    finished: list[ChallengeSummarySchema]
    invites: list[ChallengePreviewSchema]


class ChallengeDetailSchema(BaseModel):
    id: int
    name: str
    description: str | None
    start_date: date
    end_date: date
    status: ChallengeStatus
    days_left: int
    metrics: list[ChallengeMetricOutSchema]
    min_rule: ChallengeMinRuleSchema
    owner_username: str | None
    is_owner: bool
    hide_weight: bool = False
    uses_weight: bool = False
    invite_code: str
    member_count: int
    ranking: list[ChallengeRankingSchema]


class ChallengeJoinSchema(BaseModel):
    accept_weight: bool = False


class ChallengeInviteSchema(BaseModel):
    username: str = Field(max_length=40)


class GymSchema(BaseModel):
    id: int
    name: str
    sessions: int
    current: bool


class GymListSchema(BaseModel):
    current_gym_id: int | None
    gyms: list[GymSchema]


class GymCreateSchema(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    make_current: bool = False

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Dê um nome para a academia.")
        return value


class GymRenameSchema(GymCreateSchema):
    pass


class CurrentGymSchema(BaseModel):
    gym_id: int


class ExerciseGymSettingSchema(BaseModel):
    gym_specific: bool | None = None
