from datetime import timedelta
import pytest
from app.dates import today_br
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401


def create_plan(client, headers, name="Treino 1", days=(), **extra):
    response = client.post(
        "/fitness/plans",
        json={"name": name, "days": [{"weekday": d, "workout_id": w} for d, w in days], **extra},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture()
def split(client, library, ana):
    _, headers = ana
    return {name: make_workout(client, headers, library, name=name)["id"] for name in ["Upper A", "Lower A", "Upper B", "Lower B"]}


def test_plans_require_authentication(client):
    assert client.get("/fitness/plans").status_code == 401
    assert client.post("/fitness/plans", json={"name": "x"}).status_code == 401


def test_create_plan_with_days(client, ana, split):
    _, headers = ana
    plan = create_plan(client, headers, days=[
        (0, split["Upper A"]), (1, split["Lower A"]), (3, split["Upper B"]), (4, split["Lower B"]),
    ])
    assert plan["name"] == "Treino 1"
    assert plan["is_active"] is True
    assert [(d["weekday"], d["workout_name"]) for d in plan["days"]] == [
        (0, "Upper A"), (1, "Lower A"), (3, "Upper B"), (4, "Lower B"),
    ]
    assert plan["days"][0]["exercise_count"] == 2
    assert plan["days"][0]["total_sets"] == 7
    assert plan["days"][0]["muscle_groups"] == ["chest", "quads"]


def test_only_one_plan_is_active(client, ana, split):
    _, headers = ana
    first = create_plan(client, headers, "Treino 1", [(0, split["Upper A"])])
    second = create_plan(client, headers, "Treino 2", [(0, split["Lower A"])])
    assert first["is_active"] is True
    assert second["is_active"] is False

    activated = client.post(f"/fitness/plans/{second['id']}/activate", headers=headers).json()
    assert activated["is_active"] is True
    plans = client.get("/fitness/plans", headers=headers).json()
    assert [(p["name"], p["is_active"]) for p in plans] == [("Treino 2", True), ("Treino 1", False)]

    third = create_plan(client, headers, "Treino 3", is_active=True)
    assert third["is_active"] is True
    assert sum(p["is_active"] for p in client.get("/fitness/plans", headers=headers).json()) == 1

    deactivated = client.post(f"/fitness/plans/{third['id']}/deactivate", headers=headers).json()
    assert deactivated["is_active"] is False
    assert not any(p["is_active"] for p in client.get("/fitness/plans", headers=headers).json())


def test_same_workout_on_several_days_and_duplicates_are_merged(client, ana, split):
    _, headers = ana
    plan = create_plan(client, headers, days=[
        (0, split["Upper A"]), (3, split["Upper A"]), (0, split["Upper A"]), (0, split["Lower A"]),
    ])
    assert [(d["weekday"], d["workout_name"]) for d in plan["days"]] == [
        (0, "Upper A"), (0, "Lower A"), (3, "Upper A"),
    ]


def test_update_replaces_name_and_days(client, ana, split):
    _, headers = ana
    plan = create_plan(client, headers, days=[(0, split["Upper A"]), (1, split["Lower A"])])
    response = client.put(
        f"/fitness/plans/{plan['id']}",
        json={"name": "Treino PPL", "days": [{"weekday": 2, "workout_id": split["Upper B"]}]},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Treino PPL"
    assert [(d["weekday"], d["workout_name"]) for d in data["days"]] == [(2, "Upper B")]
    assert data["is_active"] is True


@pytest.mark.parametrize("payload", [
    {"name": "   "},
    {"name": "x" * 61},
    {"name": "Plano", "days": [{"weekday": 7, "workout_id": 1}]},
    {"name": "Plano", "days": [{"weekday": -1, "workout_id": 1}]},
])
def test_invalid_plans_are_rejected(client, ana, payload):
    _, headers = ana
    assert client.post("/fitness/plans", json=payload, headers=headers).status_code == 422


def test_plan_cannot_use_someone_elses_workout(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    secret = make_workout(client, bruno_headers, library, name="Do Bruno")
    response = client.post(
        "/fitness/plans", json={"name": "Plano", "days": [{"weekday": 0, "workout_id": secret["id"]}]}, headers=ana_headers
    )
    assert response.status_code == 404


def test_plans_are_private(client, ana, bruno, split):
    _, ana_headers = ana
    _, bruno_headers = bruno
    plan = create_plan(client, ana_headers, days=[(0, split["Upper A"])])
    assert client.get("/fitness/plans", headers=bruno_headers).json() == []
    assert client.get(f"/fitness/plans/{plan['id']}", headers=bruno_headers).status_code == 404
    assert client.put(f"/fitness/plans/{plan['id']}", json={"name": "x"}, headers=bruno_headers).status_code == 404
    assert client.post(f"/fitness/plans/{plan['id']}/activate", headers=bruno_headers).status_code == 404
    assert client.delete(f"/fitness/plans/{plan['id']}", headers=bruno_headers).status_code == 404


def test_delete_plan(client, ana, split):
    _, headers = ana
    plan = create_plan(client, headers, days=[(0, split["Upper A"])])
    assert client.delete(f"/fitness/plans/{plan['id']}", headers=headers).status_code == 200
    assert client.get("/fitness/plans", headers=headers).json() == []
    assert client.get(f"/fitness/workouts/{split['Upper A']}", headers=headers).status_code == 200


def test_deleting_a_workout_removes_it_from_plans(client, ana, split):
    _, headers = ana
    plan = create_plan(client, headers, days=[(0, split["Upper A"]), (1, split["Lower A"])])
    assert client.delete(f"/fitness/workouts/{split['Upper A']}", headers=headers).status_code == 200
    days = client.get(f"/fitness/plans/{plan['id']}", headers=headers).json()["days"]
    assert [d["workout_name"] for d in days] == ["Lower A"]


def test_overview_shows_todays_plan(client, ana, split):
    _, headers = ana
    today = today_br()
    tomorrow = today + timedelta(days=1)
    create_plan(client, headers, days=[
        (today.weekday(), split["Upper A"]), (today.weekday(), split["Lower A"]), (tomorrow.weekday(), split["Upper B"]),
    ])

    data = client.get("/fitness/overview", headers=headers).json()
    plan = data["plan"]
    assert plan["name"] == "Treino 1"
    assert [(w["name"], w["done"]) for w in plan["today"]] == [("Upper A", False), ("Lower A", False)]
    assert plan["next"] == {"date": tomorrow.isoformat(), "workouts": ["Upper B"]}
    assert data["suggested_workout"]["id"] == split["Upper A"]
    week_today = next(d for d in data["week"]["days"] if d["date"] == today.isoformat())
    assert [p["name"] for p in week_today["planned"]] == ["Upper A", "Lower A"]

    session = start(client, headers, split["Upper A"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    finish(client, headers, session["id"])

    data = client.get("/fitness/overview", headers=headers).json()
    assert [(w["name"], w["done"]) for w in data["plan"]["today"]] == [("Upper A", True), ("Lower A", False)]
    assert data["plan"]["today"][0]["last_done_at"] is not None
    assert data["suggested_workout"]["id"] == split["Lower A"]
    week_today = next(d for d in data["week"]["days"] if d["date"] == today.isoformat())
    assert [p["done"] for p in week_today["planned"]] == [True, False]
    assert week_today["trained"] == [{"id": session["id"], "name": "Upper A"}]


def test_overview_without_plan_or_on_rest_day(client, ana, split):
    _, headers = ana
    assert client.get("/fitness/overview", headers=headers).json()["plan"] is None

    rest_day = (today_br().weekday() + 2) % 7
    create_plan(client, headers, days=[(rest_day, split["Upper A"])])
    plan = client.get("/fitness/overview", headers=headers).json()["plan"]
    assert plan["today"] == []
    assert plan["next"]["workouts"] == ["Upper A"]
