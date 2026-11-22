import pytest
from app.fitness_models import Exercise
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="prancha", name="Prancha", muscle_group="abs", equipment="bodyweight", tracking="time"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return {e.slug: e.id for e in exercises}


@pytest.fixture()
def headers(db_session):
    return headers_for(make_user(db_session, "Ana"))


def save_workout(client, headers, exercises):
    return client.post("/fitness/workouts", json={"name": "Treino A", "exercises": exercises}, headers=headers)


def bench(library, **extra):
    return {"exercise_id": library["supino-reto"], "target_sets": 3, "reps_min": 8, "reps_max": 12, **extra}


def start(client, headers, workout_id):
    response = client.post("/fitness/sessions", json={"workout_id": workout_id}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def log(client, headers, item_id, weight, reps, **extra):
    response = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": weight, "reps": reps, **extra}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_ficha_saves_set_plan_with_warmups_outside_target_sets(client, library, headers):
    response = save_workout(client, headers, [bench(library, set_plan=["warmup", "normal", "normal", "drop"])])
    assert response.status_code == 200, response.text
    item = response.json()["exercises"][0]
    assert item["target_sets"] == 3
    assert item["set_plan"] == ["warmup", "normal", "normal", "drop"]


def test_ficha_drops_a_plan_with_only_normal_sets(client, library, headers):
    item = save_workout(client, headers, [bench(library, set_plan=["normal", "normal", "normal"])]).json()["exercises"][0]
    assert item["set_plan"] is None


def test_ficha_rejects_plan_that_does_not_match_target_sets(client, library, headers):
    response = save_workout(client, headers, [bench(library, set_plan=["warmup", "normal", "drop"])])
    assert response.status_code == 422


def test_ficha_ignores_plan_for_timed_exercises(client, library, headers):
    response = save_workout(client, headers, [{"exercise_id": library["prancha"], "target_sets": 2, "reps_min": 30, "set_plan": ["failure", "failure"]}])
    assert response.json()["exercises"][0]["set_plan"] is None


def test_session_copies_plan(client, library, headers):
    workout = save_workout(client, headers, [bench(library, set_plan=["warmup", "normal", "normal", "failure"])]).json()
    session = start(client, headers, workout["id"])
    assert session["exercises"][0]["set_plan"] == ["warmup", "normal", "normal", "failure"]


def test_warmup_is_kept_out_of_counts_volume_and_records(client, library, headers):
    workout = save_workout(client, headers, [bench(library, set_plan=["warmup", "normal", "normal", "normal"])]).json()
    session = start(client, headers, workout["id"])
    item_id = session["exercises"][0]["id"]

    warmup = log(client, headers, item_id, 0, 0, kind="warmup", rir=2)
    assert warmup["kind"] == "warmup"
    assert warmup["rir"] is None
    assert (warmup["weight_kg"], warmup["reps"]) == (0, 0)
    assert warmup["record"] is None
    log(client, headers, item_id, 60, 10)

    fetched = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert fetched["total_sets"] == 1
    assert fetched["volume_kg"] == 600

    assert client.post(f"/fitness/sessions/{session['id']}/finish", json={}, headers=headers).status_code == 200
    history = client.get("/fitness/sessions", headers=headers).json()["items"][0]
    assert history["total_sets"] == 1
    assert history["volume_kg"] == 600

    progress = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()
    assert progress["points"][0]["sets"] == 1
    assert progress["points"][0]["volume_kg"] == 600


def test_heavy_warmup_does_not_count_as_record(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    first = start(client, headers, workout["id"])
    log(client, headers, first["exercises"][0]["id"], 60, 10)
    client.post(f"/fitness/sessions/{first['id']}/finish", json={}, headers=headers)

    second = start(client, headers, workout["id"])
    item_id = second["exercises"][0]["id"]
    heavy = log(client, headers, item_id, 80, 3, kind="warmup")
    assert heavy["record"] is None
    assert (heavy["weight_kg"], heavy["reps"]) == (0, 0)
    assert log(client, headers, item_id, 62.5, 8)["record"]["previous_weight_kg"] == 60


def test_failure_sets_rir_to_zero(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    session = start(client, headers, workout["id"])
    entry = log(client, headers, session["exercises"][0]["id"], 60, 9, kind="failure", rir=3)
    assert entry["kind"] == "failure"
    assert entry["rir"] == 0


def test_drop_stages_add_to_volume_but_not_to_series(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    session = start(client, headers, workout["id"])
    item_id = session["exercises"][0]["id"]
    entry = log(client, headers, item_id, 60, 8, kind="drop")

    response = client.patch(
        f"/fitness/sets/{entry['id']}",
        json={"stages": [{"weight_kg": 45, "reps": 8}, {"weight_kg": 30, "reps": 7}]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["stages"] == [{"weight_kg": 45, "reps": 8}, {"weight_kg": 30, "reps": 7}]

    fetched = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert fetched["total_sets"] == 1
    assert fetched["volume_kg"] == 60 * 8 + 45 * 8 + 30 * 7

    client.post(f"/fitness/sessions/{session['id']}/finish", json={}, headers=headers)
    assert client.get("/fitness/sessions", headers=headers).json()["items"][0]["volume_kg"] == 60 * 8 + 45 * 8 + 30 * 7


def test_stages_need_a_drop_or_rest_pause_set(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    session = start(client, headers, workout["id"])
    entry = log(client, headers, session["exercises"][0]["id"], 60, 8)
    response = client.patch(f"/fitness/sets/{entry['id']}", json={"stages": [{"weight_kg": 45, "reps": 8}]}, headers=headers)
    assert response.status_code == 400


def test_changing_kind_away_from_drop_clears_stages(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    session = start(client, headers, workout["id"])
    entry = log(client, headers, session["exercises"][0]["id"], 60, 8, kind="rest_pause")
    client.patch(f"/fitness/sets/{entry['id']}", json={"stages": [{"weight_kg": 60, "reps": 3}]}, headers=headers)

    changed = client.patch(f"/fitness/sets/{entry['id']}", json={"kind": "normal"}, headers=headers).json()
    assert changed["kind"] == "normal"
    assert changed["stages"] == []
    assert client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["volume_kg"] == 480


def test_timed_exercises_ignore_kind(client, library, headers):
    workout = save_workout(client, headers, [{"exercise_id": library["prancha"], "target_sets": 2, "reps_min": 30}]).json()
    session = start(client, headers, workout["id"])
    response = client.post(
        f"/fitness/session-exercises/{session['exercises'][0]['id']}/sets",
        json={"duration_seconds": 40, "kind": "warmup"},
        headers=headers,
    )
    assert response.json()["kind"] == "normal"


def test_exercise_progress_lists_recent_technique_sets(client, library, headers):
    workout = save_workout(client, headers, [bench(library)]).json()
    session = start(client, headers, workout["id"])
    item_id = session["exercises"][0]["id"]
    log(client, headers, item_id, 60, 10)
    drop = log(client, headers, item_id, 60, 8, kind="drop")
    client.patch(f"/fitness/sets/{drop['id']}", json={"stages": [{"weight_kg": 45, "reps": 8}]}, headers=headers)
    log(client, headers, item_id, 60, 7, kind="failure")
    client.post(f"/fitness/sessions/{session['id']}/finish", json={}, headers=headers)

    progress = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()
    assert len(progress["techniques"]) == 1
    assert [(s["kind"], s["weight_kg"], s["reps"], s["stages"]) for s in progress["techniques"][0]["sets"]] == [
        ("drop", 60, 8, [{"weight_kg": 45, "reps": 8}]),
        ("failure", 60, 7, []),
    ]
