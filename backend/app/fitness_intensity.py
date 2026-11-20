from typing import Literal
from app.fitness_muscles import MUSCLES

Intensity = Literal["low", "moderate", "high", "very_high"]

PACE = {
    "low": (3.0, 3),
    "moderate": (3.75, 4),
    "high": (4.25, 5),
    "very_high": (5.0, 8),
}

LEG_GROUPS = {"quads", "hamstrings", "glutes", "adductors"}
SMALL_GROUPS = {"abs", "biceps", "triceps", "forearms", "calves", "shoulders"}
COMPOUND_GROUPS = {"chest", "back"}


def guess_intensity(muscle_group: str, muscles, tracking: str | None = "reps") -> str | None:
    if (tracking or "reps") != "reps":
        return None
    primary = [item["muscle"] for item in muscles or [] if item["role"] == "primary"]
    groups = {MUSCLES.get(muscle) for muscle in primary}
    if len(groups & LEG_GROUPS) >= 2 or ("lower_back" in primary and len(groups) >= 2):
        return "very_high"
    if muscle_group in SMALL_GROUPS:
        return "low"
    if muscle_group in COMPOUND_GROUPS:
        return "high"
    return "moderate"


def set_seconds(reps: int, level: str | None) -> float:
    per_rep, fixed = PACE.get(level or "moderate", PACE["moderate"])
    return reps * per_rep + fixed
