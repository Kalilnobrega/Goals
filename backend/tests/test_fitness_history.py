from datetime import timedelta
import pytest
from app.dates import today_br
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401
from tests.test_fitness_stats import train, at


def history(client, headers, **params):
    response = client.get("/fitness/sessions", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def names(data):
    return [item["name"] for item in data["items"]]


@pytest.fixture()
def sessions(client, library, ana, db_session):
    _, headers = ana
    upper = make_workout(client, headers, library, name="Upper A")
    lower = make_workout(client, headers, library, name="Lower A")
    free = start(client, headers)
    free = client.post(
        f"/fitness/sessions/{free['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    log_set(client, headers, free["exercises"][0]["id"], 20, 10)
    finish(client, headers, free["id"])
    from app.fitness_models import WorkoutSession
    from datetime import timezone
    stored = db_session.get(WorkoutSession, free["id"])
    stored.started_at = at(40).astimezone(timezone.utc)
    stored.completed_at = (at(40) + timedelta(minutes=30)).astimezone(timezone.utc)
    db_session.commit()
    train(client, headers, db_session, upper["id"], [[(60, 10)]], at(20))
    train(client, headers, db_session, lower["id"], [[], [(100, 10)]], at(5))
    return {"upper": upper, "lower": lower, "free": free}


def test_history_search_matches_session_or_exercise_names(client, ana, sessions):
    _, headers = ana
    assert names(history(client, headers, q="upper")) == ["Upper A"]
    assert names(history(client, headers, q="rosca")) == ["Treino livre"]
    assert sorted(names(history(client, headers, q="Leg press"))) == ["Lower A"]
    assert history(client, headers, q="nada disso")["total"] == 0


def test_history_filters_by_workout_group_and_period(client, ana, sessions):
    _, headers = ana
    assert names(history(client, headers, workout_id=sessions["upper"]["id"])) == ["Upper A"]
    assert names(history(client, headers, muscle_group="quads")) == ["Lower A"]
    assert names(history(client, headers, muscle_group="chest")) == ["Upper A"]

    recent = history(client, headers, date_from=(today_br() - timedelta(days=30)).isoformat())
    assert names(recent) == ["Lower A", "Upper A"]
    assert recent["total"] == 2

    window = history(
        client, headers,
        date_from=(today_br() - timedelta(days=45)).isoformat(),
        date_to=(today_br() - timedelta(days=10)).isoformat(),
    )
    assert names(window) == ["Upper A", "Treino livre"]


def test_history_filters_combine_and_stay_private(client, ana, bruno, sessions):
    _, headers = ana
    _, bruno_headers = bruno
    assert names(history(client, headers, q="a", muscle_group="quads")) == ["Lower A"]
    assert history(client, bruno_headers, q="upper")["total"] == 0


def test_insights_compare_with_the_previous_time(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    first = train(client, headers, db_session, workout["id"], [[(60, 10), (60, 8)], [(100, 10)]], at(14), minutes=50)
    second = train(client, headers, db_session, workout["id"], [[(70, 8), (65, 8)]], at(7), minutes=40)
    train(client, headers, db_session, workout["id"], [[(80, 5)]], at(1))

    response = client.get(f"/fitness/sessions/{second['id']}/insights", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["previous_session"]["id"] == first["id"]
    assert data["previous_session"]["minutes"] == 50
    assert data["previous_session"]["sets"] == 3
    assert data["minutes"] == 40

    bench = data["exercises"][0]
    assert bench["item_id"] == second["exercises"][0]["id"]
    assert bench["current"]["weight_kg"] == 70
    assert bench["current"]["volume_kg"] == 70 * 8 + 65 * 8
    assert bench["previous"]["session_id"] == first["id"]
    assert bench["previous"]["weight_kg"] == 60
    assert bench["previous"]["reps"] == 10

    assert [(r["name"], r["weight_kg"], r["previous_kg"]) for r in data["records"]] == [("Supino reto", 70.0, 60.0)]


def test_insights_first_time_has_no_previous(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    finish(client, headers, session["id"])
    data = client.get(f"/fitness/sessions/{session['id']}/insights", headers=headers).json()
    assert data["previous_session"] is None
    assert data["exercises"][0]["previous"] is None
    assert data["records"] == []


def test_insights_muscle_sets_use_the_role_credit(client, ana):
    _, headers = ana
    exercise = client.post(
        "/fitness/exercises",
        json={"name": "Supino teste", "muscle_group": "chest", "equipment": "barbell", "muscles": [
            {"muscle": "chest_upper", "role": "primary"},
            {"muscle": "chest_mid", "role": "secondary"},
            {"muscle": "triceps_lateral", "role": "auxiliary"},
        ]},
        headers=headers,
    ).json()
    session = start(client, headers)
    session = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": exercise["id"]}, headers=headers).json()
    for _ in range(4):
        log_set(client, headers, session["exercises"][0]["id"], 50, 10)
    finish(client, headers, session["id"])

    sets = {m["muscle"]: m["sets"] for m in client.get(f"/fitness/sessions/{session['id']}/insights", headers=headers).json()["muscle_sets"]}
    assert sets == {"chest_upper": 4.0, "chest_mid": 2.0, "triceps_lateral": 1.0}


def test_insights_are_private_and_need_a_finished_session(client, library, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    session = start(client, headers, make_workout(client, headers, library)["id"])
    assert client.get(f"/fitness/sessions/{session['id']}/insights", headers=headers).status_code == 409
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    finish(client, headers, session["id"])
    assert client.get(f"/fitness/sessions/{session['id']}/insights", headers=bruno_headers).status_code == 404
