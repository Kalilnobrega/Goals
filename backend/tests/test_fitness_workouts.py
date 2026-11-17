import pytest
from app.fitness_models import Exercise
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


def item(exercise_id, sets=3, reps_min=10, reps_max=None):
    return {"exercise_id": exercise_id, "target_sets": sets, "reps_min": reps_min, "reps_max": reps_max}


def create_workout(client, headers, name="Treino A", exercises=None, description=None):
    response = client.post(
        "/fitness/workouts",
        json={"name": name, "description": description, "exercises": exercises or []},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_requires_authentication(client):
    assert client.get("/fitness/workouts").status_code == 401
    assert client.post("/fitness/workouts", json={}).status_code == 401
    assert client.put("/fitness/workouts/1", json={}).status_code == 401
    assert client.delete("/fitness/workouts/1").status_code == 401


def test_creates_workout_with_ordered_exercises(client, library, ana):
    _, headers = ana
    workout = create_workout(
        client,
        headers,
        "  Treino   A ",
        [item(library["leg-press"], 4, 8, 12), item(library["supino-reto"], 3, 10)],
        description="  Pernas e peito  ",
    )

    assert workout["name"] == "Treino A"
    assert workout["description"] == "Pernas e peito"
    assert [e["exercise"]["name"] for e in workout["exercises"]] == ["Leg press", "Supino reto"]
    assert [(e["target_sets"], e["reps_min"], e["reps_max"]) for e in workout["exercises"]] == [
        (4, 8, 12),
        (3, 10, None),
    ]
    assert client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json() == workout


def test_blank_description_becomes_null(client, ana):
    _, headers = ana
    assert create_workout(client, headers, description="   ")["description"] is None


def test_equal_reps_range_collapses_to_single_value(client, library, ana):
    _, headers = ana
    workout = create_workout(client, headers, exercises=[item(library["leg-press"], 3, 10, 10)])
    assert workout["exercises"][0]["reps_max"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "exercises": []},
        {"name": "A", "exercises": [{"exercise_id": 1, "target_sets": 0, "reps_min": 10}]},
        {"name": "A", "exercises": [{"exercise_id": 1, "target_sets": 3, "reps_min": 0}]},
        {"name": "A", "exercises": [{"exercise_id": 1, "target_sets": 3, "reps_min": 12, "reps_max": 8}]},
        {"name": "x" * 61, "exercises": []},
    ],
)
def test_rejects_invalid_workouts(client, library, ana, payload):
    _, headers = ana
    assert client.post("/fitness/workouts", json=payload, headers=headers).status_code == 422


def test_rejects_unknown_or_foreign_exercises(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    secret = client.post(
        "/fitness/exercises",
        json={"name": "Remada secreta", "muscle_group": "back", "equipment": "machine"},
        headers=bruno_headers,
    ).json()

    for exercise_id in (9999, secret["id"]):
        response = client.post(
            "/fitness/workouts", json={"name": "A", "exercises": [item(exercise_id)]}, headers=ana_headers
        )
        assert response.status_code == 400


def test_can_use_own_custom_exercises(client, library, ana):
    _, headers = ana
    custom = client.post(
        "/fitness/exercises",
        json={"name": "Remada articulada", "muscle_group": "back", "equipment": "machine"},
        headers=headers,
    ).json()
    workout = create_workout(client, headers, exercises=[item(custom["id"])])
    assert workout["exercises"][0]["exercise"]["is_custom"] is True


def test_put_replaces_everything_and_reorders(client, library, ana):
    _, headers = ana
    workout = create_workout(
        client, headers, exercises=[item(library["supino-reto"]), item(library["leg-press"])]
    )

    response = client.put(
        f"/fitness/workouts/{workout['id']}",
        json={
            "name": "Treino B",
            "exercises": [item(library["rosca-direta"], 2, 12, 15), item(library["supino-reto"], 5, 5)],
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["name"] == "Treino B"
    assert updated["description"] is None
    assert [e["exercise"]["name"] for e in updated["exercises"]] == ["Rosca direta", "Supino reto"]
    assert updated["exercises"][1]["target_sets"] == 5


def test_lists_only_own_workouts(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    create_workout(client, ana_headers, "Treino A")
    create_workout(client, ana_headers, "Treino B")
    create_workout(client, bruno_headers, "Do Bruno")

    names = [w["name"] for w in client.get("/fitness/workouts", headers=ana_headers).json()]
    assert sorted(names) == ["Treino A", "Treino B"]


def test_other_users_cannot_touch_workout(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    workout = create_workout(client, ana_headers, exercises=[item(library["leg-press"])])
    url = f"/fitness/workouts/{workout['id']}"

    assert client.get(url, headers=bruno_headers).status_code == 404
    assert client.put(url, json={"name": "Hack", "exercises": []}, headers=bruno_headers).status_code == 404
    assert client.delete(url, headers=bruno_headers).status_code == 404
    assert client.get(url, headers=ana_headers).json()["name"] == "Treino A"


def test_deletes_workout(client, library, ana):
    _, headers = ana
    workout = create_workout(client, headers, exercises=[item(library["leg-press"])])

    assert client.delete(f"/fitness/workouts/{workout['id']}", headers=headers).status_code == 200
    assert client.get(f"/fitness/workouts/{workout['id']}", headers=headers).status_code == 404
    assert client.get("/fitness/workouts", headers=headers).json() == []


def test_cannot_delete_custom_exercise_used_in_workout(client, library, ana):
    _, headers = ana
    custom = client.post(
        "/fitness/exercises",
        json={"name": "Remada articulada", "muscle_group": "back", "equipment": "machine"},
        headers=headers,
    ).json()
    workout = create_workout(client, headers, "Costas", [item(custom["id"])])

    response = client.delete(f"/fitness/exercises/{custom['id']}", headers=headers)
    assert response.status_code == 409
    assert "Costas" in response.json()["detail"]

    client.put(f"/fitness/workouts/{workout['id']}", json={"name": "Costas", "exercises": []}, headers=headers)
    assert client.delete(f"/fitness/exercises/{custom['id']}", headers=headers).status_code == 200
