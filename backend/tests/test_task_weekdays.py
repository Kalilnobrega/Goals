from datetime import date, timedelta, timezone

from app.dates import br_day_start_utc, count_weekdays, last_scheduled_day, today_br
from app.models import Task


def create_goal(client, auth_headers, **fields):
    return client.post(
        "/goals/", json={"title": "Academia", **fields}, headers=auth_headers
    ).json()


def create_weekday_task(client, auth_headers, goal_id, weekdays, **fields):
    return client.post(
        f"/tasks/{goal_id}",
        json={
            "title": "treino",
            "is_recurring": True,
            "recurrence_weekdays": weekdays,
            **fields,
        },
        headers=auth_headers,
    )


def set_task(db_session, task_id, **fields):
    task = db_session.query(Task).filter(Task.id == task_id).first()
    for key, value in fields.items():
        setattr(task, key, value)
    db_session.commit()
    return task


def test_count_weekdays():
    monday = date(2026, 10, 12)
    assert count_weekdays(monday, monday + timedelta(days=13), [0, 2, 4]) == 6
    assert count_weekdays(monday, monday + timedelta(days=1), [3]) == 0
    assert count_weekdays(monday, monday - timedelta(days=1), [0]) == 0


def test_last_scheduled_day():
    monday = date(2026, 10, 12)
    assert last_scheduled_day(monday, monday + timedelta(days=4), [0, 2]) == monday + timedelta(days=2)
    assert last_scheduled_day(monday, monday + timedelta(days=1), [0]) is None
    assert last_scheduled_day(monday - timedelta(days=30), monday, [6]) == monday - timedelta(days=1)


def test_create_task_with_weekdays_sorts_and_dedupes(client, auth_headers):
    goal = create_goal(client, auth_headers)

    task = create_weekday_task(client, auth_headers, goal["id"], [4, 0, 2, 0]).json()

    assert task["recurrence_weekdays"] == [0, 2, 4]


def test_create_task_rejects_invalid_weekday(client, auth_headers):
    goal = create_goal(client, auth_headers)

    resp = create_weekday_task(client, auth_headers, goal["id"], [7])

    assert resp.status_code == 422


def test_task_resets_on_scheduled_day(client, auth_headers, db_session):
    today = today_br()
    goal = create_goal(client, auth_headers)
    task = create_weekday_task(client, auth_headers, goal["id"], [today.weekday()]).json()
    set_task(
        db_session,
        task["id"],
        status=True,
        last_reset_date=br_day_start_utc(today - timedelta(days=3)),
    )

    client.get("/tasks/today", headers=auth_headers)

    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_session.refresh(db_task)
    assert db_task.status is False
    assert db_task.recurrence_count == 1
    assert db_task.last_reset_date.replace(tzinfo=timezone.utc) == br_day_start_utc(today)


def test_task_does_not_reset_without_scheduled_day(client, auth_headers, db_session):
    today = today_br()
    tomorrow_weekday = (today.weekday() + 1) % 7
    goal = create_goal(client, auth_headers)
    task = create_weekday_task(client, auth_headers, goal["id"], [tomorrow_weekday]).json()
    set_task(
        db_session,
        task["id"],
        status=True,
        last_reset_date=br_day_start_utc(today - timedelta(days=1)),
    )

    client.get("/tasks/today", headers=auth_headers)

    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_session.refresh(db_task)
    assert db_task.status is True


def test_today_list_only_shows_tasks_scheduled_today(client, auth_headers):
    today = today_br()
    goal = create_goal(client, auth_headers)
    scheduled = create_weekday_task(client, auth_headers, goal["id"], [today.weekday()]).json()
    create_weekday_task(client, auth_headers, goal["id"], [(today.weekday() + 1) % 7])
    plain = client.post(
        f"/tasks/{goal['id']}", json={"title": "avulsa"}, headers=auth_headers
    ).json()

    today_tasks = client.get("/tasks/today", headers=auth_headers).json()

    assert sorted(t["id"] for t in today_tasks) == sorted([scheduled["id"], plain["id"]])
    assert next(t for t in today_tasks if t["id"] == scheduled["id"])["recurrence_weekdays"] == [
        today.weekday()
    ]


def test_end_of_goal_counts_scheduled_days_until_deadline(client, auth_headers):
    today = today_br()
    deadline = today + timedelta(days=13)
    goal = create_goal(client, auth_headers, deadline=f"{deadline}T00:00:00")

    task = create_weekday_task(
        client, auth_headers, goal["id"], [0, 3], end_of_goal=True
    ).json()

    assert task["max_recurrences"] == 4


def test_edit_sets_and_clears_weekdays(client, auth_headers):
    goal = create_goal(client, auth_headers)
    task = client.post(
        f"/tasks/{goal['id']}",
        json={"title": "treino", "is_recurring": True, "recurrence_interval_days": 1},
        headers=auth_headers,
    ).json()

    updated = client.put(
        f"/tasks/{task['id']}", json={"recurrence_weekdays": [1, 3]}, headers=auth_headers
    ).json()
    assert updated["recurrence_weekdays"] == [1, 3]

    cleared = client.put(
        f"/tasks/{task['id']}", json={"recurrence_weekdays": []}, headers=auth_headers
    ).json()
    assert cleared["recurrence_weekdays"] is None
