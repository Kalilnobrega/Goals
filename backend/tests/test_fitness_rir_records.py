from tests.test_fitness_sessions import library, ana, make_workout, start, finish


def add(client, headers, item_id, weight, reps, **extra):
    response = client.post(
        f"/fitness/session-exercises/{item_id}/sets", json={"weight_kg": weight, "reps": reps, **extra}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_rir_is_optional_and_editable(client, library, ana):
    _, headers = ana
    session = start(client, headers, make_workout(client, headers, library)["id"])
    bench = session["exercises"][0]["id"]
    plain = add(client, headers, bench, 60, 10)
    rated = add(client, headers, bench, 60, 9, rir=2)

    assert plain["rir"] is None
    assert rated["rir"] == 2
    assert client.patch(f"/fitness/sets/{plain['id']}", json={"rir": 1}, headers=headers).json()["rir"] == 1
    assert client.patch(f"/fitness/sets/{plain['id']}", json={"rir": None}, headers=headers).json()["rir"] is None
    assert client.patch(f"/fitness/sets/{rated['id']}", json={"reps": 8}, headers=headers).json()["rir"] == 2
    assert client.post(
        f"/fitness/session-exercises/{bench}/sets", json={"weight_kg": 60, "reps": 8, "rir": 7}, headers=headers
    ).status_code == 422


def test_previous_sets_carry_rir(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    add(client, headers, session["exercises"][0]["id"], 60, 8, rir=1)
    finish(client, headers, session["id"])

    following = start(client, headers, workout["id"])
    assert following["exercises"][0]["previous"][0]["rir"] == 1


def test_record_alert_for_heavier_weight_and_more_reps(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    bench = session["exercises"][0]["id"]
    assert add(client, headers, bench, 60, 8)["record"] is None
    add(client, headers, bench, 62.5, 6)
    finish(client, headers, session["id"])

    session = start(client, headers, workout["id"])
    bench = session["exercises"][0]["id"]
    assert add(client, headers, bench, 60, 8)["record"] is None
    reps = add(client, headers, bench, 60, 9)["record"]
    assert reps == {"type": "reps", "weight_kg": 60.0, "reps": 9, "previous_weight_kg": 60.0, "previous_reps": 8}
    weight = add(client, headers, bench, 65, 4)["record"]
    assert weight == {"type": "weight", "weight_kg": 65.0, "reps": 4, "previous_weight_kg": 62.5, "previous_reps": 6}
    assert add(client, headers, bench, 65, 4)["record"] is None
    assert add(client, headers, bench, 61, 7)["record"] is None


def test_no_record_alert_the_first_time(client, library, ana):
    _, headers = ana
    session = start(client, headers)
    item = client.post(
        f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["rosca-direta"]}, headers=headers
    ).json()["exercises"][0]["id"]
    assert add(client, headers, item, 30, 10)["record"] is None
