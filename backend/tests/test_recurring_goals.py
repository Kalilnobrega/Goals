from datetime import datetime, timezone, timedelta

from app.models import Goal, Task, TaskCompletion


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


def test_cycle_reset_logs_every_missed_cycle_without_drift(client, auth_headers, db_session):
    goal = create_recurring_goal(client, auth_headers, target=1, interval_days=7)
    task = create_recurring_task(client, auth_headers, goal["id"])

    old_cycle_start = datetime.now(timezone.utc) - timedelta(days=22)
    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = old_cycle_start
    db_session.add(
        TaskCompletion(task_id=task["id"], completed_at=old_cycle_start + timedelta(days=8))
    )
    db_session.commit()

    client.get(f"/goals/{goal['id']}", headers=auth_headers)

    cycles = client.get(f"/goals/{goal['id']}/cycles", headers=auth_headers).json()
    assert len(cycles) == 3
    assert [c["completed"] for c in cycles] == [False, True, False]

    db_session.refresh(db_goal)
    expected_start = old_cycle_start + timedelta(days=21)
    actual_start = db_goal.cycle_start_date.replace(tzinfo=timezone.utc)
    assert abs(actual_start - expected_start) < timedelta(seconds=1)


def move_cycle_back(db_session, goal_id, days=8):
    db_goal = db_session.query(Goal).filter(Goal.id == goal_id).first()
    db_goal.cycle_start_date = datetime.now(timezone.utc) - timedelta(days=days)
    db_session.commit()


def test_cycle_reset_unchecks_plain_tasks(client, auth_headers, db_session):
    goal = create_recurring_goal(client, auth_headers, target=1, interval_days=7)
    task = client.post(
        f"/tasks/{goal['id']}", json={"title": "ler"}, headers=auth_headers
    ).json()
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    move_cycle_back(db_session, goal["id"])

    tasks = client.get(f"/tasks/goal/{goal['id']}", headers=auth_headers).json()
    assert tasks[0]["status"] is False


def test_cycle_reset_unchecks_recurring_tasks_and_counts_recurrence(client, auth_headers, db_session):
    goal = create_recurring_goal(client, auth_headers, target=1, interval_days=7)
    task = client.post(
        f"/tasks/{goal['id']}",
        json={"title": "ler", "is_recurring": True, "recurrence_interval_days": 7},
        headers=auth_headers,
    ).json()
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    move_cycle_back(db_session, goal["id"])

    tasks = client.get(f"/tasks/goal/{goal['id']}", headers=auth_headers).json()
    assert tasks[0]["status"] is False

    db_task = db_session.query(Task).filter(Task.id == task["id"]).first()
    db_session.refresh(db_task)
    assert db_task.recurrence_count == 1


def test_cycle_reset_does_not_uncheck_tasks_when_goal_ends(client, auth_headers, db_session):
    goal = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 1,
            "deadline": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        },
        headers=auth_headers,
    ).json()
    task = client.post(
        f"/tasks/{goal['id']}", json={"title": "ler"}, headers=auth_headers
    ).json()
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    move_cycle_back(db_session, goal["id"])

    tasks = client.get(f"/tasks/goal/{goal['id']}", headers=auth_headers).json()
    assert tasks[0]["status"] is True


def test_create_recurring_goal_with_past_cycle_start(client, auth_headers):
    from app.dates import today_br, br_day_start_utc

    yesterday = today_br() - timedelta(days=1)
    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 4,
            "cycle_start_date": yesterday.isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    goal = resp.json()
    start = datetime.fromisoformat(goal["cycle_start_date"])
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    assert start == br_day_start_utc(yesterday)
    ends = datetime.fromisoformat(goal["cycle_ends_at"])
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    assert ends == br_day_start_utc(yesterday) + timedelta(days=7)


def test_future_cycle_start_ignores_completions_before_it(client, auth_headers):
    from app.dates import today_br, br_day_start_utc

    start = today_br() + timedelta(days=3)
    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 4,
            "cycle_start_date": start.isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    goal = resp.json()
    stored = datetime.fromisoformat(goal["cycle_start_date"])
    if stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    assert stored == br_day_start_utc(start)

    task = create_recurring_task(client, auth_headers, goal["id"])
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    updated = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert updated["current_cycle_progress"] == 0
    assert updated["status"] == "open"


def test_cycle_start_must_be_before_deadline(client, auth_headers):
    from app.dates import today_br

    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 4,
            "deadline": (today_br() + timedelta(days=5)).isoformat() + "T00:00:00Z",
            "cycle_start_date": (today_br() + timedelta(days=10)).isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_create_recurring_goal_rejects_cycle_start_older_than_interval(client, auth_headers):
    from app.dates import today_br

    resp = client.post(
        "/goals/",
        json={
            "title": "Treinar",
            "is_recurring": True,
            "recurrence_interval_days": 7,
            "recurrence_target": 4,
            "cycle_start_date": (today_br() - timedelta(days=7)).isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_edit_cycle_start_moves_current_cycle(client, auth_headers):
    from app.dates import today_br, br_day_start_utc

    goal = create_recurring_goal(client, auth_headers)
    day = today_br() - timedelta(days=2)
    resp = client.put(
        f"/goals/{goal['id']}",
        json={"cycle_start_date": day.isoformat()},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    start = datetime.fromisoformat(resp.json()["cycle_start_date"])
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    assert start == br_day_start_utc(day)


def test_edit_cycle_start_cannot_overlap_logged_cycle(client, auth_headers, db_session):
    from app.dates import today_br

    goal = create_recurring_goal(client, auth_headers, interval_days=7)
    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = datetime.now(timezone.utc) - timedelta(days=8)
    db_session.commit()
    client.get(f"/goals/{goal['id']}", headers=auth_headers)

    resp = client.put(
        f"/goals/{goal['id']}",
        json={"cycle_start_date": (today_br() - timedelta(days=2)).isoformat()},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_create_recurring_goal_without_cycle_start_begins_at_br_midnight(client, auth_headers):
    from app.dates import today_br, br_day_start_utc

    goal = create_recurring_goal(client, auth_headers)
    start = datetime.fromisoformat(goal["cycle_start_date"]).replace(tzinfo=timezone.utc)
    assert start == br_day_start_utc(today_br())


def test_turning_goal_recurring_starts_cycle_at_br_midnight(client, auth_headers):
    from app.dates import today_br, br_day_start_utc

    resp = client.post("/goals/", json={"title": "Ler"}, headers=auth_headers)
    goal_id = resp.json()["id"]

    resp = client.put(
        f"/goals/{goal_id}",
        json={"is_recurring": True, "recurrence_interval_days": 7, "recurrence_target": 3},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    start = datetime.fromisoformat(resp.json()["cycle_start_date"]).replace(tzinfo=timezone.utc)
    assert start == br_day_start_utc(today_br())
