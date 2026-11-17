from datetime import datetime, timedelta, timezone
from app.dates import today_br, br_day_start_utc
from app.fitness_models import WorkoutSession
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401


def overview(client, headers):
    response = client.get("/fitness/overview", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def train(client, headers, workout_id, sets=((60, 10),)):
    session = start(client, headers, workout_id)
    for weight, reps in sets:
        log_set(client, headers, session["exercises"][0]["id"], weight, reps)
    assert finish(client, headers, session["id"]).status_code == 200
    return session


def move_session(db_session, session_id, started_at, minutes=60):
    stored = db_session.get(WorkoutSession, session_id)
    stored.started_at = started_at
    stored.completed_at = started_at + timedelta(minutes=minutes)
    db_session.commit()


def test_overview_requires_authentication(client):
    assert client.get("/fitness/overview").status_code == 401


def test_overview_for_a_new_user(client, ana):
    _, headers = ana
    data = overview(client, headers)
    today = today_br()
    monday = today - timedelta(days=today.weekday())

    assert data["today"] == today.isoformat()
    assert data["active_session"] is None
    assert data["total_sessions"] == 0
    assert data["last_session"] is None
    assert data["suggested_workout"] is None
    assert data["workout_count"] == 0
    assert data["body_weight"] is None
    assert [d["date"] for d in data["week"]["days"]] == [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    assert data["week"]["sessions"] == 0
    assert data["week"]["sets"] == 0


def test_overview_week_counts_only_this_week(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    today = today_br()
    monday = today - timedelta(days=today.weekday())

    this_week = train(client, headers, workout["id"], [(60, 10), (60, 8)])
    move_session(db_session, this_week["id"], br_day_start_utc(today) + timedelta(hours=8), minutes=45)
    last_week = train(client, headers, workout["id"], [(100, 5)])
    move_session(db_session, last_week["id"], br_day_start_utc(monday) - timedelta(hours=2))

    data = overview(client, headers)
    week = data["week"]
    assert week["sessions"] == 1
    assert week["sets"] == 2
    assert week["volume_kg"] == 60 * 10 + 60 * 8
    assert week["minutes"] == 45
    assert {d["date"]: d["sessions"] for d in week["days"]}[today.isoformat()] == 1
    assert data["total_sessions"] == 2


def test_overview_shows_active_and_last_session(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    done = train(client, headers, workout["id"], [(60, 10)])
    active = start(client, headers, workout["id"])
    log_set(client, headers, active["exercises"][0]["id"], 50, 12)
    log_set(client, headers, active["exercises"][1]["id"], 120, 10)

    data = overview(client, headers)
    assert data["active_session"]["id"] == active["id"]
    assert data["active_session"]["total_sets"] == 2
    assert data["last_session"]["id"] == done["id"]
    assert data["last_session"]["total_sets"] == 1
    assert data["last_session"]["volume_kg"] == 600
    assert data["week"]["sessions"] == 1


def test_overview_suggests_the_workout_done_longest_ago(client, library, ana, db_session):
    _, headers = ana
    first = make_workout(client, headers, library, name="Treino A")
    second = make_workout(client, headers, library, name="Treino B")

    data = overview(client, headers)
    assert data["workout_count"] == 2
    assert data["suggested_workout"]["last_done_at"] is None

    session_a = train(client, headers, first["id"])
    assert overview(client, headers)["suggested_workout"]["id"] == second["id"]

    session_b = train(client, headers, second["id"])
    now = datetime.now(timezone.utc)
    move_session(db_session, session_a["id"], now - timedelta(days=3))
    move_session(db_session, session_b["id"], now - timedelta(days=1))

    suggestion = overview(client, headers)["suggested_workout"]
    assert suggestion["id"] == first["id"]
    assert suggestion["name"] == "Treino A"
    assert suggestion["exercise_count"] == 2
    assert suggestion["muscle_groups"] == ["chest", "quads"]
    assert suggestion["last_done_at"] is not None


def test_overview_body_weight_change(client, ana):
    _, headers = ana
    today = today_br()
    client.post("/fitness/body-weight", json={"weight_kg": 80}, headers=headers)
    assert overview(client, headers)["body_weight"] == {
        "weight_kg": 80.0, "measured_on": today.isoformat(), "change_kg": None, "previous_on": None,
    }

    earlier = (today - timedelta(days=7)).isoformat()
    client.post("/fitness/body-weight", json={"weight_kg": 81.5, "measured_on": earlier}, headers=headers)
    body = overview(client, headers)["body_weight"]
    assert body["weight_kg"] == 80.0
    assert body["change_kg"] == -1.5
    assert body["previous_on"] == earlier


def test_overview_is_private(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    train(client, ana_headers, make_workout(client, ana_headers, library)["id"])
    client.post("/fitness/body-weight", json={"weight_kg": 80}, headers=ana_headers)

    data = overview(client, bruno_headers)
    assert data["total_sessions"] == 0
    assert data["last_session"] is None
    assert data["suggested_workout"] is None
    assert data["body_weight"] is None
    assert data["week"]["sessions"] == 0


def calendar(client, headers, month=None):
    params = {"month": month} if month else {}
    response = client.get("/fitness/calendar", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_calendar_requires_authentication(client):
    assert client.get("/fitness/calendar").status_code == 401


def test_calendar_defaults_to_current_month(client, ana):
    _, headers = ana
    data = calendar(client, headers)
    today = today_br()
    assert data["month"] == today.strftime("%Y-%m")
    assert data["today"] == today.isoformat()
    assert data["first_session_on"] is None
    assert data["days"] == []
    assert data["total_sessions"] == 0
    assert data["days_trained"] == 0


def test_calendar_groups_sessions_by_brasilia_day(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    march_10 = br_day_start_utc(datetime(2026, 3, 10).date())
    morning = train(client, headers, workout["id"], [(60, 10)])
    move_session(db_session, morning["id"], march_10 + timedelta(hours=7))
    night = train(client, headers, workout["id"], [(60, 10), (70, 8)])
    move_session(db_session, night["id"], march_10 + timedelta(hours=23, minutes=30))
    other_day = train(client, headers, workout["id"])
    move_session(db_session, other_day["id"], march_10 + timedelta(days=5))
    april = train(client, headers, workout["id"])
    move_session(db_session, april["id"], br_day_start_utc(datetime(2026, 4, 1).date()) + timedelta(hours=1))
    early = train(client, headers, workout["id"])
    move_session(db_session, early["id"], br_day_start_utc(datetime(2026, 1, 20).date()) + timedelta(hours=9))

    data = calendar(client, headers, "2026-03")
    assert data["month"] == "2026-03"
    assert data["total_sessions"] == 3
    assert data["days_trained"] == 2
    assert [d["date"] for d in data["days"]] == ["2026-03-10", "2026-03-15"]
    first_day = data["days"][0]["sessions"]
    assert [s["id"] for s in first_day] == [morning["id"], night["id"]]
    assert first_day[1]["total_sets"] == 2
    assert first_day[1]["volume_kg"] == 60 * 10 + 70 * 8
    assert data["first_session_on"] == "2026-01-20"

    assert [d["date"] for d in calendar(client, headers, "2026-04")["days"]] == ["2026-04-01"]


def test_calendar_ignores_unfinished_and_other_users(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    workout = make_workout(client, ana_headers, library)
    train(client, ana_headers, workout["id"])
    start(client, ana_headers, workout["id"])

    assert calendar(client, ana_headers)["total_sessions"] == 1
    assert calendar(client, bruno_headers)["total_sessions"] == 0


def test_calendar_rejects_invalid_months(client, ana):
    _, headers = ana
    assert client.get("/fitness/calendar", params={"month": "2026-13"}, headers=headers).status_code == 400
    assert client.get("/fitness/calendar", params={"month": "março"}, headers=headers).status_code == 422
