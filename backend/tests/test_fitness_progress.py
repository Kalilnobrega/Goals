from datetime import timedelta
import pytest
from app.dates import today_br
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401


def train(client, headers, workout_id, sets_by_item, finished=True):
    session = start(client, headers, workout_id)
    for index, sets in enumerate(sets_by_item):
        for weight, reps in sets:
            log_set(client, headers, session["exercises"][index]["id"], weight, reps)
    if finished:
        assert finish(client, headers, session["id"]).status_code == 200
    return session


def progress(client, headers, exercise_id):
    response = client.get(f"/fitness/exercises/{exercise_id}/progress", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_progress_requires_authentication(client, library):
    assert client.get("/fitness/progress/exercises").status_code == 401
    assert client.get(f"/fitness/exercises/{library['supino-reto']}/progress").status_code == 401
    assert client.get("/fitness/body-weight").status_code == 401
    assert client.post("/fitness/body-weight", json={"weight_kg": 80}).status_code == 401


def test_progress_exercises_lists_trained_exercises(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10), (70, 6)], [(100, 12)]])
    train(client, headers, workout["id"], [[(65, 8)]])
    train(client, headers, workout["id"], [[(200, 1)], [(300, 1)]], finished=False)

    items = client.get("/fitness/progress/exercises", headers=headers).json()
    by_name = {item["name"]: item for item in items}
    assert items[0]["name"] == "Supino reto"
    assert by_name["Supino reto"]["sessions"] == 2
    assert by_name["Supino reto"]["best_weight_kg"] == 70
    assert by_name["Supino reto"]["max_reps"] == 10
    assert by_name["Leg press"]["sessions"] == 1
    assert by_name["Leg press"]["muscle_group"] == "quads"


def test_progress_exercises_is_empty_without_completed_sessions(client, library, ana):
    _, headers = ana
    train(client, headers, make_workout(client, headers, library)["id"], [[(60, 10)]], finished=False)
    assert client.get("/fitness/progress/exercises", headers=headers).json() == []


def test_exercise_progress_points(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    first = train(client, headers, workout["id"], [[(60, 10), (70, 5), (70, 6)]])
    second = train(client, headers, workout["id"], [[(80, 1), (50, 15)]])

    data = progress(client, headers, library["supino-reto"])
    assert data["name"] == "Supino reto"
    assert [p["session_id"] for p in data["points"]] == [first["id"], second["id"]]

    one, two = data["points"]
    assert one["sets"] == 3
    assert one["max_weight_kg"] == 70
    assert one["reps_at_max"] == 6
    assert one["max_reps"] == 10
    assert one["volume_kg"] == 60 * 10 + 70 * 5 + 70 * 6
    assert one["estimated_1rm_kg"] == 84.0
    assert one["session_name"] == "Treino A"

    assert two["estimated_1rm_kg"] == 80.0
    assert two["max_reps"] == 15


def test_estimated_1rm_ignores_bodyweight_and_high_reps(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(0, 12), (40, 20)]])
    point = progress(client, headers, library["supino-reto"])["points"][0]
    assert point["estimated_1rm_kg"] is None
    assert point["max_weight_kg"] == 40


def test_exercise_repeated_in_a_session_is_one_point(client, library, ana):
    _, headers = ana
    session = start(client, headers)
    for _ in range(2):
        session = client.post(
            f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
        ).json()
    log_set(client, headers, session["exercises"][0]["id"], 20, 10)
    log_set(client, headers, session["exercises"][1]["id"], 25, 8)
    finish(client, headers, session["id"])

    points = progress(client, headers, library["rosca-direta"])["points"]
    assert len(points) == 1
    assert points[0]["sets"] == 2
    assert points[0]["max_weight_kg"] == 25


def test_exercise_progress_is_private(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    train(client, ana_headers, make_workout(client, ana_headers, library)["id"], [[(60, 10)]])
    assert progress(client, bruno_headers, library["supino-reto"])["points"] == []
    assert client.get("/fitness/progress/exercises", headers=bruno_headers).json() == []

    secret = client.post(
        "/fitness/exercises", json={"name": "Secreto", "muscle_group": "back", "equipment": "machine"}, headers=bruno_headers
    ).json()
    assert client.get(f"/fitness/exercises/{secret['id']}/progress", headers=ana_headers).status_code == 404


def test_body_weight_defaults_to_today_and_replaces_same_day(client, ana):
    _, headers = ana
    first = client.post("/fitness/body-weight", json={"weight_kg": 80.456, "note": "  em jejum "}, headers=headers).json()
    assert first["measured_on"] == today_br().isoformat()
    assert first["weight_kg"] == 80.46
    assert first["note"] == "em jejum"

    second = client.post("/fitness/body-weight", json={"weight_kg": 79.9}, headers=headers).json()
    assert second["id"] == first["id"]
    assert second["weight_kg"] == 79.9
    assert second["note"] is None
    assert len(client.get("/fitness/body-weight", headers=headers).json()) == 1


def test_body_weight_lists_newest_first(client, ana):
    _, headers = ana
    today = today_br()
    for days, weight in [(10, 82), (0, 80), (5, 81)]:
        client.post(
            "/fitness/body-weight",
            json={"weight_kg": weight, "measured_on": (today - timedelta(days=days)).isoformat()},
            headers=headers,
        )
    entries = client.get("/fitness/body-weight", headers=headers).json()
    assert [e["weight_kg"] for e in entries] == [80, 81, 82]


@pytest.mark.parametrize("payload", [
    {"weight_kg": 19},
    {"weight_kg": 401},
    {"weight_kg": 80, "note": "x" * 141},
])
def test_body_weight_rejects_invalid_values(client, ana, payload):
    _, headers = ana
    assert client.post("/fitness/body-weight", json=payload, headers=headers).status_code == 422


def test_body_weight_rejects_future_dates(client, ana):
    _, headers = ana
    tomorrow = (today_br() + timedelta(days=1)).isoformat()
    assert client.post("/fitness/body-weight", json={"weight_kg": 80, "measured_on": tomorrow}, headers=headers).status_code == 400
    entry = client.post("/fitness/body-weight", json={"weight_kg": 80}, headers=headers).json()
    assert client.patch(f"/fitness/body-weight/{entry['id']}", json={"measured_on": tomorrow}, headers=headers).status_code == 400


def test_body_weight_edit_and_delete(client, ana):
    _, headers = ana
    today = today_br()
    yesterday = (today - timedelta(days=1)).isoformat()
    entry = client.post("/fitness/body-weight", json={"weight_kg": 80, "note": "manhã"}, headers=headers).json()
    other = client.post("/fitness/body-weight", json={"weight_kg": 81, "measured_on": yesterday}, headers=headers).json()

    edited = client.patch(f"/fitness/body-weight/{entry['id']}", json={"weight_kg": 79.5, "note": None}, headers=headers)
    assert edited.status_code == 200
    assert edited.json()["weight_kg"] == 79.5
    assert edited.json()["note"] is None

    conflict = client.patch(f"/fitness/body-weight/{entry['id']}", json={"measured_on": yesterday}, headers=headers)
    assert conflict.status_code == 409

    moved = client.patch(
        f"/fitness/body-weight/{other['id']}", json={"measured_on": (today - timedelta(days=3)).isoformat()}, headers=headers
    )
    assert moved.status_code == 200

    assert client.delete(f"/fitness/body-weight/{entry['id']}", headers=headers).status_code == 200
    assert [e["id"] for e in client.get("/fitness/body-weight", headers=headers).json()] == [other["id"]]


def test_body_weight_is_private(client, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    entry = client.post("/fitness/body-weight", json={"weight_kg": 80}, headers=ana_headers).json()
    assert client.get("/fitness/body-weight", headers=bruno_headers).json() == []
    assert client.patch(f"/fitness/body-weight/{entry['id']}", json={"weight_kg": 50}, headers=bruno_headers).status_code == 404
    assert client.delete(f"/fitness/body-weight/{entry['id']}", headers=bruno_headers).status_code == 404
