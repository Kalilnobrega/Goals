from datetime import datetime, timezone, timedelta

from app.models import Goal, TaskCompletion


def create_recurring_goal(client, auth_headers, target=4, interval_days=7):
    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": interval_days,
            "recurrence_target": target,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()


def create_recurring_task(client, auth_headers, goal_id):
    resp = client.post(
        f"/tasks/{goal_id}",
        json={"title": "treino", "is_recurring": True, "recurrence_interval_days": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()


def test_create_recurring_goal_sets_cycle_start_date(client, auth_headers):
    goal = create_recurring_goal(client, auth_headers)
    assert goal["is_recurring"] is True
    assert goal["cycle_start_date"] is not None
    assert goal["current_cycle_progress"] == 0
    assert goal["progress"] == 0.0


def test_progress_reflects_cycle_target_not_task_count(client, auth_headers):
    goal = create_recurring_goal(client, auth_headers, target=4)
    task = create_recurring_task(client, auth_headers, goal["id"])

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["current_cycle_progress"] == 1
    assert updated["progress"] == 25.0


def test_goal_status_stays_open_when_cycle_target_hit(client, auth_headers):
    goal = create_recurring_goal(client, auth_headers, target=1)
    task = create_recurring_task(client, auth_headers, goal["id"])

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["progress"] == 100.0
    assert updated["status"] == "open"


def test_untoggling_task_removes_completion(client, auth_headers):
    goal = create_recurring_goal(client, auth_headers, target=2)
    task = create_recurring_task(client, auth_headers, goal["id"])

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["current_cycle_progress"] == 0
    assert updated["progress"] == 0.0


def test_cycle_reset_logs_missed_cycle_and_starts_new_one(client, auth_headers, db_session):
    goal = create_recurring_goal(client, auth_headers, target=4, interval_days=7)
    task = create_recurring_task(client, auth_headers, goal["id"])

    old_cycle_start = datetime.now(timezone.utc) - timedelta(days=8)
    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = old_cycle_start
    db_session.add(
        TaskCompletion(task_id=task["id"], completed_at=old_cycle_start + timedelta(days=1))
    )
    db_session.commit()

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["current_cycle_progress"] == 0
    assert updated["cycle_start_date"] != old_cycle_start.isoformat()

    cycles = client.get(f"/goals/{goal['id']}/cycles", headers=auth_headers).json()
    assert len(cycles) == 1
    assert cycles[0]["target_count"] == 4
    assert cycles[0]["achieved_count"] == 1
    assert cycles[0]["completed"] is False


def test_cycle_reset_logs_completed_cycle_when_target_hit(client, auth_headers, db_session):
    goal = create_recurring_goal(client, auth_headers, target=1, interval_days=7)
    task = create_recurring_task(client, auth_headers, goal["id"])

    old_cycle_start = datetime.now(timezone.utc) - timedelta(days=8)
    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = old_cycle_start
    db_session.add(
        TaskCompletion(task_id=task["id"], completed_at=old_cycle_start + timedelta(days=1))
    )
    db_session.commit()

    client.get(f"/goals/{goal['id']}", headers=auth_headers)

    cycles = client.get(f"/goals/{goal['id']}/cycles", headers=auth_headers).json()
    assert len(cycles) == 1
    assert cycles[0]["completed"] is True


def test_recurring_goal_disables_after_deadline_passes(client, auth_headers, db_session):
    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar ate o fim do mes",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 1,
            "deadline": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        },
        headers=auth_headers,
    )
    goal = resp.json()

    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = datetime.now(timezone.utc) - timedelta(days=8)
    db_session.commit()

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["is_recurring"] is False


def test_non_recurring_goal_progress_still_based_on_tasks(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Aprender X"}, headers=auth_headers).json()
    task = client.post(
        f"/tasks/{goal['id']}",
        json={"title": "estudar", "is_recurring": False},
        headers=auth_headers,
    ).json()

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["progress"] == 100.0
    assert updated["status"] == "completed"
