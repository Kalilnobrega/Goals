from datetime import datetime, timezone, timedelta

from app.models import Task


def create_goal_with_recurring_task(client, auth_headers, interval_days=1):
    goal = client.post("/goals/", json={"title": "Ler"}, headers=auth_headers).json()
    task = client.post(
        f"/tasks/{goal['id']}",
        json={"title": "ler", "is_recurring": True, "recurrence_interval_days": interval_days},
        headers=auth_headers,
    ).json()
    return goal, task


def test_recurring_task_reset_keeps_original_schedule(client, auth_headers, db_session):
    _, task = create_goal_with_recurring_task(client, auth_headers, interval_days=7)

    old_reset = datetime.now(timezone.utc) - timedelta(days=15, hours=5)
    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_task.last_reset_date = old_reset
    db_task.status = True
    db_session.commit()

    client.get("/tasks/today", headers=auth_headers)

    db_session.refresh(db_task)
    assert db_task.status is False
    assert db_task.recurrence_count == 1
    expected = old_reset + timedelta(days=14)
    actual = db_task.last_reset_date.replace(tzinfo=timezone.utc)
    assert abs(actual - expected) < timedelta(seconds=1)


def test_recurring_task_not_reset_before_interval(client, auth_headers, db_session):
    _, task = create_goal_with_recurring_task(client, auth_headers, interval_days=7)

    old_reset = datetime.now(timezone.utc) - timedelta(days=6, hours=23)
    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_task.last_reset_date = old_reset
    db_task.status = True
    db_session.commit()

    client.get("/tasks/today", headers=auth_headers)

    db_session.refresh(db_task)
    assert db_task.status is True


def test_goal_page_resets_stale_recurring_task(client, auth_headers, db_session):
    goal, task = create_goal_with_recurring_task(client, auth_headers, interval_days=1)

    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_task.last_reset_date = datetime.now(timezone.utc) - timedelta(days=2)
    db_task.status = True
    db_session.commit()

    tasks = client.get(f"/tasks/goal/{goal['id']}", headers=auth_headers).json()
    assert tasks[0]["status"] is False
