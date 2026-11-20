from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import BRT, today_br, to_br_date
from app.models import User
from app.fitness_models import BodyWeightEntry, Workout, WorkoutSession
from app.fitness_schemas import StatsSchema, SessionInsightsSchema, StatsWorkoutSchema, WorkoutProgressSchema
from app.fitness_muscles import muscle_credit
from app.fitness_timing import exercise_timings, intensity_levels, mean as average
from app.fitness_load import BodyWeights, bodyweight_factors
from .auth import get_current_user
from .fitness import get_own_workout
from .fitness_plans import get_own_plan
from .fitness_progress import estimated_1rm
from .fitness_sessions import COMPLETED, aware, series_count

fitness_stats_router = APIRouter(prefix="/fitness", tags=["fitness"])

PERIOD_DAYS = {"4w": 28, "3m": 91, "6m": 182, "1y": 365}
DAY_PARTS = [("dawn", 0, 6), ("morning", 6, 12), ("afternoon", 12, 18), ("night", 18, 24)]


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def month_start(day: date) -> date:
    return day.replace(day=1)


def next_month(day: date) -> date:
    return (day.replace(day=28) + timedelta(days=4)).replace(day=1)


def session_facts(workout_session: WorkoutSession, body: BodyWeights | None = None, factors: dict | None = None, levels: dict | None = None) -> dict:
    started = aware(workout_session.started_at)
    day = to_br_date(started)
    completed = aware(workout_session.completed_at)
    timings = exercise_timings(workout_session, levels)
    exercises = []
    for item in workout_session.exercises:
        if not item.sets:
            continue
        strength = (item.tracking or "reps") == "reps"
        weights = [(float(entry.weight_kg), entry.reps) for entry in item.sets] if strength else [(0.0, 0)]
        factor = (factors or {}).get(item.exercise_id, 1.0)
        loads = [((body.load(weight, item.equipment, day, factor) if body else weight), reps) for weight, reps in weights]
        estimates = [e for e in (estimated_1rm(load, reps) for load, reps in loads) if e is not None]
        top_weight, top_reps = max(weights, key=lambda pair: (pair[0], pair[1]))
        exercises.append({
            "item_id": item.id,
            "exercise_id": item.exercise_id,
            "name": item.exercise_name,
            "muscle_group": item.muscle_group,
            "muscles": item.muscles or [],
            "sets": series_count(item.sets),
            "reps": sum(reps for _, reps in weights),
            "volume": sum(load * reps for load, reps in loads),
            "top_weight": top_weight,
            "top_reps": top_reps,
            "max_reps": max(reps for _, reps in weights),
            "e1rm": max(estimates) if estimates else None,
            "seconds": timings[item.id]["seconds"],
            "prep": timings[item.id]["prep"],
            "work": timings[item.id]["work"],
            "rest": timings[item.id]["rest"],
            "rests": timings[item.id]["rests"],
            "set_list": [(float(entry.weight_kg), entry.reps) for entry in item.sets] if strength else [],
            "tracking": item.tracking or "reps",
            "duration": sum(entry.duration_seconds or 0 for entry in item.sets),
            "distance": sum(float(entry.distance_km or 0) for entry in item.sets),
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


def density(volume: float, minutes: float) -> float:
    return round(volume / minutes, 1) if minutes >= 1 else 0


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
        "density_kg_min": density(sum(s["volume"] for s in sessions), minutes),
        "per_week": round(count / (max(days, 7) / 7), 1) if days else 0,
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


def cardio_stats(period: list[dict]) -> dict | None:
    by_exercise: dict = {}
    sessions = set()
    for s in period:
        for e in s["exercises"]:
            if e["tracking"] != "cardio" or not e["duration"]:
                continue
            sessions.add(s["id"])
            item = by_exercise.setdefault(exercise_key(e), {
                "exercise_id": e["exercise_id"], "name": e["name"], "seconds": 0, "distance_km": 0.0, "sessions": 0,
            })
            item["seconds"] += e["duration"]
            item["distance_km"] += e["distance"]
            item["sessions"] += 1
    if not sessions:
        return None
    total_seconds = sum(item["seconds"] for item in by_exercise.values())
    total_distance = sum(item["distance_km"] for item in by_exercise.values())
    return {
        "sessions": len(sessions),
        "minutes": round(total_seconds / 60),
        "distance_km": round(total_distance, 2),
        "avg_minutes": round(total_seconds / 60 / len(sessions)),
        "exercises": sorted(
            [{**item, "minutes": round(item.pop("seconds") / 60), "distance_km": round(item["distance_km"], 2)} for item in by_exercise.values()],
            key=lambda item: -item["minutes"],
        ),
    }


def time_stats(period: list[dict]) -> dict | None:
    sessions = [s for s in period if s["sets"]]
    if not sessions:
        return None
    total_seconds = sum(s["minutes"] * 60 for s in sessions)
    total_sets = sum(s["sets"] for s in sessions)
    exercises = [e for s in sessions for e in s["exercises"]]
    rests = [rest for e in exercises for rest in e["rests"]]
    per_exercise: dict = {}
    for e in exercises:
        if e["seconds"] is None:
            continue
        item = per_exercise.setdefault(exercise_key(e), {
            "exercise_id": e["exercise_id"], "name": e["name"], "muscle_group": e["muscle_group"], "seconds": [], "prep": [], "work": 0.0, "sets": 0,
        })
        item["seconds"].append(e["seconds"])
        item["work"] += e["work"]
        item["prep"].append(e["prep"])
        item["sets"] += e["sets"]
    longest = sorted(
        (
            {
                "exercise_id": item["exercise_id"],
                "name": item["name"],
                "muscle_group": item["muscle_group"],
                "sessions": len(item["seconds"]),
                "avg_seconds": round(average(item["seconds"])),
                "set_seconds": round(item["work"] / item["sets"]) if item["sets"] else None,
                "prep_seconds": round(average(item["prep"])),
            }
            for item in per_exercise.values()
        ),
        key=lambda item: -item["avg_seconds"],
    )[:5]
    exercise_seconds = [e["seconds"] for e in exercises if e["seconds"] is not None]
    timed = [e for e in exercises if e["seconds"] is not None]
    total_work = sum(e["work"] for e in exercises)
    return {
        "avg_session_seconds": round(total_seconds / len(sessions)),
        "avg_set_seconds": round(total_work / total_sets) if total_sets else None,
        "avg_prep_seconds": round(average([e["prep"] for e in timed])) if timed else None,
        "avg_exercise_seconds": round(average(exercise_seconds)) if exercise_seconds else None,
        "avg_rest_seconds": round(average(rests)) if rests else None,
        "exercises_per_session": round(sum(len([e for e in s["exercises"]]) for s in sessions) / len(sessions), 1),
        "longest_exercises": longest,
    }


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
    body = BodyWeights(user.id, db)
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
        .order_by(WorkoutSession.started_at)
        .all()
    )
    factors = bodyweight_factors(db, [item.exercise_id for s in sessions for item in s.exercises if item.equipment == "bodyweight"])
    levels = intensity_levels(db, [item.exercise_id for s in sessions for item in s.exercises])
    return [session_facts(s, body, factors, levels) for s in sessions]


def load_value(e: dict):
    return e["e1rm"] if e["e1rm"] is not None else (e["top_weight"] or None)


def pct(first: float, last: float) -> float:
    return round((last - first) / first * 100, 1)


def mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def exercise_stats(period: list[dict], everything: list[dict]):
    usage: dict[tuple, dict] = {}
    timeline: dict[tuple, list] = defaultdict(list)
    reps_timeline: dict[tuple, list] = defaultdict(list)
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
            value = load_value(e)
            if value:
                timeline[key].append((s["completed_at"], value, e["e1rm"] is not None))
            if e["tracking"] == "reps":
                reps_timeline[key].append((s["completed_at"], e["max_reps"]))
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
            "change_pct": pct(first, last),
            "sessions": len(points),
        })
    gains = sorted([p for p in progressions if p["change_kg"] > 0], key=lambda p: -p["change_pct"])[:5]
    drops = sorted([p for p in progressions if p["change_kg"] < 0], key=lambda p: p["change_pct"])[:3]

    rep_progressions = []
    for key, points in reps_timeline.items():
        if len(points) < 2:
            continue
        points.sort(key=lambda p: p[0])
        first, last = points[0][1], points[-1][1]
        rep_progressions.append({
            "exercise_id": key[0],
            "name": key[1],
            "muscle_group": usage[key]["muscle_group"],
            "first_reps": first,
            "last_reps": last,
            "change_reps": last - first,
            "change_pct": pct(first, last),
            "sessions": len(points),
        })
    rep_gains = sorted([p for p in rep_progressions if p["change_reps"] > 0], key=lambda p: -p["change_pct"])[:5]

    average = {
        "load_pct": mean([p["change_pct"] for p in progressions]),
        "reps_pct": mean([p["change_pct"] for p in rep_progressions]),
        "exercises": len({p["name"] for p in progressions} | {p["name"] for p in rep_progressions}),
    }

    period_ids = {s["id"] for s in period}
    records = weight_records(everything, lambda s: s["id"] in period_ids)
    return most_done, gains, drops, records[:10], rep_gains, average


def workout_stats(period: list[dict]):
    grouped: dict[tuple, list] = defaultdict(list)
    for s in period:
        grouped[(s["workout_id"], s["name"])].append(s)
    items = []
    for (workout_id, name), sessions in grouped.items():
        sessions.sort(key=lambda s: s["completed_at"])
        first, last = sessions[0]["volume"], sessions[-1]["volume"]
        loads: dict = defaultdict(list)
        for s in sessions:
            for e in s["exercises"]:
                value = load_value(e)
                if value:
                    loads[e["exercise_id"] or e["name"]].append(value)
        changes = [pct(values[0], values[-1]) for values in loads.values() if len(values) > 1]
        items.append({
            "workout_id": workout_id,
            "name": name,
            "sessions": len(sessions),
            "avg_minutes": round(sum(s["minutes"] for s in sessions) / len(sessions)),
            "avg_volume_kg": round(sum(s["volume"] for s in sessions) / len(sessions), 1),
            "volume_change_pct": pct(first, last) if len(sessions) > 1 and first else None,
            "progress_pct": mean(changes),
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
    plan_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = today_br()
    everything = completed_facts(user, db)
    plan = None
    if plan_id is not None:
        plan = get_own_plan(plan_id, user, db)
        plan_workouts = {day.workout_id for day in plan.days}
        everything = [s for s in everything if s["workout_id"] in plan_workouts]
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
    active_start = max(start, first_day)
    active_days = (today - active_start).days + 1
    previous_days = (start - max(previous_start, first_day)).days if previous_start else 0

    by_month = days > 371
    keys = buckets(active_start, today, by_month)
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
    most_done, gains, drops, records, rep_gains, average = exercise_stats(in_period, everything)

    return {
        "period": period,
        "plan_id": plan_id,
        "activity": activity_days(everything, today),
        "adherence": plan_adherence(plan, everything, start, today) if plan else None,
        "relative_strength": relative_strength(in_period, user, db),
        "time": time_stats(in_period),
        "cardio": cardio_stats(in_period),
        "start": start,
        "end": today,
        "bucket": "month" if by_month else "week",
        "summary": totals(in_period, active_days),
        "previous": totals(previous, previous_days) if previous_start and previous_days > 0 else None,
        "timeline": [
            {
                "start": key,
                "sessions": value["sessions"],
                "sets": value["sets"],
                "volume_kg": round(value["volume"], 1),
                "minutes": round(value["minutes"]),
                "density_kg_min": density(value["volume"], value["minutes"]),
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
        "rep_progressions": rep_gains,
        "progress_average": average,
        "records": records,
        "workouts": workout_stats(in_period),
        "all_time": {
            "sessions": len(everything),
            "volume_kg": round(sum(s["volume"] for s in everything), 1),
            "minutes": round(sum(s["minutes"] for s in everything)),
            "first_session_on": everything[0]["day"] if everything else None,
            "records": all_time_records(everything),
            "best_periods": best_periods(everything),
        },
    }


HEATMAP_DAYS = 371
RELATIVE_STRENGTH_LIMIT = 5


def plan_adherence(plan, sessions: list[dict], start: date, today: date) -> dict:
    created = to_br_date(aware(plan.created_at)) if plan.created_at else start
    begin = max(start, created)
    planned_weekdays = sorted({day.weekday for day in plan.days})
    trained = {s["day"] for s in sessions}
    by_weekday = {weekday: {"weekday": weekday, "planned": 0, "done": 0} for weekday in planned_weekdays}
    day = begin
    while day <= today:
        slot = by_weekday.get(day.weekday())
        if slot and (day < today or day in trained):
            slot["planned"] += 1
            if day in trained:
                slot["done"] += 1
        day += timedelta(days=1)
    planned = sum(slot["planned"] for slot in by_weekday.values())
    done = sum(slot["done"] for slot in by_weekday.values())
    extra = len({d for d in trained if begin <= d <= today and d.weekday() not in by_weekday})
    return {
        "since": begin,
        "planned": planned,
        "done": done,
        "pct": round(done / planned * 100) if planned else None,
        "extra_days": extra,
        "weekdays": list(by_weekday.values()),
    }


def relative_strength(period: list[dict], user, db) -> dict:
    entries = (
        db.query(BodyWeightEntry.measured_on, BodyWeightEntry.weight_kg)
        .filter(BodyWeightEntry.user_id == user.id)
        .order_by(BodyWeightEntry.measured_on)
        .all()
    )
    if not entries:
        return {"has_body_weight": False, "items": []}
    days = [day for day, _ in entries]

    def weight_on(day: date) -> float:
        index = bisect_right(days, day) - 1
        return float(entries[max(index, 0)][1])

    points: dict = defaultdict(list)
    names: dict = {}
    for s in period:
        for e in s["exercises"]:
            if e["e1rm"] is None:
                continue
            key = exercise_key(e)
            names[key] = e
            points[key].append((s["completed_at"], s["day"], e["e1rm"]))

    items = []
    for key, values in points.items():
        values.sort(key=lambda p: p[0])
        _, first_day, first_e1rm = values[0]
        _, last_day, last_e1rm = values[-1]
        body = weight_on(last_day)
        ratio = round(last_e1rm / body, 2)
        first_ratio = round(first_e1rm / weight_on(first_day), 2) if len(values) > 1 else None
        items.append({
            "exercise_id": names[key]["exercise_id"],
            "name": names[key]["name"],
            "muscle_group": names[key]["muscle_group"],
            "e1rm_kg": round(last_e1rm, 1),
            "body_weight_kg": body,
            "ratio": ratio,
            "first_ratio": first_ratio,
            "sessions": len(values),
        })
    items.sort(key=lambda i: (-i["sessions"], -i["ratio"]))
    return {"has_body_weight": True, "items": items[:RELATIVE_STRENGTH_LIMIT]}


def best_periods(sessions: list[dict]) -> dict | None:
    if not sessions:
        return None

    def group(key):
        result: dict = {}
        for s in sessions:
            item = result.setdefault(key(s["day"]), {"sessions": 0, "volume_kg": 0.0})
            item["sessions"] += 1
            item["volume_kg"] += s["volume"]
        return result

    def best(groups: dict, metric: str, other: str) -> dict:
        start, value = max(groups.items(), key=lambda kv: (kv[1][metric], kv[1][other], kv[0]))
        return {"start": start, "sessions": value["sessions"], "volume_kg": round(value["volume_kg"], 1)}

    weeks = group(week_start)
    months = group(month_start)
    return {
        "week_sessions": best(weeks, "sessions", "volume_kg"),
        "week_volume": best(weeks, "volume_kg", "sessions"),
        "month_sessions": best(months, "sessions", "volume_kg"),
        "month_volume": best(months, "volume_kg", "sessions"),
    }


def activity_days(sessions: list[dict], today: date) -> list[dict]:
    since = today - timedelta(days=HEATMAP_DAYS - 1)
    days: dict[date, dict] = {}
    for s in sessions:
        if s["day"] < since:
            continue
        day = days.setdefault(s["day"], {"date": s["day"], "sessions": 0, "sets": 0, "minutes": 0.0, "volume_kg": 0.0, "workouts": []})
        day["sessions"] += 1
        day["sets"] += s["sets"]
        day["minutes"] += s["minutes"]
        day["volume_kg"] += s["volume"]
        day["workouts"].append(s["name"])
    return [
        {**day, "minutes": round(day["minutes"]), "volume_kg": round(day["volume_kg"], 1)}
        for day in sorted(days.values(), key=lambda d: d["date"])
    ]


def exercise_key(e: dict):
    return e["exercise_id"] or e["name"]


def performance(s: dict, e: dict) -> dict:
    return {
        "session_id": s["id"],
        "date": s["day"],
        "weight_kg": e["top_weight"],
        "reps": e["top_reps"],
        "volume_kg": round(e["volume"], 1),
        "estimated_1rm_kg": e["e1rm"],
        "sets": e["sets"],
    }


@fitness_stats_router.get("/sessions/{session_id}/insights", response_model=SessionInsightsSchema)
def get_session_insights(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout_session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id)
        .first()
    )
    if not workout_session:
        raise HTTPException(status_code=404, detail="Treino não encontrado")
    if workout_session.status != COMPLETED:
        raise HTTPException(status_code=409, detail="O treino ainda não foi finalizado.")

    everything = completed_facts(user, db)
    current = next(s for s in everything if s["id"] == session_id)
    before = sorted(
        [s for s in everything if s["started_at"] < current["started_at"] and s["id"] != session_id],
        key=lambda s: s["started_at"],
        reverse=True,
    )

    same = (
        (lambda s: s["workout_id"] == current["workout_id"])
        if current["workout_id"] is not None
        else (lambda s: s["workout_id"] is None and s["name"] == current["name"])
    )
    previous = next((s for s in before if same(s)), None)

    exercises = []
    for e in current["exercises"]:
        earlier = None
        for s in before:
            match = next((x for x in s["exercises"] if exercise_key(x) == exercise_key(e)), None)
            if match:
                earlier = performance(s, match)
                break
        exercises.append({
            "item_id": e["item_id"],
            "current": performance(current, e),
            "previous": earlier,
            "seconds": round(e["seconds"]) if e["seconds"] is not None else None,
            "prep_seconds": round(e["prep"]) if e["seconds"] is not None else None,
            "rest_seconds": round(average(e["rests"])) if e["rests"] else None,
        })

    muscle_sets: dict[str, float] = {}
    for e in current["exercises"]:
        for muscle, credit in muscle_credit(e["muscles"]).items():
            muscle_sets[muscle] = muscle_sets.get(muscle, 0.0) + credit * e["sets"]

    return {
        "previous_session": {
            "id": previous["id"],
            "date": previous["day"],
            "minutes": round(previous["minutes"]),
            "sets": previous["sets"],
            "volume_kg": round(previous["volume"], 1),
        } if previous else None,
        "minutes": round(current["minutes"]),
        "set_seconds": round(sum(e["work"] for e in current["exercises"]) / current["sets"]) if current["sets"] else None,
        "time": {
            "prep_seconds": round(sum(e["prep"] for e in current["exercises"])),
            "work_seconds": round(sum(e["work"] for e in current["exercises"])),
            "rest_seconds": round(sum(e["rest"] for e in current["exercises"])),
        },
        "rest_seconds": round(average([r for e in current["exercises"] for r in e["rests"]])) if any(e["rests"] for e in current["exercises"]) else None,
        "exercises": exercises,
        "records": weight_records(everything, lambda s: s["id"] == session_id),
        "muscle_sets": [{"muscle": m, "sets": round(v, 2)} for m, v in sorted(muscle_sets.items(), key=lambda kv: -kv[1])],
    }


def workout_insights(workout, sessions: list[dict], everything: list[dict]) -> dict:
    planned = {item.exercise_id: item for item in workout.exercises}
    names = {item.exercise_id: item.exercise.name for item in workout.exercises}

    ready = []
    in_range = below = above = 0
    for s in sessions:
        for e in s["exercises"]:
            plan = planned.get(e["exercise_id"])
            if not plan:
                continue
            for _, reps in e["set_list"]:
                if reps < plan.reps_min:
                    below += 1
                elif plan.reps_max and reps > plan.reps_max:
                    above += 1
                else:
                    in_range += 1

    for exercise_id, plan in planned.items():
        if not plan.reps_max:
            continue
        last = next(
            (e for s in reversed(sessions) for e in s["exercises"] if e["exercise_id"] == exercise_id),
            None,
        )
        if not last or last["sets"] < plan.target_sets or not last["set_list"]:
            continue
        top = max(weight for weight, _ in last["set_list"])
        working = [reps for weight, reps in last["set_list"] if weight == top]
        if all(reps >= plan.reps_max for reps in working):
            ready.append({
                "exercise_id": exercise_id,
                "name": names[exercise_id],
                "weight_kg": top,
                "reps": min(working),
                "sets": last["sets"],
                "reps_max": plan.reps_max,
            })

    planned_sets = done_sets = extra_sets = 0
    by_exercise: dict = {}
    for s in sessions:
        done = defaultdict(int)
        for e in s["exercises"]:
            if e["exercise_id"] in planned:
                done[e["exercise_id"]] += e["sets"]
        for exercise_id, plan in planned.items():
            count = done.get(exercise_id, 0)
            planned_sets += plan.target_sets
            done_sets += min(count, plan.target_sets)
            extra_sets += max(count - plan.target_sets, 0)
            item = by_exercise.setdefault(exercise_id, {"skipped": 0, "incomplete": 0, "done": 0})
            item["done"] += count
            if count == 0:
                item["skipped"] += 1
            elif count < plan.target_sets:
                item["incomplete"] += 1
    completion = {
        "planned_sets": planned_sets,
        "done_sets": done_sets,
        "extra_sets": extra_sets,
        "pct": round(done_sets / planned_sets * 100) if planned_sets else None,
        "exercises": sorted(
            [
                {
                    "exercise_id": exercise_id,
                    "name": names[exercise_id],
                    "target_sets": planned[exercise_id].target_sets,
                    "avg_sets": round(item["done"] / len(sessions), 1),
                    "skipped": item["skipped"],
                    "incomplete": item["incomplete"],
                }
                for exercise_id, item in by_exercise.items()
                if item["skipped"] or item["incomplete"]
            ],
            key=lambda item: -(item["skipped"] * 2 + item["incomplete"]),
        ),
    } if sessions else None

    volumes: dict = {}
    for s in sessions:
        for e in s["exercises"]:
            item = volumes.setdefault(exercise_key(e), {"exercise_id": e["exercise_id"], "name": e["name"], "volume_kg": 0.0})
            item["volume_kg"] += e["volume"]
    total_volume = sum(item["volume_kg"] for item in volumes.values())
    volume_share = sorted(
        [
            {**item, "volume_kg": round(item["volume_kg"], 1), "share": round(item["volume_kg"] / total_volume, 3)}
            for item in volumes.values()
            if item["volume_kg"] > 0
        ],
        key=lambda item: -item["volume_kg"],
    ) if total_volume else []

    session_ids = {s["id"] for s in sessions}
    return {
        "ready_to_progress": ready,
        "rep_range": {"in_range": in_range, "below": below, "above": above} if in_range + below + above else None,
        "completion": completion,
        "time": time_stats(sessions),
        "records": weight_records(everything, lambda s: s["id"] in session_ids)[:8],
        "volume_share": volume_share,
    }


@fitness_stats_router.get("/workouts/{workout_id}/progress", response_model=WorkoutProgressSchema)
def get_workout_progress(
    workout_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workout = get_own_workout(workout_id, user, db)
    everything = completed_facts(user, db)
    sessions = [s for s in everything if s["workout_id"] == workout.id]

    grouped: dict = {}
    for s in sessions:
        for e in s["exercises"]:
            if e["tracking"] == "reps":
                grouped.setdefault(exercise_key(e), []).append((s, e))

    order = [item.exercise_id for item in workout.exercises]
    planned = set(order)
    keys = [key for key in order if key in grouped] + [key for key in grouped if key not in planned]

    exercises = []
    for key in keys:
        rows = grouped[key]
        first_s, first_e = rows[0]
        last_s, last_e = rows[-1]
        loads = [(load_value(e), e["e1rm"] is not None) for _, e in rows if load_value(e)]
        estimated = bool(loads) and loads[0][1] and loads[-1][1]
        first_kg = round(loads[0][0], 1) if loads else None
        last_kg = round(loads[-1][0], 1) if loads else None
        exercises.append({
            "exercise_id": last_e["exercise_id"],
            "name": last_e["name"],
            "muscle_group": last_e["muscle_group"],
            "in_workout": key in planned,
            "sessions": len(rows),
            "metric": ("e1rm" if estimated else "weight") if loads else None,
            "first_kg": first_kg,
            "last_kg": last_kg,
            "best_kg": round(max(e["top_weight"] for _, e in rows), 1) or None,
            "load_change_pct": pct(first_kg, last_kg) if len(loads) > 1 and first_kg else None,
            "first_reps": first_e["max_reps"],
            "last_reps": last_e["max_reps"],
            "reps_change_pct": pct(first_e["max_reps"], last_e["max_reps"]) if len(rows) > 1 and first_e["max_reps"] else None,
            "last_weight_kg": last_e["top_weight"],
            "last_reps_at_weight": last_e["top_reps"],
            "last_on": last_s["day"],
        })

    count = len(sessions)
    first_volume = sessions[0]["volume"] if sessions else 0
    return {
        "workout_id": workout.id,
        "name": workout.name,
        "sessions": [
            {
                "session_id": s["id"],
                "completed_at": s["completed_at"],
                "day": s["day"],
                "minutes": round(s["minutes"]),
                "sets": s["sets"],
                "volume_kg": round(s["volume"], 1),
            }
            for s in sessions
        ],
        "avg_minutes": round(sum(s["minutes"] for s in sessions) / count) if count else None,
        "avg_volume_kg": round(sum(s["volume"] for s in sessions) / count, 1) if count else None,
        "volume_change_pct": pct(first_volume, sessions[-1]["volume"]) if count > 1 and first_volume else None,
        "load_pct": mean([e["load_change_pct"] for e in exercises if e["load_change_pct"] is not None]),
        "reps_pct": mean([e["reps_change_pct"] for e in exercises if e["reps_change_pct"] is not None]),
        "exercises": exercises,
        **workout_insights(workout, sessions, everything),
    }


@fitness_stats_router.get("/progress/workouts", response_model=list[StatsWorkoutSchema])
def list_workout_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    own = {w.id: w.name for w in db.query(Workout).filter(Workout.user_id == user.id)}
    sessions = [{**s, "name": own[s["workout_id"]]} for s in completed_facts(user, db) if s["workout_id"] in own]
    return sorted(workout_stats(sessions), key=lambda i: i["last_done_on"], reverse=True)
