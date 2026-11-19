from datetime import datetime, timedelta, timezone
import pytest
from app.fitness_models import Exercise, SetEntry
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="leg-press", name="Leg press", muscle_group="quads", equipment="machine"),
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
    assert response.status_code in (400, 422)


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
    assert [(p["weight_kg"], p["reps"], p["side"]) for p in bench["previous"]] == [(60.0, 10, None), (60.0, 9, None)]
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


def test_reorder_exercises_mid_session(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    bench_id, legs_id = [e["id"] for e in session["exercises"]]
    log_set(client, headers, bench_id, 60, 10)

    reordered = client.put(
        f"/fitness/sessions/{session['id']}/order", json={"exercise_ids": [legs_id, bench_id]}, headers=headers
    )
    assert reordered.status_code == 200, reordered.text
    assert [e["exercise_name"] for e in reordered.json()["exercises"]] == ["Leg press", "Supino reto"]
    assert len(reordered.json()["exercises"][1]["sets"]) == 1

    added = client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    assert [e["exercise_name"] for e in added["exercises"]] == ["Leg press", "Supino reto", "Rosca direta"]

    fetched = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert [e["exercise_name"] for e in fetched["exercises"]] == ["Leg press", "Supino reto", "Rosca direta"]

    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert [e["exercise"]["name"] for e in stored["exercises"]] == ["Supino reto", "Leg press"]


@pytest.mark.parametrize("case", ["empty", "missing", "duplicate", "foreign"])
def test_reorder_rejects_lists_that_do_not_match(client, library, ana, case):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    bench_id, legs_id = [e["id"] for e in session["exercises"]]
    payload = {
        "empty": [],
        "missing": [bench_id],
        "duplicate": [bench_id, bench_id],
        "foreign": [bench_id, legs_id + 999],
    }[case]
    response = client.put(f"/fitness/sessions/{session['id']}/order", json={"exercise_ids": payload}, headers=headers)
    assert response.status_code == 409


def test_reorder_finished_session(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    for item in session["exercises"]:
        log_set(client, headers, item["id"], 60, 10)
    assert finish(client, headers, session["id"]).status_code == 200
    ids = [e["id"] for e in client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"]]
    response = client.put(
        f"/fitness/sessions/{session['id']}/order", json={"exercise_ids": ids[::-1]}, headers=headers
    )
    assert response.status_code == 200
    assert [e["id"] for e in response.json()["exercises"]] == ids[::-1]


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
    assert client.put(
        f"/fitness/sessions/{session['id']}/order",
        json={"exercise_ids": [e["id"] for e in session["exercises"]]},
        headers=bruno_headers,
    ).status_code == 404
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


def completed_session(client, headers, library, sets, workout_id=None):
    session = start(client, headers, workout_id)
    if workout_id is None:
        session = client.post(
            f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
        ).json()
    items = session["exercises"]
    for index, (weight, reps) in enumerate(sets):
        log_set(client, headers, items[index % len(items)]["id"], weight, reps)
    assert finish(client, headers, session["id"]).status_code == 200
    return session


def history(client, headers, **params):
    response = client.get("/fitness/sessions", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_history_requires_authentication(client):
    assert client.get("/fitness/sessions").status_code == 401


def test_history_lists_completed_sessions_newest_first(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    first = completed_session(client, headers, library, [(60, 10)], workout["id"])
    second = completed_session(client, headers, library, [(20, 12)])
    start(client, headers, workout["id"])

    data = history(client, headers)
    assert [item["id"] for item in data["items"]] == [second["id"], first["id"]]
    assert data["total"] == 2
    assert data["has_more"] is False
    assert data["items"][1]["name"] == "Treino A"
    assert data["items"][0]["name"] == "Treino livre"
    assert data["items"][0]["workout_id"] is None


def test_history_totals_skip_exercises_without_sets(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    completed_session(client, headers, library, [(60, 10), (100, 12), (62.5, 8)], workout["id"])

    item = history(client, headers)["items"][0]
    assert item["exercise_count"] == 2
    assert item["total_sets"] == 3
    assert item["volume_kg"] == 60 * 10 + 100 * 12 + 62.5 * 8
    assert item["muscle_groups"] == ["chest", "quads"]
    assert item["completed_at"] >= item["started_at"]


def test_history_paginates(client, library, ana):
    _, headers = ana
    ids = [completed_session(client, headers, library, [(10, 10)])["id"] for _ in range(5)]

    page = history(client, headers, limit=2)
    assert [item["id"] for item in page["items"]] == ids[::-1][:2]
    assert page["total"] == 5
    assert page["has_more"] is True

    last = history(client, headers, limit=2, offset=4)
    assert [item["id"] for item in last["items"]] == [ids[0]]
    assert last["has_more"] is False


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 51}, {"offset": -1}])
def test_history_rejects_bad_pagination(client, ana, params):
    _, headers = ana
    assert client.get("/fitness/sessions", params=params, headers=headers).status_code == 422


def test_history_is_private(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    completed_session(client, ana_headers, library, [(60, 10)])
    data = history(client, bruno_headers)
    assert data == {"items": [], "total": 0, "has_more": False}


def test_history_keeps_sessions_after_workout_is_deleted(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    completed_session(client, headers, library, [(60, 10)], workout["id"])
    assert client.delete(f"/fitness/workouts/{workout['id']}", headers=headers).status_code == 200

    item = history(client, headers)["items"][0]
    assert item["name"] == "Treino A"
    assert item["workout_id"] is None
    assert item["total_sets"] == 1


def test_retrying_a_set_with_the_same_client_id_does_not_duplicate(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    payload = {"weight_kg": 60, "reps": 10, "client_id": "7f3c2a1e-0000-4000-8000-000000000001"}

    first = client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=headers)
    retry = client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=headers)
    other = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={**payload, "client_id": "7f3c2a1e-0000-4000-8000-000000000002"}, headers=headers
    )

    assert first.status_code == retry.status_code == other.status_code == 200
    assert retry.json()["id"] == first.json()["id"]
    assert retry.json()["client_id"] == payload["client_id"]
    assert other.json()["id"] != first.json()["id"]
    sets = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"][0]["sets"]
    assert [s["position"] for s in sets] == [1, 2]


def test_retry_after_finishing_returns_the_saved_set(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    payload = {"weight_kg": 60, "reps": 10, "client_id": "7f3c2a1e-0000-4000-8000-000000000003"}
    saved = client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=headers).json()
    assert finish(client, headers, session["id"]).status_code == 200

    retry = client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=headers)
    assert retry.status_code == 200
    assert retry.json()["id"] == saved["id"]

    fresh = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={**payload, "client_id": "7f3c2a1e-0000-4000-8000-000000000004"}, headers=headers
    )
    assert fresh.status_code == 200
    assert fresh.json()["id"] != saved["id"]


def test_client_id_is_scoped_to_the_owner(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    session = start(client, ana_headers, make_workout(client, ana_headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    payload = {"weight_kg": 60, "reps": 10, "client_id": "7f3c2a1e-0000-4000-8000-000000000005"}
    client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=ana_headers)
    assert client.post(f"/fitness/session-exercises/{item_id}/sets", json=payload, headers=bruno_headers).status_code == 404


@pytest.mark.parametrize("client_id", ["short", "x" * 37, "not valid!"])
def test_invalid_client_id_is_rejected(client, library, ana, client_id):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    response = client.post(
        f"/fitness/session-exercises/{session['exercises'][0]['id']}/sets",
        json={"weight_kg": 60, "reps": 10, "client_id": client_id},
        headers=headers,
    )
    assert response.status_code == 422


def test_session_exercise_note_is_saved_and_shown_next_time(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    bench_id = session["exercises"][0]["id"]
    log_set(client, headers, bench_id, 60, 10)

    data = client.patch(f"/fitness/session-exercises/{bench_id}", json={"note": "  execução boa  "}, headers=headers).json()
    assert data["exercises"][0]["note"] == "execução boa"
    assert client.patch(f"/fitness/session-exercises/{bench_id}", json={"note": "x" * 201}, headers=headers).status_code == 422
    finish(client, headers, session["id"])

    history = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert history["exercises"][0]["note"] == "execução boa"

    following = start(client, headers, workout["id"])
    assert following["exercises"][0]["note"] is None
    assert following["exercises"][0]["previous_note"] == "execução boa"

    cleared = client.patch(f"/fitness/session-exercises/{following['exercises'][0]['id']}", json={"note": "   "}, headers=headers).json()
    assert cleared["exercises"][0]["note"] is None



def log_side(client, headers, item_id, weight, reps, side):
    response = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": weight, "reps": reps, "side": side}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_unilateral_sets_pair_by_side_and_count_as_one_series(client, library, ana, db_session):
    from app.fitness_models import Exercise
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    assert session["exercises"][0]["unilateral"] is False
    bench_id = session["exercises"][0]["id"]

    data = client.patch(f"/fitness/session-exercises/{bench_id}", json={"unilateral": True}, headers=headers).json()
    assert data["exercises"][0]["unilateral"] is True

    log_side(client, headers, bench_id, 25, 12, "left")
    log_side(client, headers, bench_id, 22.5, 10, "right")
    right = log_side(client, headers, bench_id, 22.5, 9, "right")
    assert right["position"] == 2
    left = log_side(client, headers, bench_id, 25, 11, "left")
    assert left["position"] == 2

    current = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    sets = current["exercises"][0]["sets"]
    assert [(s["position"], s["side"]) for s in sets] == [(1, "left"), (1, "right"), (2, "right"), (2, "left")]
    assert current["total_sets"] == 2
    assert client.patch(f"/fitness/session-exercises/{bench_id}", json={"unilateral": False}, headers=headers).status_code == 409

    client.delete(f"/fitness/sets/{sets[0]['id']}", headers=headers)
    after = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"][0]["sets"]
    assert sorted((s["position"], s["side"]) for s in after) == [(1, "left"), (1, "right"), (2, "right")]

    finish(client, headers, session["id"])
    history = client.get("/fitness/sessions", headers=headers).json()["items"][0]
    assert history["total_sets"] == 2

    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert stored["exercises"][0]["unilateral"] is None
    following = start(client, headers, workout["id"])
    assert following["exercises"][0]["unilateral"] is False
    assert {p["side"] for p in following["exercises"][0]["previous"]} == {"left", "right"}

    progress = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()["points"][0]
    assert progress["sets"] == 2
    assert progress["left_max_weight_kg"] == 25.0
    assert progress["right_max_weight_kg"] == 22.5


def test_unilateral_exercises_start_unilateral(client, ana, db_session):
    from app.fitness_models import Exercise
    _, headers = ana
    exercise = Exercise(slug="extensora-uni", name="Extensora unilateral", muscle_group="quads", equipment="machine", is_unilateral=True)
    db_session.add(exercise)
    db_session.commit()
    session = start(client, headers)
    data = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": exercise.id}, headers=headers).json()
    assert data["exercises"][0]["unilateral"] is True

    created = client.post(
        "/fitness/exercises",
        json={"name": "Remada serrote", "muscle_group": "back", "equipment": "dumbbell", "is_unilateral": True},
        headers=headers,
    ).json()
    assert created["is_unilateral"] is True



def test_timed_and_cardio_sets(client, ana, db_session):
    from app.fitness_models import Exercise
    _, headers = ana
    plank = Exercise(slug="prancha-teste", name="Prancha teste", muscle_group="abs", equipment="bodyweight", tracking="time")
    bike = Exercise(slug="bike-teste", name="Bike teste", muscle_group="cardio", equipment="cardio", tracking="cardio")
    db_session.add_all([plank, bike])
    db_session.commit()
    session = start(client, headers)
    for exercise in (plank, bike):
        client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": exercise.id}, headers=headers)
    items = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"]
    assert [i["tracking"] for i in items] == ["time", "cardio"]
    plank_id, bike_id = items[0]["id"], items[1]["id"]

    assert client.post(f"/fitness/session-exercises/{plank_id}/sets", json={"weight_kg": 0}, headers=headers).status_code == 400
    hold = client.post(f"/fitness/session-exercises/{plank_id}/sets", json={"duration_seconds": 75, "weight_kg": 10}, headers=headers).json()
    assert (hold["duration_seconds"], hold["reps"], hold["weight_kg"]) == (75, 0, 10.0)

    ride = client.post(
        f"/fitness/session-exercises/{bike_id}/sets",
        json={"duration_seconds": 1200, "level": 8, "distance_km": 9.5, "weight_kg": 50},
        headers=headers,
    ).json()
    assert (ride["duration_seconds"], ride["level"], ride["distance_km"], ride["weight_kg"], ride["speed_kmh"]) == (1200, 8, 9.5, 0.0, None)

    edited = client.patch(f"/fitness/sets/{ride['id']}", json={"speed_kmh": 28.5, "level": None}, headers=headers).json()
    assert (edited["speed_kmh"], edited["level"]) == (28.5, None)
    assert client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["volume_kg"] == 0



def test_edit_finished_session_from_history(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item_id = session["exercises"][0]["id"]
    entry = log_set(client, headers, item_id, 60, 10)
    finished = finish(client, headers, session["id"]).json()

    edited = client.patch(f"/fitness/sets/{entry['id']}", json={"weight_kg": 62.5, "reps": 8}, headers=headers).json()
    assert (edited["weight_kg"], edited["reps"]) == (62.5, 8)
    added = client.post(f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": 60, "reps": 9}, headers=headers)
    assert added.status_code == 200
    assert added.json()["position"] == 2
    noted = client.patch(f"/fitness/session-exercises/{item_id}", json={"note": "banco 3"}, headers=headers)
    assert noted.status_code == 200
    assert client.patch(f"/fitness/session-exercises/{item_id}", json={"rest_seconds": 60}, headers=headers).status_code == 409
    assert client.delete(f"/fitness/sets/{added.json()['id']}", headers=headers).status_code == 200

    detail = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert detail["status"] == "completed"
    assert detail["completed_at"] == finished["completed_at"]
    assert detail["volume_kg"] == 500
    assert detail["exercises"][0]["note"] == "banco 3"

    other = detail["exercises"][1]["id"] if len(detail["exercises"]) > 1 else None
    if other:
        assert client.delete(f"/fitness/session-exercises/{other}", headers=headers).status_code == 200



def test_swap_exercise_with_sets_in_finished_session(client, library, ana, db_session):
    from app.fitness_models import Exercise
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    item = session["exercises"][0]
    log_set(client, headers, item["id"], 60, 10)
    finish(client, headers, session["id"])

    swapped = client.patch(f"/fitness/session-exercises/{item['id']}", json={"exercise_id": library["leg-press"]}, headers=headers)
    assert swapped.status_code == 200
    first = swapped.json()["exercises"][0]
    assert first["exercise_id"] == library["leg-press"]
    assert [(s["weight_kg"], s["reps"]) for s in first["sets"]] == [(60.0, 10)]

    bike = Exercise(slug="bike-troca", name="Bike troca", muscle_group="cardio", equipment="cardio", tracking="cardio")
    db_session.add(bike)
    db_session.commit()
    assert client.patch(f"/fitness/session-exercises/{item['id']}", json={"exercise_id": bike.id}, headers=headers).status_code == 409
