from datetime import datetime, timezone
from app.fitness_intensity import guess_intensity, set_seconds

MIN_REST_SECONDS = 5
MAX_EXERCISE_SECONDS = 90 * 60
MAX_PREP_SECONDS = 30 * 60


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def entry_seconds(entry, tracking: str, level: str | None) -> float:
    if tracking != "reps":
        return float(entry.duration_seconds or 0)
    return set_seconds(entry.reps, level)


def series_list(item, level: str | None) -> list[tuple[datetime, float]]:
    tracking = item.tracking or "reps"
    groups: dict = {}
    for entry in item.sets:
        key = ("pair", entry.position) if entry.side else ("set", entry.id)
        moment = aware(entry.created_at)
        end, seconds = groups.get(key, (moment, 0.0))
        groups[key] = (max(end, moment), seconds + entry_seconds(entry, tracking, level))
    return sorted(groups.values())


def exercise_timings(workout_session, levels: dict | None = None) -> dict[int, dict]:
    levels = levels or {}
    timed = []
    for item in workout_session.exercises:
        if not item.sets:
            continue
        level = levels.get(item.exercise_id) or guess_intensity(item.muscle_group, item.muscles, item.tracking)
        timed.append((item, series_list(item, level)))
    timed.sort(key=lambda pair: pair[1][0][0])
    previous_end = aware(workout_session.started_at)
    result = {}
    for item, series in timed:
        first_end, first_estimate = series[0]
        last_end = series[-1][0]
        window = (first_end - previous_end).total_seconds()
        first_seconds = min(first_estimate, window) if window > 0 else first_estimate
        start = first_end.timestamp() - first_seconds
        prep = min(max(start - previous_end.timestamp(), 0.0), MAX_PREP_SECONDS)
        work = first_seconds
        rests, rest_total = [], 0.0
        for (earlier, _), (later, estimate) in zip(series, series[1:]):
            span = max((later - earlier).total_seconds(), 0.0)
            seconds = min(estimate, span)
            work += seconds
            gap = span - seconds
            rest_total += gap
            if gap >= MIN_REST_SECONDS:
                rests.append(gap)
        active = max(last_end.timestamp() - start, 0.0)
        total = min(prep + active, MAX_EXERCISE_SECONDS)
        result[item.id] = {
            "seconds": total if total > 0 else None,
            "prep": prep,
            "work": work,
            "rest": rest_total,
            "rests": rests,
        }
        previous_end = max(previous_end, last_end)
    return result


def intensity_levels(db, exercise_ids) -> dict[int, str]:
    from app.fitness_models import Exercise
    ids = {exercise_id for exercise_id in exercise_ids if exercise_id is not None}
    if not ids:
        return {}
    return {exercise.id: exercise.level for exercise in db.query(Exercise).filter(Exercise.id.in_(ids))}


def mean(values) -> float | None:
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None
