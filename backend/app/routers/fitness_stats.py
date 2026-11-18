from collections import defaultdict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import BRT, today_br, to_br_date
from app.models import User
from app.fitness_models import WorkoutSession
from app.fitness_schemas import StatsSchema
from .auth import get_current_user
from .fitness_progress import estimated_1rm
from .fitness_sessions import COMPLETED, aware

fitness_stats_router = APIRouter(prefix="/fitness", tags=["fitness"])

PERIOD_DAYS = {"4w": 28, "3m": 91, "6m": 182, "1y": 365}
DAY_PARTS = [("dawn", 0, 6), ("morning", 6, 12), ("afternoon", 12, 18), ("night", 18, 24)]


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def month_start(day: date) -> date:
    return day.replace(day=1)


def next_month(day: date) -> date:
    return (day.replace(day=28) + timedelta(days=4)).replace(day=1)


def session_facts(workout_session: WorkoutSession) -> dict:
    started = aware(workout_session.started_at)
    completed = aware(workout_session.completed_at)
    exercises = []
    for item in workout_session.exercises:
        if not item.sets:
            continue
        weights = [(float(entry.weight_kg), entry.reps) for entry in item.sets]
        estimates = [e for e in (estimated_1rm(entry.weight_kg, entry.reps) for entry in item.sets) if e is not None]
        top_weight, top_reps = max(weights, key=lambda pair: (pair[0], pair[1]))
        exercises.append({
            "exercise_id": item.exercise_id,
            "name": item.exercise_name,
            "muscle_group": item.muscle_group,
            "muscles": item.muscles or [],
            "sets": len(item.sets),
            "reps": sum(reps for _, reps in weights),
            "volume": sum(weight * reps for weight, reps in weights),
            "top_weight": top_weight,
            "top_reps": top_reps,
            "max_reps": max(reps for _, reps in weights),
            "e1rm": max(estimates) if estimates else None,
        })
    return {
        "id": workout_session.id,
        "workout_id": workout_session.workout_id,
        "name": workout_session.name,
        "started_at": started,
        "completed_at": completed,
        "day": to_br_date(started),
        "hour": started.astimezone(BRT).hour,
        "minutes": max((completed - started).total_seconds() / 60, 0),
        "exercises": exercises,
        "sets": sum(e["sets"] for e in exercises),
        "reps": sum(e["reps"] for e in exercises),
        "volume": sum(e["volume"] for e in exercises),
    }


def totals(sessions: list[dict], days: int) -> dict:
    count = len(sessions)
    minutes = sum(s["minutes"] for s in sessions)
    return {
        "sessions": count,
        "minutes": round(minutes),
        "sets": sum(s["sets"] for s in sessions),
        "reps": sum(s["reps"] for s in sessions),
        "volume_kg": round(sum(s["volume"] for s in sessions), 1),
        "active_days": len({s["day"] for s in sessions}),
        "avg_minutes": round(minutes / count) if count else 0,
        "per_week": round(count / (days / 7), 1) if days else 0,
    }


def buckets(start: date, end: date, by_month: bool) -> list[date]:
    result = []
    current = month_start(start) if by_month else week_start(start)
    while current <= end:
        result.append(current)
        current = next_month(current) if by_month else current + timedelta(days=7)
    return result


def bucket_of(day: date, by_month: bool) -> date:
    return month_start(day) if by_month else week_start(day)


def week_streaks(sessions: list[dict], today: date) -> tuple[int, int]:
    weeks = sorted({week_start(s["day"]) for s in sessions})
    best = run = 0
    previous = None
    for week in weeks:
        run = run + 1 if previous and week - previous == timedelta(days=7) else 1
        best = max(best, run)
        previous = week
    this_week = week_start(today)
    current = 0
    if weeks and weeks[-1] >= this_week - timedelta(days=7):
        current = 1
        for older, newer in zip(reversed(weeks[:-1]), reversed(weeks[1:])):
            if newer - older != timedelta(days=7):
                break
            current += 1
    return current, best


def muscle_stats(period: list[dict], previous: list[dict], everything: list[dict], keys: list[date], by_month: bool, today: date):
    groups: dict[str, dict] = defaultdict(lambda: {"sets": 0, "volume": 0.0, "sessions": set()})
    series: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for s in period:
        for e in s["exercises"]:
            group = groups[e["muscle_group"]]
            group["sets"] += e["sets"]
            group["volume"] += e["volume"]
            group["sessions"].add(s["id"])
            series[e["muscle_group"]][bucket_of(s["day"], by_month)] += e["sets"]
    previous_sets: dict[str, int] = defaultdict(int)
    for s in previous:
        for e in s["exercises"]:
            previous_sets[e["muscle_group"]] += e["sets"]
    last_trained: dict[str, date] = {}
    for s in everything:
        for e in s["exercises"]:
            last_trained[e["muscle_group"]] = max(last_trained.get(e["muscle_group"], s["day"]), s["day"])
    total_sets = sum(g["sets"] for g in groups.values()) or 1
    names = set(groups) | set(last_trained)
    items = [
        {
            "muscle_group": name,
            "sets": groups[name]["sets"] if name in groups else 0,
            "volume_kg": round(groups[name]["volume"], 1) if name in groups else 0.0,
            "sessions": len(groups[name]["sessions"]) if name in groups else 0,
            "share": round((groups[name]["sets"] if name in groups else 0) / total_sets, 3),
            "previous_sets": previous_sets.get(name, 0),
            "last_trained_on": last_trained.get(name),
            "days_since": (today - last_trained[name]).days if name in last_trained else None,
            "series": [series[name].get(key, 0) for key in keys] if name in series else [0] * len(keys),
        }
        for name in names
    ]
    return sorted(items, key=lambda item: (-item["sets"], item["days_since"] if item["days_since"] is not None else 10**6))


def weight_records(everything: list[dict], include) -> list[dict]:
    best: dict = {}
    records = []
    for s in sorted(everything, key=lambda s: s["completed_at"]):
        for e in s["exercises"]:
            key = e["exercise_id"] or e["name"]
            if e["top_weight"] <= 0:
                continue
            previous_best = best.get(key)
            if previous_best is not None and e["top_weight"] > previous_best and include(s):
                records.append({
                    "exercise_id": e["exercise_id"],
                    "name": e["name"],
                    "weight_kg": e["top_weight"],
                    "reps": e["top_reps"],
                    "previous_kg": previous_best,
                    "session_id": s["id"],
                    "date": s["day"],
                })
            best[key] = max(previous_best or 0, e["top_weight"])
    records.sort(key=lambda r: (r["date"], r["weight_kg"]), reverse=True)
    return records


def completed_facts(user, db) -> list[dict]:
    return [
        session_facts(s)
        for s in db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
        .order_by(WorkoutSession.started_at)
        .all()
    ]


def exercise_stats(period: list[dict], everything: list[dict]):
    usage: dict[tuple, dict] = {}
    timeline: dict[tuple, list] = defaultdict(list)
    for s in period:
        for e in s["exercises"]:
            key = (e["exercise_id"], e["name"])
            item = usage.setdefault(key, {
                "exercise_id": e["exercise_id"], "name": e["name"], "muscle_group": e["muscle_group"],
                "sessions": 0, "sets": 0, "volume_kg": 0.0,
            })
            item["sessions"] += 1
            item["sets"] += e["sets"]
            item["volume_kg"] += e["volume"]
            value = e["e1rm"] if e["e1rm"] is not None else (e["top_weight"] or None)
            if value:
                timeline[key].append((s["completed_at"], value, e["e1rm"] is not None))
    for item in usage.values():
        item["volume_kg"] = round(item["volume_kg"], 1)
    most_done = sorted(usage.values(), key=lambda i: (-i["sets"], -i["sessions"], i["name"]))[:8]

    progressions = []
    for key, points in timeline.items():
        if len(points) < 2:
            continue
        points.sort(key=lambda p: p[0])
        estimated = all(p[2] for p in (points[0], points[-1]))
        first, last = points[0][1], points[-1][1]
        progressions.append({
            "exercise_id": key[0],
            "name": key[1],
            "muscle_group": usage[key]["muscle_group"],
            "metric": "e1rm" if estimated else "weight",
            "first_kg": round(first, 1),
            "last_kg": round(last, 1),
            "change_kg": round(last - first, 1),
            "change_pct": round((last - first) / first * 100, 1),
            "sessions": len(points),
        })
    gains = sorted([p for p in progressions if p["change_kg"] > 0], key=lambda p: -p["change_pct"])[:5]
    drops = sorted([p for p in progressions if p["change_kg"] < 0], key=lambda p: p["change_pct"])[:3]

    period_ids = {s["id"] for s in period}
    records = weight_records(everything, lambda s: s["id"] in period_ids)
    return most_done, gains, drops, records[:10]


def workout_stats(period: list[dict]):
    grouped: dict[tuple, list] = defaultdict(list)
    for s in period:
        grouped[(s["workout_id"], s["name"])].append(s)
    items = []
    for (workout_id, name), sessions in grouped.items():
        sessions.sort(key=lambda s: s["completed_at"])
        first, last = sessions[0]["volume"], sessions[-1]["volume"]
        items.append({
            "workout_id": workout_id,
            "name": name,
            "sessions": len(sessions),
            "avg_minutes": round(sum(s["minutes"] for s in sessions) / len(sessions)),
            "avg_volume_kg": round(sum(s["volume"] for s in sessions) / len(sessions), 1),
            "volume_change_pct": round((last - first) / first * 100, 1) if len(sessions) > 1 and first else None,
            "last_done_on": sessions[-1]["day"],
        })
    return sorted(items, key=lambda i: (-i["sessions"], i["name"]))


def all_time_records(everything: list[dict]):
    if not everything:
        return None

    def session_ref(s, value):
        return {"session_id": s["id"], "name": s["name"], "date": s["day"], "value": value}

    biggest = max(everything, key=lambda s: s["volume"])
    longest = max(everything, key=lambda s: s["minutes"])
    most_sets = max(everything, key=lambda s: s["sets"])
    heaviest = None
    for s in everything:
        for e in s["exercises"]:
            if e["top_weight"] > 0 and (heaviest is None or e["top_weight"] > heaviest["weight_kg"]):
                heaviest = {
                    "session_id": s["id"], "name": e["name"], "date": s["day"],
                    "weight_kg": e["top_weight"], "reps": e["top_reps"],
                }
    return {
        "biggest_volume": session_ref(biggest, round(biggest["volume"], 1)),
        "longest": session_ref(longest, round(longest["minutes"])),
        "most_sets": session_ref(most_sets, most_sets["sets"]),
        "heaviest_set": heaviest,
    }


@fitness_stats_router.get("/stats", response_model=StatsSchema)
def get_stats(
    period: str = Query(default="3m", pattern="^(4w|3m|6m|1y|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = today_br()
    everything = completed_facts(user, db)
    first_day = everything[0]["day"] if everything else today
    if period == "all":
        start = first_day
        previous_start = None
    else:
        start = today - timedelta(days=PERIOD_DAYS[period] - 1)
        previous_start = start - timedelta(days=PERIOD_DAYS[period])
    days = (today - start).days + 1
    in_period = [s for s in everything if s["day"] >= start]
    previous = [s for s in everything if previous_start and previous_start <= s["day"] < start]

    by_month = days > 371
    keys = buckets(start, today, by_month)
    timeline = {key: {"sessions": 0, "sets": 0, "volume": 0.0, "minutes": 0.0} for key in keys}
    for s in in_period:
        bucket = timeline[bucket_of(s["day"], by_month)]
        bucket["sessions"] += 1
        bucket["sets"] += s["sets"]
        bucket["volume"] += s["volume"]
        bucket["minutes"] += s["minutes"]

    weekdays = [0] * 7
    day_parts = {name: 0 for name, _, _ in DAY_PARTS}
    for s in in_period:
        weekdays[s["day"].weekday()] += 1
        for name, low, high in DAY_PARTS:
            if low <= s["hour"] < high:
                day_parts[name] += 1
    current_streak, best_streak = week_streaks(everything, today)
    most_done, gains, drops, records = exercise_stats(in_period, everything)

    return {
        "period": period,
        "start": start,
        "end": today,
        "bucket": "month" if by_month else "week",
        "summary": totals(in_period, days),
        "previous": totals(previous, days) if previous_start else None,
        "timeline": [
            {
                "start": key,
                "sessions": value["sessions"],
                "sets": value["sets"],
                "volume_kg": round(value["volume"], 1),
                "minutes": round(value["minutes"]),
            }
            for key, value in timeline.items()
        ],
        "consistency": {
            "current_week_streak": current_streak,
            "best_week_streak": best_streak,
            "weekdays": weekdays,
            "day_parts": [{"part": name, "sessions": count} for name, count in day_parts.items()],
        },
        "muscles": muscle_stats(in_period, previous, everything, keys, by_month, today),
        "most_done": most_done,
        "progressions": gains,
        "declines": drops,
        "records": records,
        "workouts": workout_stats(in_period),
        "all_time": {
            "sessions": len(everything),
            "volume_kg": round(sum(s["volume"] for s in everything), 1),
            "minutes": round(sum(s["minutes"] for s in everything)),
            "first_session_on": everything[0]["day"] if everything else None,
            "records": all_time_records(everything),
        },
    }
