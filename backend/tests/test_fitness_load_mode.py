from tests.test_fitness_sessions import library, ana, start, finish


def side_workout(client, headers, library):
    response = client.post(
        "/fitness/workouts",
        json={
            "name": "Peito",
            "exercises": [
                {"exercise_id": library["supino-reto"], "target_sets": 3, "reps_min": 8, "load_mode": "side"},
                {"exercise_id": library["leg-press"], "target_sets": 3, "reps_min": 10},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_workout_keeps_the_load_mode(client, library, ana):
    _, headers = ana
    workout = side_workout(client, headers, library)
    assert [item["load_mode"] for item in workout["exercises"]] == ["side", None]

    session = start(client, headers, workout["id"])
    assert [item["load_mode"] for item in session["exercises"]] == ["side", None]


def test_rejects_unknown_load_mode(client, library, ana):
    _, headers = ana
    response = client.post(
        "/fitness/workouts",
        json={"name": "X", "exercises": [{"exercise_id": library["supino-reto"], "target_sets": 3, "reps_min": 8, "load_mode": "half"}]},
        headers=headers,
    )
    assert response.status_code == 422


def test_changing_load_mode_in_a_workout_keeps_the_ficha(client, library, ana):
    _, headers = ana
    workout = side_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    bench = session["exercises"][0]["id"]

    changed = client.patch(f"/fitness/session-exercises/{bench}", json={"load_mode": "total"}, headers=headers).json()

    assert changed["exercises"][0]["load_mode"] == "total"
    stored = client.get(f"/fitness/workouts/{workout['id']}", headers=headers).json()
    assert stored["exercises"][0]["load_mode"] == "side"


def test_load_mode_can_change_after_finishing(client, library, ana):
    _, headers = ana
    session = start(client, headers, side_workout(client, headers, library)["id"])
    bench = session["exercises"][0]["id"]
    client.post(f"/fitness/session-exercises/{bench}/sets", json={"weight_kg": 40, "reps": 8}, headers=headers)
    finish(client, headers, session["id"])

    response = client.patch(f"/fitness/session-exercises/{bench}", json={"load_mode": "total"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["exercises"][0]["load_mode"] == "total"


def test_added_exercise_remembers_the_last_load_mode(client, library, ana):
    _, headers = ana
    session = start(client, headers, side_workout(client, headers, library)["id"])
    client.post(f"/fitness/session-exercises/{session['exercises'][0]['id']}/sets", json={"weight_kg": 40, "reps": 8}, headers=headers)
    finish(client, headers, session["id"])

    free = start(client, headers)
    data = client.post(f"/fitness/sessions/{free['id']}/exercises", json={"exercise_id": library["supino-reto"]}, headers=headers).json()
    assert data["exercises"][0]["load_mode"] == "side"
