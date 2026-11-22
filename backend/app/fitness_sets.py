from decimal import Decimal

NORMAL = "normal"
WARMUP = "warmup"
FAILURE = "failure"
DROP = "drop"
REST_PAUSE = "rest_pause"
SET_KINDS = (NORMAL, WARMUP, FAILURE, DROP, REST_PAUSE)
STAGED = (DROP, REST_PAUSE)


def is_working(entry) -> bool:
    return (entry.kind or NORMAL) != WARMUP


def working(entries) -> list:
    return [entry for entry in entries if is_working(entry)]


def entry_volume(entry, extra: Decimal = Decimal(0)) -> Decimal:
    return (entry.weight_kg + extra) * entry.reps + (entry.stage_volume_kg or Decimal(0)) + extra * (entry.stage_reps or 0)


def clean_plan(plan, target_sets: int):
    if not plan:
        return None
    if sum(1 for kind in plan if kind != WARMUP) != target_sets:
        raise ValueError("O plano de técnicas precisa ter uma bolinha para cada série.")
    return list(plan) if any(kind != NORMAL for kind in plan) else None
