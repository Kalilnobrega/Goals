import pytest
from app.fitness_models import Exercise
from app.fitness_supersets import superset_numbers
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="remada-curvada", name="Remada curvada", muscle_group="back", equipment="barbell"),
        Exercise(slug="elevacao-lateral", name="Elevação lateral", muscle_group="shoulders", equipment="dumbbell"),
        Exercise(slug="rosca-direta", name="Rosca direta", muscle_group="biceps", equipment="barbell"),
        Exercise(slug="esteira", name="Esteira", muscle_group="cardio", equipment="machine", tracking="cardio"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return {e.slug: e.id for e in exercises}


@pytest.fixture()
def headers(db_session):
    return headers_for(make_user(db_session, "Ana"))


def item(exercise_id, superset=None, **extra):
    return {"exercise_id": exercise_id, "target_sets": 3, "reps_min": 10, "superset": superset, **extra}


def save_workout(client, headers, exercises, cardio=None):
    response = client.post(
        "/fitness/workouts", json={"name": "Treino A", "exercises": exercises, "cardio": cardio or []}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def order(client, headers, session_id, ids, supersets=None):
    payload = {"exercise_ids": ids}
    if supersets is not None:
        payload["supersets"] = supersets
    return client.put(f"/fitness/sessions/{session_id}/order", json=payload, headers=headers)


@pytest.mark.parametrize("values, expected", [
    ([], []),
    ([None, None], [None, None]),
    ([5, 5, None, 9, 9, 9], [1, 1, None, 2, 2, 2]),
    ([3, None, 3], [None, None, None]),
    ([2, 2, 7, 2, 2], [1, 1, None, 2, 2]),
    ([1], [None]),
])
def test_superset_numbers(values, expected):
    assert superset_numbers(values) == expected


def test_workout_saves_and_renumbers_supersets(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 4),
        item(library["remada-curvada"], 4, rest_seconds=90),
        item(library["elevacao-lateral"]),
        item(library["rosca-direta"], 8),
    ])

    assert [e["superset"] for e in workout["exercises"]] == [1, 1, None, None]

    fetched = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert [e["superset"] for e in fetched["exercises"]] == [1, 1, None, None]


def test_workout_supersets_need_consecutive_exercises(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 1),
        item(library["elevacao-lateral"]),
        item(library["remada-curvada"], 1),
    ])
    assert [e["superset"] for e in workout["exercises"]] == [None, None, None]


def test_workout_allows_tri_sets(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 2),
        item(library["remada-curvada"], 2),
        item(library["elevacao-lateral"], 2),
    ])
    assert [e["superset"] for e in workout["exercises"]] == [1, 1, 1]


def test_session_copies_supersets_and_keeps_cardio_out(client, library, headers):
    workout = save_workout(
        client, headers,
        [item(library["supino-reto"], 1), item(library["remada-curvada"], 1), item(library["elevacao-lateral"])],
        cardio=[{"exercise_id": library["esteira"], "phase": "start", "minutes": 10}],
    )
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()

    assert [(e["exercise_name"], e["superset"]) for e in session["exercises"]] == [
        ("Esteira", None), ("Supino reto", 1), ("Remada curvada", 1), ("Elevação lateral", None),
    ]


def test_session_order_can_join_and_split_supersets(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 1), item(library["remada-curvada"], 1), item(library["elevacao-lateral"]),
    ])
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()
    bench, row, raise_ = [e["id"] for e in session["exercises"]]

    joined = order(client, headers, session["id"], [bench, row, raise_], [1, 1, 1])
    assert joined.status_code == 200, joined.text
    assert [e["superset"] for e in joined.json()["exercises"]] == [1, 1, 1]

    split = order(client, headers, session["id"], [bench, row, raise_], [1, 1, None]).json()
    assert [e["superset"] for e in split["exercises"]] == [1, 1, None]

    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert [e["superset"] for e in stored["exercises"]] == [1, 1, None]


def test_session_order_without_supersets_breaks_separated_groups(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 1), item(library["remada-curvada"], 1), item(library["elevacao-lateral"]),
    ])
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()
    bench, row, raise_ = [e["id"] for e in session["exercises"]]

    kept = order(client, headers, session["id"], [raise_, bench, row]).json()
    assert [(e["exercise_name"], e["superset"]) for e in kept["exercises"]] == [
        ("Elevação lateral", None), ("Supino reto", 1), ("Remada curvada", 1),
    ]

    broken = order(client, headers, session["id"], [bench, raise_, row]).json()
    assert [e["superset"] for e in broken["exercises"]] == [None, None, None]


def test_session_order_rejects_mismatched_supersets(client, library, headers):
    workout = save_workout(client, headers, [item(library["supino-reto"]), item(library["remada-curvada"])])
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()
    ids = [e["id"] for e in session["exercises"]]
    assert order(client, headers, session["id"], ids, [1]).status_code == 422


def test_removing_an_exercise_dissolves_a_pair(client, library, headers):
    workout = save_workout(client, headers, [
        item(library["supino-reto"], 1), item(library["remada-curvada"], 1), item(library["elevacao-lateral"]),
    ])
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()

    updated = client.delete(f"/fitness/session-exercises/{session['exercises'][1]['id']}", headers=headers).json()
    assert [e["superset"] for e in updated["exercises"]] == [None, None]


def test_added_exercise_starts_outside_supersets(client, library, headers):
    workout = save_workout(client, headers, [item(library["supino-reto"], 1), item(library["remada-curvada"], 1)])
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()

    added = client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()
    assert [e["superset"] for e in added["exercises"]] == [1, 1, None]
