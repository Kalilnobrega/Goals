from datetime import datetime, timezone

MAX_REST_SECONDS = 900
MAX_EXERCISE_SECONDS = 90 * 60


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def series_times(item) -> list[datetime]:
    groups: dict = {}
    for entry in item.sets:
        key = ("pair", entry.position) if entry.side else ("set", entry.id)
        moment = aware(entry.created_at)
        groups[key] = max(groups.get(key, moment), moment)
    return sorted(groups.values())


def exercise_timings(workout_session) -> dict[int, dict]:
    timed = [(item, series_times(item)) for item in workout_session.exercises if item.sets]
    timed.sort(key=lambda pair: pair[1][0])
    previous_end = aware(workout_session.started_at)
    result = {}
    for item, times in timed:
        span = (times[-1] - previous_end).total_seconds()
        if span <= 0:
            span = (times[-1] - times[0]).total_seconds()
        rests = [
            gap for gap in ((later - earlier).total_seconds() for earlier, later in zip(times, times[1:]))
            if 0 < gap <= MAX_REST_SECONDS
        ]
        result[item.id] = {
            "seconds": min(span, MAX_EXERCISE_SECONDS) if span > 0 else None,
            "rests": rests,
        }
        previous_end = max(previous_end, times[-1])
    return result


def mean(values) -> float | None:
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None
