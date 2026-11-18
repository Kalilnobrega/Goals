from datetime import date, timedelta

MIN_FORECAST_DAYS = 3


def slope_per_day(series: list[tuple[date, float]]) -> float:
    origin = series[0][0]
    xs = [(day - origin).days for day, _ in series]
    ys = [value for _, value in series]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    spread = sum((x - mean_x) ** 2 for x in xs)
    if not spread:
        return 0.0
    return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / spread


def forecast(
    baseline: tuple[date, float] | None,
    points: list[tuple[date, float]],
    target: float,
    deadline: date | None,
    today: date,
) -> dict:
    series = ([baseline] if baseline else []) + sorted(points, key=lambda point: point[0])
    result = {
        "status": "no_data",
        "start_kg": series[0][1] if series else None,
        "current_kg": series[-1][1] if series else None,
        "target_kg": target,
        "progress": None,
        "eta": None,
        "rate_per_day": None,
        "needed_per_day": None,
        "deadline": deadline,
    }
    if not series:
        return result

    start, current = series[0][1], series[-1][1]
    increasing = target >= start
    remaining = target - current
    total = target - start
    result["progress"] = max(0.0, min(1.0, (current - start) / total)) if total else 1.0

    if (remaining <= 0) if increasing else (remaining >= 0):
        return {**result, "status": "reached", "progress": 1.0}

    if len(series) < 2 or (series[-1][0] - series[0][0]).days < MIN_FORECAST_DAYS:
        return result

    rate = slope_per_day(series)
    result["rate_per_day"] = round(rate, 4)
    if rate == 0 or (rate > 0) != (remaining > 0):
        return {**result, "status": "no_trend"}

    eta = series[-1][0] + timedelta(days=round(remaining / rate))
    result["eta"] = eta
    if deadline is None or eta <= deadline:
        result["status"] = "on_track"
        return result

    result["status"] = "behind"
    days_left = (deadline - today).days + 1
    if days_left > 0:
        result["needed_per_day"] = round(remaining / days_left, 4)
    return result
