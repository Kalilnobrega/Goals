from datetime import datetime, timedelta, timezone
import pytest
from app.fitness_models import Exercise, SetEntry
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="leg-press", name="Leg press", muscle_group="legs", equipment="machine"),
        Exercise(slug="rosca-direta", name="Rosca direta", muscle_group="biceps", equipment="barbell"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return {e.slug: e.id for e in exercises}


@pytest.fixture()
def ana(db_session):
    user = make_user(db_session, "Ana")
    return user, headers_for(user)


@pytest.fixture()
def bruno(db_session):
    user = make_user(db_session, "Bruno")
    return user, headers_for(user)


def make_workout(client, headers, library, name="Treino A"):
    response = client.post(
        "/fitness/workouts",
        json={
            "name": name,
            "exercises": [
                {"exercise_id": library["supino-reto"], "target_sets": 3, "reps_min": 8, "reps_max": 12, "rest_seconds": 120},
                {"exercise_id": library["leg-press"], "target_sets": 4, "reps_min": 10},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def start(client, headers, workout_id=None):
    response = client.post("/fitness/sessions", json={"workout_id": workout_id}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def log_set(client, headers, item_id, weight, reps):
    response = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": weight, "reps": reps}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def finish(client, headers, session_id, **payload):
    return client.post(f"/fitness/sessions/{session_id}/finish", json=payload, headers=headers)


def test_requires_authentication(client):
    assert client.get("/fitness/sessions/active").status_code == 401
    assert client.post("/fitness/sessions", json={}).status_code == 401
    assert client.post("/fitness/session-exercises/1/sets", json={}).status_code == 401
    assert client.patch("/fitness/sets/1", json={}).status_code == 401


def test_starting_from_workout_copies_exercises(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)

    session = start(client, headers, workout["id"])

    assert session["name"] == "Treino A"
    assert session["status"] == "in_progress"
    assert session["workout_id"] == workout["id"]
    assert [(e["exercise_name"], e["target_sets"], e["reps_min"], e["reps_max"], e["rest_seconds"]) for e in session["exercises"]] == [
        ("Supino reto", 3, 8, 12, 120),
        ("Leg press", 4, 10, None, None),
    ]
    assert client.get("/fitness/sessions/active", headers=headers).json()["id"] == session["id"]


def test_free_session_starts_empty(client, ana):
    _, headers = ana
    session = start(client, headers)
    assert session["name"] == "Treino livre"
    assert session["exercises"] == []


def test_only_one_active_session(client, library, ana):
    _, headers = ana
    first = start(client, headers)

    response = client.post("/fitness/sessions", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"]["session_id"] == first["id"]


def test_no_active_session_returns_null(client, ana):
    _, headers = ana
    assert client.get("/fitness/sessions/active", headers=headers).json() is None


def test_cannot_start_someone_elses_workout(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    workout = make_workout(client, ana_headers, library)
    response = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=bruno_headers)
    assert response.status_code == 404


def test_logs_edits_and_deletes_sets(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]

    first = log_set(client, headers, item_id, 60, 10)
    second = log_set(client, headers, item_id, 62.5, 8)
    log_set(client, headers, item_id, 0, 15)

    assert (first["position"], second["position"]) == (1, 2)
    assert second["weight_kg"] == 62.5

    edited = client.patch(f"/fitness/sets/{second['id']}", json={"reps": 9}, headers=headers).json()
    assert (edited["weight_kg"], edited["reps"]) == (62.5, 9)

    assert client.delete(f"/fitness/sets/{first['id']}", headers=headers).status_code == 200
    sets = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"][0]["sets"]
    assert [(s["position"], s["weight_kg"], s["reps"]) for s in sets] == [(1, 62.5, 9), (2, 0, 15)]


@pytest.mark.parametrize("payload", [{"weight_kg": -1, "reps": 10}, {"weight_kg": 50, "reps": 0}, {"weight_kg": 50}])
def test_rejects_invalid_sets(client, library, ana, payload):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    response = client.post(
        f"/fitness/session-exercises/{session['exercises'][0]['id']}/sets", json=payload, headers=headers
    )
    assert response.status_code == 422


def test_volume_and_totals(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    bench, legs = (e["id"] for e in session["exercises"])
    log_set(client, headers, bench, 60, 10)
    log_set(client, headers, bench, 62.5, 8)
    log_set(client, headers, legs, 0, 20)

    data = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()

    assert data["total_sets"] == 3
    assert data["volume_kg"] == 1100.0


def test_finish_requires_a_set(client, ana):
    _, headers = ana
    session = start(client, headers)
    assert finish(client, headers, session["id"]).status_code == 400


def test_finish_closes_session_and_blocks_changes(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    entry = log_set(client, headers, item_id, 60, 10)

    response = finish(client, headers, session["id"])

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["completed_at"] is not None
    assert client.get("/fitness/sessions/active", headers=headers).json() is None
    assert finish(client, headers, session["id"]).status_code == 409
    assert client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": 1, "reps": 1}, headers=headers
    ).status_code == 409
    assert client.patch(f"/fitness/sets/{entry['id']}", json={"reps": 1}, headers=headers).status_code == 409
    assert start(client, headers)["status"] == "in_progress"


def test_finish_with_custom_end_time(client, library, ana, db_session):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    entry = log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    last_set_at = datetime.fromisoformat(entry["created_at"])

    data = finish(client, headers, session["id"], completed_at=last_set_at.isoformat()).json()
    assert datetime.fromisoformat(data["completed_at"]) == last_set_at
    assert datetime.fromisoformat(data["last_activity_at"]) == last_set_at


def test_finish_rejects_end_time_out_of_range(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    started = datetime.fromisoformat(session["started_at"])

    for when in (started - timedelta(hours=1), datetime.now(timezone.utc) + timedelta(hours=1)):
        assert finish(client, headers, session["id"], completed_at=when.isoformat()).status_code == 400


def test_last_activity_uses_latest_set(client, library, ana, db_session):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    entry = log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    stored = db_session.get(SetEntry, entry["id"])
    stored.created_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db_session.commit()

    data = client.get("/fitness/sessions/active", headers=headers).json()
    assert datetime.fromisoformat(data["last_activity_at"]) > datetime.fromisoformat(entry["created_at"])


def test_previous_performance_comes_from_last_completed_session(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    first = start(client, headers, workout["id"])
    log_set(client, headers, first["exercises"][0]["id"], 60, 10)
    log_set(client, headers, first["exercises"][0]["id"], 60, 9)
    finish(client, headers, first["id"])

    second = start(client, headers, workout["id"])

    bench, legs = second["exercises"]
    assert bench["previous"] == [{"weight_kg": 60.0, "reps": 10}, {"weight_kg": 60.0, "reps": 9}]
    assert bench["previous_at"] is not None
    assert legs["previous"] == []
    assert legs["previous_at"] is None


def test_add_swap_and_remove_exercises_mid_session(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])

    added = client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    assert [e["exercise_name"] for e in added["exercises"]] == ["Supino reto", "Leg press", "Rosca direta"]

    legs_id = added["exercises"][1]["id"]
    swapped = client.patch(
        f"/fitness/session-exercises/{legs_id}", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    assert swapped["exercises"][1]["exercise_name"] == "Rosca direta"

    removed = client.delete(f"/fitness/session-exercises/{legs_id}", headers=headers).json()
    assert [e["exercise_name"] for e in removed["exercises"]] == ["Supino reto", "Rosca direta"]

    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert [e["exercise"]["name"] for e in stored["exercises"]] == ["Supino reto", "Leg press"]


def test_cannot_swap_exercise_with_sets(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    log_set(client, headers, item_id, 60, 10)

    response = client.patch(
        f"/fitness/session-exercises/{item_id}", json={"exercise_id": library["leg-press"]}, headers=headers
    )
    assert response.status_code == 409


def test_rest_edit_is_saved_to_the_workout(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    legs_id = session["exercises"][1]["id"]

    data = client.patch(f"/fitness/session-exercises/{legs_id}", json={"rest_seconds": 90}, headers=headers).json()
    assert data["exercises"][1]["rest_seconds"] == 90

    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert [e["rest_seconds"] for e in stored["exercises"]] == [120, 90]

    cleared = client.patch(f"/fitness/session-exercises/{legs_id}", json={"rest_seconds": None}, headers=headers).json()
    assert cleared["exercises"][1]["rest_seconds"] is None


def test_added_exercise_reuses_last_rest(client, library, ana):
    _, headers = ana
    first = start(client, headers)
    added = client.post(
        f"/fitness/sessions/{first['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    item_id = added["exercises"][0]["id"]
    client.patch(f"/fitness/session-exercises/{item_id}", json={"rest_seconds": 75}, headers=headers)
    log_set(client, headers, item_id, 20, 12)
    finish(client, headers, first["id"])

    second = start(client, headers)
    again = client.post(
        f"/fitness/sessions/{second['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    assert again["exercises"][0]["rest_seconds"] == 75


def test_discarding_session(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)

    assert client.delete(f"/fitness/sessions/{session['id']}", headers=headers).status_code == 200
    assert client.get("/fitness/sessions/active", headers=headers).json() is None
    assert client.get(f"/fitness/sessions/{session['id']}", headers=headers).status_code == 404


def test_history_survives_workout_and_exercise_changes(client, library, ana):
    _, headers = ana
    custom = client.post(
        "/fitness/exercises", json={"name": "Remada articulada", "muscle_group": "back", "equipment": "machine"}, headers=headers
    ).json()
    workout = client.post(
        "/fitness/workouts",
        json={"name": "Costas", "exercises": [{"exercise_id": custom["id"], "target_sets": 3, "reps_min": 10}]},
        headers=headers,
    ).json()
    session = start(client, headers, workout["id"])
    log_set(client, headers, session["exercises"][0]["id"], 40, 12)
    finish(client, headers, session["id"])

    client.delete(f"/fitness/workouts/{workout['id']}", headers=headers)
    assert client.delete(f"/fitness/exercises/{custom['id']}", headers=headers).status_code == 200

    data = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert data["name"] == "Costas"
    assert data["exercises"][0]["exercise_name"] == "Remada articulada"
    assert data["exercises"][0]["exercise_id"] is None
    assert data["volume_kg"] == 480.0


def test_other_users_cannot_touch_session(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    session = start(client, ana_headers, make_workout(client, ana_headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    entry = log_set(client, ana_headers, item_id, 60, 10)

    assert client.get(f"/fitness/sessions/{session['id']}", headers=bruno_headers).status_code == 404
    assert finish(client, bruno_headers, session["id"]).status_code == 404
    assert client.delete(f"/fitness/sessions/{session['id']}", headers=bruno_headers).status_code == 404
    assert client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["leg-press"]}, headers=bruno_headers
    ).status_code == 404
    assert client.patch(f"/fitness/session-exercises/{item_id}", json={"rest_seconds": 10}, headers=bruno_headers).status_code == 404
    assert client.delete(f"/fitness/session-exercises/{item_id}", headers=bruno_headers).status_code == 404
    assert client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": 1, "reps": 1}, headers=bruno_headers
    ).status_code == 404
    assert client.patch(f"/fitness/sets/{entry['id']}", json={"reps": 1}, headers=bruno_headers).status_code == 404
    assert client.delete(f"/fitness/sets/{entry['id']}", headers=bruno_headers).status_code == 404
    assert client.get("/fitness/sessions/active", headers=bruno_headers).json() is None


def test_cannot_add_foreign_custom_exercise(client, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    secret = client.post(
        "/fitness/exercises", json={"name": "Secreto", "muscle_group": "back", "equipment": "machine"}, headers=bruno_headers
    ).json()
    session = start(client, ana_headers)
    response = client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": secret["id"]}, headers=ana_headers
    )
    assert response.status_code == 404
