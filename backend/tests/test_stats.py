from datetime import datetime, timezone, timedelta

from app.dates import today_br, br_day_start_utc
from app.models import Goal, GoalCycleLog, GoalEntry, Task, TaskCompletion


def get_stats(client, auth_headers):
    resp = client.get("/stats/", headers=auth_headers)
    assert resp.status_code == 200
    return resp.json()


def create_task(client, auth_headers, goal_id, title="tarefa"):
    return client.post(
        f"/tasks/{goal_id}",
        json={"title": title, "is_recurring": False},
        headers=auth_headers,
    ).json()


def test_stats_empty_user(client, auth_headers):
    stats = get_stats(client, auth_headers)

    assert len(stats["days"]) == 371
    assert stats["days"][-1]["date"] == today_br().isoformat()
    assert stats["summary"] == {
        "total_activities": 0,
        "active_days": 0,
        "best_weekday": None,
        "goals_completed": 0,
        "goals_open": 0,
        "goals_late": 0,
    }
    assert stats["numeric_goals"] == []
    assert stats["recurring_goals"] == []


def test_stats_counts_task_completions_and_entries_today(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Meta"}, headers=auth_headers).json()
    first = create_task(client, auth_headers, goal["id"], "a")
    create_task(client, auth_headers, goal["id"], "b")
    client.patch(f"/tasks/{first['id']}/toggle", headers=auth_headers)

    numeric = client.post(
        "/goals/", json={"title": "Correr", "target_value": 100, "unit": "km"}, headers=auth_headers
    ).json()
    client.post(f"/goals/{numeric['id']}/entries", json={"value": 5}, headers=auth_headers)

    stats = get_stats(client, auth_headers)
    today = stats["days"][-1]

    assert today == {"date": today_br().isoformat(), "tasks": 1, "entries": 1}
    assert stats["summary"]["total_activities"] == 2
    assert stats["summary"]["active_days"] == 1
    assert stats["summary"]["best_weekday"] == today_br().weekday()
    assert stats["summary"]["goals_open"] == 2


def test_stats_ignores_unchecked_tasks(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Meta"}, headers=auth_headers).json()
    task = create_task(client, auth_headers, goal["id"])
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    stats = get_stats(client, auth_headers)
    assert stats["summary"]["total_activities"] == 0


def test_stats_numeric_goal_points_accumulate(client, auth_headers):
    goal = client.post(
        "/goals/",
        json={"title": "Correr", "target_value": 100, "start_value": 10, "unit": "km"},
        headers=auth_headers,
    ).json()
    client.post(f"/goals/{goal['id']}/entries", json={"value": 5}, headers=auth_headers)
    client.post(f"/goals/{goal['id']}/entries", json={"value": 7}, headers=auth_headers)

    [numeric] = get_stats(client, auth_headers)["numeric_goals"]
    assert [p["value"] for p in numeric["points"]] == [10, 15, 22]
    assert numeric["target_value"] == 100


def test_stats_latest_goal_points_follow_measurements(client, auth_headers):
    goal = client.post(
        "/goals/",
        json={
            "title": "Peso",
            "target_value": 70,
            "start_value": 80,
            "unit": "kg",
            "numeric_mode": "latest",
        },
        headers=auth_headers,
    ).json()
    client.post(f"/goals/{goal['id']}/entries", json={"value": 78}, headers=auth_headers)
    client.post(f"/goals/{goal['id']}/entries", json={"value": 77.5}, headers=auth_headers)

    [numeric] = get_stats(client, auth_headers)["numeric_goals"]
    assert [p["value"] for p in numeric["points"]] == [80, 78, 77.5]


def test_stats_recurring_goal_cycle_rate(client, auth_headers, db_session):
    goal = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 3,
        },
        headers=auth_headers,
    ).json()

    start = datetime.now(timezone.utc) - timedelta(days=21)
    for index, completed in enumerate([True, False, True]):
        cycle_start = start + timedelta(days=7 * index)
        db_session.add(
            GoalCycleLog(
                goal_id=goal["id"],
                cycle_start=cycle_start,
                cycle_end=cycle_start + timedelta(days=7),
                target_count=3,
                achieved_count=3 if completed else 1,
                completed=completed,
            )
        )
    db_session.commit()

    [recurring] = get_stats(client, auth_headers)["recurring_goals"]
    assert recurring["total_cycles"] == 3
    assert recurring["completed_cycles"] == 2
    assert recurring["rate"] == 66.7
    assert [c["completed"] for c in recurring["cycles"]] == [True, False, True]
    assert recurring["cycles"][1]["achieved"] == 1


def test_stats_only_includes_own_data(client, auth_headers, db_session):
    other = Goal(user_id=999, title="Outra", target_value=10)
    db_session.add(other)
    db_session.commit()

    stats = get_stats(client, auth_headers)
    assert stats["numeric_goals"] == []
    assert stats["summary"]["goals_open"] == 0


def create_goal_with_task(client, auth_headers, title="tarefa", **task_fields):
    goal = client.post("/goals/", json={"title": "Meta"}, headers=auth_headers).json()
    task = client.post(
        f"/tasks/{goal['id']}",
        json={"title": title, "is_recurring": False, **task_fields},
        headers=auth_headers,
    ).json()
    return goal, task


def add_completion(db_session, task_id, days_ago, hour_br=12):
    moment = br_day_start_utc(today_br() - timedelta(days=days_ago)) + timedelta(hours=hour_br)
    db_session.add(TaskCompletion(task_id=task_id, completed_at=moment))


def test_stats_hours_use_brasilia_time(client, auth_headers, db_session):
    _, task = create_goal_with_task(client, auth_headers)
    add_completion(db_session, task["id"], 1, hour_br=7)
    add_completion(db_session, task["id"], 2, hour_br=7)
    add_completion(db_session, task["id"], 3, hour_br=22)
    db_session.commit()

    hours = get_stats(client, auth_headers)["hours"]
    assert len(hours) == 24
    assert hours[7] == 2
    assert hours[22] == 1
    assert sum(hours) == 3


def test_stats_periods_compare_with_previous_window(client, auth_headers, db_session):
    _, task = create_goal_with_task(client, auth_headers)
    for days_ago in [0, 3, 6, 8, 20, 40]:
        add_completion(db_session, task["id"], days_ago)
    db_session.commit()

    periods = get_stats(client, auth_headers)["periods"]
    assert periods["week"] == {"current": 3, "previous": 1}
    assert periods["month"] == {"current": 5, "previous": 1}


def test_stats_streak_runs_rank_longest(client, auth_headers, db_session):
    _, task = create_goal_with_task(client, auth_headers)
    for days_ago in [0, 1, 10, 11, 12, 13, 20, 30, 31]:
        add_completion(db_session, task["id"], days_ago)
    db_session.commit()

    streaks = get_stats(client, auth_headers)["streaks"]
    today = today_br()
    assert streaks["total_runs"] == 4
    assert [run["length"] for run in streaks["top"]] == [4, 2, 2]
    assert streaks["top"][0] == {
        "start": (today - timedelta(days=13)).isoformat(),
        "end": (today - timedelta(days=10)).isoformat(),
        "length": 4,
    }
    assert streaks["top"][1]["end"] == today.isoformat()


def test_stats_top_tasks_ranked_by_completions(client, auth_headers, db_session):
    goal, first = create_goal_with_task(client, auth_headers, "ler")
    second = client.post(
        f"/tasks/{goal['id']}", json={"title": "correr", "is_recurring": False}, headers=auth_headers
    ).json()
    for days_ago in range(3):
        add_completion(db_session, second["id"], days_ago)
    add_completion(db_session, first["id"], 1)
    db_session.commit()

    top = get_stats(client, auth_headers)["top_tasks"]
    assert [(t["title"], t["count"]) for t in top] == [("correr", 3), ("ler", 1)]
    assert top[0]["goal_title"] == "Meta"


def test_stats_neglected_recurring_tasks(client, auth_headers, db_session):
    _, daily = create_goal_with_task(
        client, auth_headers, "diaria", is_recurring=True, recurrence_interval_days=1
    )
    _, kept = create_goal_with_task(
        client, auth_headers, "em dia", is_recurring=True, recurrence_interval_days=1
    )
    created = datetime.now(timezone.utc) - timedelta(days=9)
    for task_id in (daily["id"], kept["id"]):
        db_session.get(Task, task_id).created_at = created
    for days_ago in range(10):
        add_completion(db_session, kept["id"], days_ago)
    add_completion(db_session, daily["id"], 2)
    db_session.commit()

    neglected = get_stats(client, auth_headers)["neglected_tasks"]
    assert [t["title"] for t in neglected] == ["diaria"]
    assert neglected[0]["done"] == 1
    assert neglected[0]["expected"] == 10
    assert neglected[0]["rate"] == 10.0


def test_stats_neglect_ignores_young_tasks(client, auth_headers):
    create_goal_with_task(client, auth_headers, "nova", is_recurring=True, recurrence_interval_days=1)
    assert get_stats(client, auth_headers)["neglected_tasks"] == []


def make_numeric_goal(db_session, user, days_ago, values, **fields):
    now = datetime.now(timezone.utc)
    goal = Goal(user_id=user.id, title="Numerica", create=now - timedelta(days=days_ago), **fields)
    db_session.add(goal)
    db_session.commit()
    for index, value in enumerate(values):
        db_session.add(
            GoalEntry(goal_id=goal.id, value=value, created_at=now - timedelta(days=days_ago - index - 1))
        )
    db_session.commit()
    return goal


def get_forecast(client, auth_headers):
    [goal] = get_stats(client, auth_headers)["numeric_goals"]
    return goal["forecast"]


def test_forecast_sum_goal_projects_eta(client, auth_headers, db_session, user):
    make_numeric_goal(db_session, user, 10, [10] * 5, target_value=100, start_value=0)

    forecast = get_forecast(client, auth_headers)
    assert forecast["status"] == "on_track"
    assert abs(forecast["rate_per_day"] - 5) < 0.01
    eta = datetime.fromisoformat(forecast["eta"])
    assert abs((eta - datetime.now(timezone.utc)).days - 10) <= 1


def test_forecast_behind_deadline(client, auth_headers, db_session, user):
    deadline = datetime.now(timezone.utc) + timedelta(days=3)
    make_numeric_goal(db_session, user, 10, [10], target_value=100, start_value=0, deadline=deadline)

    forecast = get_forecast(client, auth_headers)
    assert forecast["status"] == "behind"
    assert 20 < forecast["needed_per_day"] < 25


def test_forecast_latest_goal_decreasing(client, auth_headers, db_session, user):
    make_numeric_goal(
        db_session, user, 10, [79, 78], target_value=70, start_value=80, numeric_mode="latest"
    )

    forecast = get_forecast(client, auth_headers)
    assert forecast["status"] == "on_track"
    assert forecast["rate_per_day"] < 0


def test_forecast_wrong_direction_has_no_trend(client, auth_headers, db_session, user):
    make_numeric_goal(
        db_session, user, 10, [82], target_value=70, start_value=80, numeric_mode="latest"
    )

    forecast = get_forecast(client, auth_headers)
    assert forecast["status"] == "no_trend"
    assert forecast["eta"] is None


def test_forecast_reached_and_no_data(client, auth_headers, db_session, user):
    make_numeric_goal(db_session, user, 10, [60, 50], target_value=100, start_value=0)
    assert get_forecast(client, auth_headers)["status"] == "reached"


def test_forecast_without_entries_has_no_data(client, auth_headers):
    client.post("/goals/", json={"title": "Correr", "target_value": 100}, headers=auth_headers)
    assert get_forecast(client, auth_headers)["status"] == "no_data"
