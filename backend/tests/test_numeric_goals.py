from datetime import datetime, timezone, timedelta

from app.models import Goal, GoalEntry, User
from app.routers.auth import create_token


def create_numeric_goal(client, auth_headers, **fields):
    payload = {"title": "Correr", "target_value": 100, "unit": "km", **fields}
    return client.post("/goals/", json=payload, headers=auth_headers)


def add_entry(client, auth_headers, goal_id, value, note=None):
    return client.post(
        f"/goals/{goal_id}/entries",
        json={"value": value, "note": note},
        headers=auth_headers,
    )


def get_goal(client, auth_headers, goal_id):
    return client.get(f"/goals/{goal_id}", headers=auth_headers).json()


def test_numeric_goal_defaults_to_sum_mode(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()

    assert goal["is_numeric"] is True
    assert goal["numeric_mode"] == "sum"
    assert goal["current_value"] == 0
    assert goal["progress"] == 0


def test_sum_goal_progress_accumulates_entries(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()

    add_entry(client, auth_headers, goal["id"], 30)
    add_entry(client, auth_headers, goal["id"], 12.5)

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["current_value"] == 42.5
    assert updated["progress"] == 42.5
    assert updated["status"] == "open"


def test_sum_goal_uses_start_value(client, auth_headers):
    goal = create_numeric_goal(
        client, auth_headers, title="Juntar", target_value=10000, start_value=2000, unit="R$"
    ).json()

    add_entry(client, auth_headers, goal["id"], 2000)

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["current_value"] == 4000
    assert updated["progress"] == 25.0


def test_reaching_target_completes_goal_and_deleting_entry_reopens(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()
    add_entry(client, auth_headers, goal["id"], 60)
    last = add_entry(client, auth_headers, goal["id"], 40).json()

    assert get_goal(client, auth_headers, goal["id"])["status"] == "completed"

    client.delete(f"/goals/{goal['id']}/entries/{last['id']}", headers=auth_headers)

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["status"] == "open"
    assert updated["current_value"] == 60


def test_latest_mode_tracks_decreasing_measurement(client, auth_headers):
    goal = create_numeric_goal(
        client,
        auth_headers,
        title="Peso",
        numeric_mode="latest",
        start_value=80,
        target_value=75,
        unit="kg",
    ).json()

    add_entry(client, auth_headers, goal["id"], 79)
    add_entry(client, auth_headers, goal["id"], 78)

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["current_value"] == 78
    assert updated["progress"] == 40.0

    add_entry(client, auth_headers, goal["id"], 74.8)
    assert get_goal(client, auth_headers, goal["id"])["status"] == "completed"


def test_latest_mode_without_entries_uses_start_value(client, auth_headers):
    goal = create_numeric_goal(
        client, auth_headers, numeric_mode="latest", start_value=80, target_value=75
    ).json()

    assert goal["current_value"] == 80
    assert goal["progress"] == 0


def test_latest_mode_requires_start_value(client, auth_headers):
    resp = create_numeric_goal(client, auth_headers, numeric_mode="latest", target_value=75)

    assert resp.status_code == 400


def test_latest_mode_cannot_be_recurring(client, auth_headers):
    resp = create_numeric_goal(
        client,
        auth_headers,
        numeric_mode="latest",
        start_value=80,
        target_value=75,
        is_recurring=True,
        recurrence_interval_days=7,
    )

    assert resp.status_code == 400


def test_sum_goal_target_must_exceed_start(client, auth_headers):
    resp = create_numeric_goal(client, auth_headers, target_value=100, start_value=100)

    assert resp.status_code == 400


def test_edit_cannot_make_numeric_goal_invalid(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()

    resp = client.put(
        f"/goals/{goal['id']}", json={"target_value": -5}, headers=auth_headers
    )

    assert resp.status_code == 400
    assert get_goal(client, auth_headers, goal["id"])["target_value"] == 100


def test_edit_updates_numeric_fields(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()

    client.put(
        f"/goals/{goal['id']}",
        json={"target_value": 200, "unit": "mi"},
        headers=auth_headers,
    )

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["target_value"] == 200
    assert updated["unit"] == "mi"


def test_entries_rejected_on_task_goal(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Projeto"}, headers=auth_headers).json()

    resp = add_entry(client, auth_headers, goal["id"], 5)

    assert resp.status_code == 400


def test_entries_listed_newest_first(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()
    add_entry(client, auth_headers, goal["id"], 1, "primeiro")
    add_entry(client, auth_headers, goal["id"], 2, "segundo")

    entries = client.get(f"/goals/{goal['id']}/entries", headers=auth_headers).json()

    assert [e["note"] for e in entries] == ["segundo", "primeiro"]


def test_entries_of_other_user_are_hidden(client, auth_headers, db_session):
    goal = create_numeric_goal(client, auth_headers).json()
    other = User(name="Outro", email="outro@example.com", password="x", is_verify=True)
    db_session.add(other)
    db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_token(other.id)}"}

    assert client.get(f"/goals/{goal['id']}/entries", headers=other_headers).status_code == 404
    assert add_entry(client, other_headers, goal["id"], 5).status_code == 404


def test_recurring_numeric_goal_counts_current_cycle_only(client, auth_headers, db_session):
    goal = create_numeric_goal(
        client,
        auth_headers,
        title="Correr por semana",
        target_value=20,
        is_recurring=True,
        recurrence_interval_days=7,
    ).json()

    old_cycle_start = datetime.now(timezone.utc) - timedelta(days=8)
    db_goal = db_session.query(Goal).filter(Goal.id == goal["id"]).first()
    db_goal.cycle_start_date = old_cycle_start
    db_session.add(
        GoalEntry(goal_id=goal["id"], value=25, created_at=old_cycle_start + timedelta(days=1))
    )
    db_session.commit()

    add_entry(client, auth_headers, goal["id"], 5)

    updated = get_goal(client, auth_headers, goal["id"])
    assert updated["current_value"] == 5
    assert updated["progress"] == 25.0
    assert updated["status"] == "open"

    cycles = client.get(f"/goals/{goal['id']}/cycles", headers=auth_headers).json()
    assert len(cycles) == 1
    assert cycles[0]["target_value"] == 20
    assert cycles[0]["achieved_value"] == 25
    assert cycles[0]["completed"] is True


def test_entry_counts_for_streak_and_deleting_it_undoes(client, auth_headers):
    goal = create_numeric_goal(client, auth_headers).json()

    entry = add_entry(client, auth_headers, goal["id"], 5).json()
    assert client.get("/auth/me/streak", headers=auth_headers).json()["current_streak"] == 1

    client.delete(f"/goals/{goal['id']}/entries/{entry['id']}", headers=auth_headers)
    assert client.get("/auth/me/streak", headers=auth_headers).json()["current_streak"] == 0


def test_task_goal_progress_unchanged(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Projeto"}, headers=auth_headers).json()

    assert goal["is_numeric"] is False
    assert goal["current_value"] is None
