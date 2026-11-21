import pytest
from app.fitness_models import Exercise
from tests.test_fitness_sessions import start, finish, log_set
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="leg-press", name="Leg press", muscle_group="quads", equipment="machine"),
        Exercise(slug="esteira", name="Esteira", muscle_group="cardio", equipment="cardio", tracking="cardio"),
        Exercise(slug="bike", name="Bicicleta", muscle_group="cardio", equipment="cardio", tracking="cardio"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return {e.slug: e.id for e in exercises}


@pytest.fixture()
def ana(db_session):
    user = make_user(db_session, "Ana")
    return user, headers_for(user)


def save_workout(client, headers, library, cardio):
    return client.post(
        "/fitness/workouts",
        json={
            "name": "Treino A",
            "exercises": [
                {"exercise_id": library["supino-reto"], "target_sets": 3, "reps_min": 10},
                {"exercise_id": library["leg-press"], "target_sets": 2, "reps_min": 12},
            ],
            "cardio": cardio,
        },
        headers=headers,
    )


def log_cardio(client, headers, item_id, seconds):
    response = client.post(f"/fitness/session-exercises/{item_id}/sets", json={"duration_seconds": seconds}, headers=headers)
    assert response.status_code == 200, response.text


def test_workout_keeps_cardio_apart_from_exercises(client, library, ana):
    _, headers = ana
    response = save_workout(client, headers, library, [
        {"exercise_id": None, "phase": "end", "minutes": 20},
        {"exercise_id": library["esteira"], "phase": "start", "minutes": 10},
    ])

    assert response.status_code == 200, response.text
    workout = response.json()
    assert len(workout["exercises"]) == 2
    assert [(c["phase"], c["exercise"] and c["exercise"]["name"], c["minutes"]) for c in workout["cardio"]] == [
        ("start", "Esteira", 10),
        ("end", None, 20),
    ]


def test_cardio_and_exercises_stay_in_their_places(client, library, ana):
    _, headers = ana
    misplaced = client.post(
        "/fitness/workouts",
        json={"name": "Treino", "exercises": [{"exercise_id": library["esteira"], "target_sets": 1, "reps_min": 20}]},
        headers=headers,
    )
    wrong_block = save_workout(client, headers, library, [{"exercise_id": library["leg-press"], "phase": "end", "minutes": 20}])

    assert misplaced.status_code == 400
    assert wrong_block.status_code == 400


def test_session_puts_cardio_at_start_and_end(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [
        {"exercise_id": library["esteira"], "phase": "start", "minutes": 10},
        {"exercise_id": None, "phase": "end", "minutes": 20},
    ]).json()

    session = start(client, headers, workout["id"])

    items = session["exercises"]
    assert [(item["exercise_name"], item["phase"]) for item in items] == [
        ("Esteira", "start"), ("Supino reto", None), ("Leg press", None), ("Cardio", "end"),
    ]
    assert items[3]["exercise_id"] is None
    assert (items[3]["tracking"], items[3]["reps_min"]) == ("cardio", 20)


def test_any_cardio_suggests_the_last_one_used(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [{"exercise_id": None, "phase": "end", "minutes": 20}]).json()
    first = start(client, headers, workout["id"])
    cardio = first["exercises"][-1]

    swapped = client.patch(f"/fitness/session-exercises/{cardio['id']}", json={"exercise_id": library["bike"]}, headers=headers)
    assert swapped.status_code == 200, swapped.text
    log_cardio(client, headers, cardio["id"], 1200)
    assert finish(client, headers, first["id"]).status_code == 200

    second = start(client, headers, workout["id"])

    assert second["exercises"][-1]["exercise_name"] == "Bicicleta"


def test_cardio_only_swaps_with_cardio(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [{"exercise_id": None, "phase": "end", "minutes": 20}]).json()
    session = start(client, headers, workout["id"])
    cardio, exercise = session["exercises"][-1], session["exercises"][0]

    to_exercise = client.patch(f"/fitness/session-exercises/{cardio['id']}", json={"exercise_id": library["leg-press"]}, headers=headers)
    to_cardio = client.patch(f"/fitness/session-exercises/{exercise['id']}", json={"exercise_id": library["bike"]}, headers=headers)

    assert to_exercise.status_code == 409
    assert to_cardio.status_code == 409


def test_added_exercise_goes_before_final_cardio(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [{"exercise_id": library["bike"], "phase": "end", "minutes": 20}]).json()
    session = start(client, headers, workout["id"])

    with_exercise = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["supino-reto"]}, headers=headers).json()
    with_cardio = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["esteira"]}, headers=headers).json()

    assert [item["exercise_name"] for item in with_exercise["exercises"]] == ["Supino reto", "Leg press", "Supino reto", "Bicicleta"]
    assert (with_cardio["exercises"][-1]["exercise_name"], with_cardio["exercises"][-1]["phase"]) == ("Esteira", "end")


def test_cardio_does_not_count_as_exercise_or_set(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [{"exercise_id": library["bike"], "phase": "end", "minutes": 20}]).json()
    session = start(client, headers, workout["id"])
    items = session["exercises"]
    log_set(client, headers, items[0]["id"], 60, 10)
    log_set(client, headers, items[1]["id"], 100, 12)
    log_cardio(client, headers, items[2]["id"], 1500)

    finished = finish(client, headers, session["id"]).json()
    history = client.get("/fitness/sessions", headers=headers).json()["items"][0]
    stats = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()

    assert finished["total_sets"] == 2
    assert (history["exercise_count"], history["total_sets"], history["cardio_seconds"]) == (2, 2, 1500)
    assert "cardio" not in history["muscle_groups"]
    assert stats["cardio"]["minutes"] == 25
    assert stats["summary"]["sets"] == 2
    assert stats["time"]["exercises_per_session"] == 2


def test_cardio_stats_track_plan_skips_and_phases(client, library, ana):
    _, headers = ana
    workout = save_workout(client, headers, library, [
        {"exercise_id": library["esteira"], "phase": "start", "minutes": 10},
        {"exercise_id": library["bike"], "phase": "end", "minutes": 20},
    ]).json()

    first = start(client, headers, workout["id"])
    items = first["exercises"]
    log_cardio(client, headers, items[0]["id"], 600)
    log_set(client, headers, items[1]["id"], 60, 10)
    log_cardio(client, headers, items[3]["id"], 1500)
    assert finish(client, headers, first["id"]).status_code == 200

    second = start(client, headers, workout["id"])
    items = second["exercises"]
    log_set(client, headers, items[1]["id"], 60, 10)
    log_cardio(client, headers, items[3]["id"], 600)
    assert finish(client, headers, second["id"]).status_code == 200

    cardio = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["cardio"]
    plan = cardio["plan"]
    phases = {phase["phase"]: phase for phase in cardio["phases"]}
    progress = client.get(f"/fitness/workouts/{workout['id']}/progress", headers=headers).json()["cardio"]

    assert (plan["planned"], plan["done"], plan["skipped"], plan["short"], plan["over"]) == (4, 3, 1, 1, 1)
    assert (plan["planned_minutes"], plan["done_minutes"]) == (60, 45)
    assert plan["completion_pct"] == 66.7
    assert (phases["start"]["skipped"], phases["end"]["skipped"]) == (1, 0)
    assert cardio["longest"]["minutes"] == 35
    assert sum(bucket["minutes"] for bucket in cardio["timeline"]) == 45
    assert (progress["planned_minutes"], progress["sessions"], progress["skipped"], progress["avg_done_minutes"]) == (30, 2, 1, 22)


def test_cardio_stats_estimate_distance_speed_and_calories(client, library, ana):
    from app.dates import today_br
    _, headers = ana
    client.post("/fitness/body-weight", json={"weight_kg": 80, "date": today_br().isoformat()}, headers=headers)
    session = start(client, headers)
    for exercise in ("esteira", "bike"):
        client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library[exercise]}, headers=headers)
    items = {item["exercise_name"]: item for item in client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"]}
    client.post(f"/fitness/session-exercises/{items['Esteira']['id']}/sets", json={"duration_seconds": 1800, "speed_kmh": 10}, headers=headers)
    logged = client.post(f"/fitness/session-exercises/{items['Bicicleta']['id']}/sets", json={"duration_seconds": 1200, "calories": 250}, headers=headers)
    assert logged.json()["calories"] == 250
    assert finish(client, headers, session["id"]).status_code == 200

    cardio = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["cardio"]
    devices = {device["name"]: device for device in cardio["exercises"]}

    assert (cardio["distance_km"], cardio["km_estimated"], cardio["avg_speed_kmh"], cardio["pace_seconds_per_km"]) == (5.0, True, 10.0, 360)
    assert (cardio["calories"], cardio["calories_estimated"]) == (651, True)
    assert cardio["fastest"]["kmh"] == 10.0
    assert cardio["farthest"]["km"] == 5.0
    assert (devices["Esteira"]["calories"], devices["Bicicleta"]["calories"]) == (401, 250)
