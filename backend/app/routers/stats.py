from collections import Counter
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import today_br, to_br_date, br_day_start_utc, count_weekdays, BRT
from app.models import Goal, GoalEntry, GoalStatus, Task, TaskCompletion, User
from app.schemas import StatsResponseSchema
from app.access import member_goal_filter, completion_by, entry_by, sort_for_user
from .auth import get_current_user
from .tasks import check_and_reset_recurring_goals, to_aware_utc

stats_router = APIRouter(prefix="/stats", tags=["stats"])

HEATMAP_DAYS = 371
RECENT_CYCLES = 12
TOP_STREAKS = 3
TOP_TASKS = 5
MIN_EXPECTED_FOR_NEGLECT = 3
NEGLECT_THRESHOLD = 0.7
MIN_FORECAST_DAYS = 1


def numeric_points(goal: Goal):
    entries = sorted(goal.entries, key=lambda entry: to_aware_utc(entry.created_at))
    points = []
    if goal.create is not None:
        points.append({"date": to_aware_utc(goal.create), "value": goal.start_value or 0.0})

    running = goal.start_value or 0.0
    for entry in entries:
        if goal.numeric_mode == "latest":
            running = entry.value
        else:
            running += entry.value
        points.append({"date": to_aware_utc(entry.created_at), "value": running})
    return points


def numeric_forecast(goal: Goal, points, now: datetime):
    deadline = to_aware_utc(goal.deadline) if goal.deadline else None
    result = {
        "status": "no_data",
        "eta": None,
        "rate_per_day": None,
        "needed_per_day": None,
        "deadline": deadline,
    }

    if len(points) < 2:
        return result

    start, current = points[0]["value"], points[-1]["value"]
    remaining = goal.target_value - current
    increasing = goal.target_value >= start

    if (remaining <= 0) if increasing else (remaining >= 0):
        return {**result, "status": "reached"}

    elapsed_days = (now - points[0]["date"]).total_seconds() / 86400
    if elapsed_days < MIN_FORECAST_DAYS:
        return result

    rate = (current - start) / elapsed_days
    result["rate_per_day"] = round(rate, 4)

    if rate == 0 or (rate > 0) != (remaining > 0):
        return {**result, "status": "no_trend"}

    eta = now + timedelta(days=remaining / rate)
    result["eta"] = eta
    if deadline is None:
        result["status"] = "on_track"
    else:
        deadline_end = deadline + timedelta(days=1)
        result["status"] = "on_track" if eta <= deadline_end else "behind"
        days_left = (deadline_end - now).total_seconds() / 86400
        if result["status"] == "behind" and days_left > 0:
            result["needed_per_day"] = round(remaining / days_left, 4)
    return result


def numeric_summary(goal: Goal, now: datetime):
    points = numeric_points(goal)
    return {
        "id": goal.id,
        "title": goal.title,
        "unit": goal.unit,
        "numeric_mode": goal.numeric_mode,
        "start_value": goal.start_value,
        "target_value": goal.target_value,
        "status": goal.status,
        "points": points,
        "forecast": numeric_forecast(goal, points, now),
    }


def recurring_summary(goal: Goal):
    logs = sorted(goal.cycle_logs, key=lambda log: to_aware_utc(log.cycle_start))
    completed = sum(1 for log in logs if log.completed)
    cycles = [
        {
            "cycle_start": to_aware_utc(log.cycle_start),
            "cycle_end": to_aware_utc(log.cycle_end),
            "target": log.target_value if log.target_value is not None else log.target_count,
            "achieved": log.achieved_value if log.achieved_value is not None else log.achieved_count,
            "completed": log.completed,
        }
        for log in logs[-RECENT_CYCLES:]
    ]
    return {
        "id": goal.id,
        "title": goal.title,
        "unit": goal.unit,
        "total_cycles": len(logs),
        "completed_cycles": completed,
        "rate": round(completed / len(logs) * 100, 1) if logs else None,
        "cycles": cycles,
    }


def period_totals(days, length):
    totals = [d["tasks"] + d["entries"] for d in days]
    return {
        "current": sum(totals[-length:]),
        "previous": sum(totals[-2 * length:-length]),
    }


def streak_runs(days):
    runs = []
    run_start = None
    for index, day in enumerate(days):
        active = day["tasks"] + day["entries"] > 0
        if active and run_start is None:
            run_start = index
        if run_start is not None and (not active or index == len(days) - 1):
            end = index if active else index - 1
            runs.append(
                {
                    "start": days[run_start]["date"],
                    "end": days[end]["date"],
                    "length": end - run_start + 1,
                }
            )
            run_start = None
    return runs


def expected_occurrences(task: Task, start, end):
    if task.recurrence_weekdays:
        expected = count_weekdays(start, end, task.recurrence_weekdays)
    else:
        interval = task.recurrence_interval_days or 1
        expected = (end - start).days // interval + 1
    if task.max_recurrences is not None:
        expected = min(expected, task.max_recurrences)
    return expected


def task_rankings(tasks, completion_counts, first_day, today):
    def describe(task, **extra):
        return {
            "task_id": task.id,
            "title": task.title,
            "goal_id": task.goal.id,
            "goal_title": task.goal.title,
            **extra,
        }

    top = sorted(
        (task for task in tasks if completion_counts.get(task.id)),
        key=lambda task: (-completion_counts[task.id], task.title),
    )[:TOP_TASKS]

    neglected = []
    for task in tasks:
        if not task.is_recurring or task.goal.status == GoalStatus.COMPLETED:
            continue
        created = to_br_date(task.created_at) if task.created_at else first_day
        expected = expected_occurrences(task, max(created, first_day), today)
        if expected < MIN_EXPECTED_FOR_NEGLECT:
            continue
        done = min(completion_counts.get(task.id, 0), expected)
        rate = done / expected
        if rate < NEGLECT_THRESHOLD:
            neglected.append(describe(task, done=done, expected=expected, rate=round(rate * 100, 1)))

    neglected.sort(key=lambda item: (item["rate"], -item["expected"]))
    return (
        [describe(task, count=completion_counts[task.id]) for task in top],
        neglected[:TOP_TASKS],
    )


@stats_router.get("/", response_model=StatsResponseSchema)
async def get_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    check_and_reset_recurring_goals(current_user.id, session)

    now = datetime.now(timezone.utc)
    today = today_br()
    first_day = today - timedelta(days=HEATMAP_DAYS - 1)
    since = br_day_start_utc(first_day)

    completions = (
        session.query(TaskCompletion.task_id, TaskCompletion.completed_at, Task.goals_id)
        .join(Task)
        .join(Goal)
        .filter(
            member_goal_filter(current_user.id),
            completion_by(current_user.id),
            TaskCompletion.completed_at >= since,
        )
        .all()
    )
    entries = (
        session.query(GoalEntry.goal_id, GoalEntry.created_at)
        .join(Goal)
        .filter(
            member_goal_filter(current_user.id),
            entry_by(current_user.id),
            GoalEntry.created_at >= since,
        )
        .all()
    )

    task_counts = Counter(to_br_date(row.completed_at) for row in completions)
    entry_counts = Counter(to_br_date(row.created_at) for row in entries)
    completion_counts = Counter(row.task_id for row in completions)
    goal_task_counts = Counter((to_br_date(row.completed_at), row.goals_id) for row in completions)
    goal_entry_counts = Counter((to_br_date(row.created_at), row.goal_id) for row in entries)

    goals = sort_for_user(
        session.query(Goal).filter(member_goal_filter(current_user.id)).all(),
        current_user.id,
        session,
    )
    goals_by_day = {}
    for day, goal_id in list(goal_task_counts) + list(goal_entry_counts):
        goals_by_day.setdefault(day, set()).add(goal_id)

    completed_by_day = {}
    for goal in goals:
        if goal.status == GoalStatus.COMPLETED and goal.completed_at:
            completed_by_day.setdefault(to_br_date(goal.completed_at), []).append(goal.id)

    hours = [0] * 24
    for moment in [row.completed_at for row in completions] + [row.created_at for row in entries]:
        hours[to_aware_utc(moment).astimezone(BRT).hour] += 1

    days = []
    weekday_totals = Counter()
    for offset in range(HEATMAP_DAYS):
        day = first_day + timedelta(days=offset)
        tasks = task_counts.get(day, 0)
        entries_count = entry_counts.get(day, 0)
        goal_ids = sorted(goals_by_day.get(day, ()))
        days.append(
            {
                "date": day.isoformat(),
                "tasks": tasks,
                "entries": entries_count,
                "goals": [
                    {
                        "goal_id": goal_id,
                        "tasks": goal_task_counts.get((day, goal_id), 0),
                        "entries": goal_entry_counts.get((day, goal_id), 0),
                    }
                    for goal_id in goal_ids
                ],
                "completed_goals": completed_by_day.get(day, []),
            }
        )
        if tasks + entries_count:
            weekday_totals[day.weekday()] += tasks + entries_count

    runs = streak_runs(days)
    top_runs = sorted(reversed(runs), key=lambda run: -run["length"])[:TOP_STREAKS]

    status_counts = Counter(goal.status for goal in goals)
    user_tasks = [task for goal in goals for task in goal.tasks]
    top_tasks, neglected_tasks = task_rankings(user_tasks, completion_counts, first_day, today)

    numeric_goals = [
        numeric_summary(goal, now)
        for goal in goals
        if goal.is_numeric and not goal.is_recurring
    ]

    return {
        "days": days,
        "goals": [
            {"id": goal.id, "title": goal.title, "status": goal.status} for goal in goals
        ],
        "hours": hours,
        "summary": {
            "total_activities": sum(d["tasks"] + d["entries"] for d in days),
            "active_days": sum(1 for d in days if d["tasks"] + d["entries"]),
            "best_weekday": weekday_totals.most_common(1)[0][0] if weekday_totals else None,
            "goals_completed": status_counts.get(GoalStatus.COMPLETED, 0),
            "goals_open": status_counts.get(GoalStatus.OPEN, 0),
            "goals_late": status_counts.get(GoalStatus.LATE, 0),
        },
        "periods": {
            "week": period_totals(days, 7),
            "month": period_totals(days, 30),
        },
        "streaks": {
            "top": top_runs,
            "total_runs": len(runs),
        },
        "top_tasks": top_tasks,
        "neglected_tasks": neglected_tasks,
        "numeric_goals": numeric_goals,
        "recurring_goals": [
            recurring_summary(goal) for goal in goals if goal.is_recurring
        ],
    }
