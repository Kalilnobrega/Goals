from tests.test_fitness_sessions import library, ana, make_workout, start, log_set, finish  # noqa: F401
from tests.test_fitness_progress import train, progress


def gyms(client, headers):
    return client.get("/fitness/gyms", headers=headers).json()


def add_gym(client, headers, name, make_current=False):
    response = client.post("/fitness/gyms", json={"name": name, "make_current": make_current}, headers=headers)
    assert response.status_code == 200, response.text
    return next(g for g in response.json()["gyms"] if g["name"] == name)


def test_first_gym_takes_old_sessions_and_becomes_current(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10)], [(100, 10)]])
    old = add_gym(client, headers, "Antiga")
    assert old["sessions"] == 1 and old["current"] is True
    new = add_gym(client, headers, "Nova")
    assert new["current"] is False and new["sessions"] == 0
    assert client.post("/fitness/gyms", json={"name": "nova"}, headers=headers).status_code == 409
    assert client.put("/fitness/gyms/current", json={"gym_id": new["id"]}, headers=headers).json()["current_gym_id"] == new["id"]
    session = start(client, headers, workout["id"])
    assert session["gym_id"] == new["id"] and session["gym_name"] == "Nova"
    changed = client.patch(f"/fitness/sessions/{session['id']}/gym", json={"gym_id": old["id"]}, headers=headers).json()
    assert changed["gym_name"] == "Antiga"
    assert client.delete(f"/fitness/gyms/{old['id']}", headers=headers).status_code == 409


def test_machine_history_and_records_are_per_gym(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10)], [(200, 10)]])
    add_gym(client, headers, "Antiga")
    new = add_gym(client, headers, "Nova", make_current=True)

    session = start(client, headers, workout["id"])
    bench, press = session["exercises"]
    assert bench["previous"] and press["previous"] == []
    assert log_set(client, headers, press["id"], 120, 10)["record"] is None
    assert log_set(client, headers, bench["id"], 65, 10)["record"]["previous_weight_kg"] == 60
    assert finish(client, headers, session["id"]).status_code == 200

    data = progress(client, headers, library["leg-press"])
    assert data["gym_specific"] is True and data["gym_id"] == new["id"]
    assert [p["max_weight_kg"] for p in data["points"]] == [120]
    old = client.get(
        f"/fitness/exercises/{library['leg-press']}/progress?gym_id={data['gyms'][0]['id']}", headers=headers
    ).json()
    assert [p["max_weight_kg"] for p in old["points"]] == [200]
    assert progress(client, headers, library["supino-reto"])["gym_specific"] is False
    listed = {i["name"]: i for i in client.get("/fitness/progress/exercises", headers=headers).json()}
    assert listed["Leg press"]["best_weight_kg"] == 120 and listed["Supino reto"]["best_weight_kg"] == 65


def test_marking_a_machine_as_the_same_everywhere(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10)], [(200, 10)]])
    add_gym(client, headers, "Antiga")
    add_gym(client, headers, "Nova", make_current=True)
    response = client.put(f"/fitness/exercises/{library['leg-press']}/gym-setting", json={"gym_specific": False}, headers=headers)
    assert response.json() == {"gym_specific": False}
    listed = {e["name"]: e for e in client.get("/fitness/exercises", headers=headers).json()}
    assert listed["Leg press"]["gym_specific"] is False and listed["Supino reto"]["gym_specific"] is False

    session = start(client, headers, workout["id"])
    assert session["exercises"][1]["previous"]
    assert log_set(client, headers, session["exercises"][1]["id"], 210, 10)["record"]["previous_weight_kg"] == 200

    client.put(f"/fitness/exercises/{library['supino-reto']}/gym-setting", json={"gym_specific": True}, headers=headers)
    assert {e["name"]: e for e in client.get("/fitness/exercises", headers=headers).json()}["Supino reto"]["gym_specific"] is True


def test_without_gyms_nothing_is_split(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10)], [(200, 10)]])
    session = start(client, headers, workout["id"])
    assert session["gym_id"] is None and session["exercises"][1]["previous"]
    assert progress(client, headers, library["leg-press"])["gym_specific"] is False


def test_session_insights_compare_machines_within_the_gym(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, workout["id"], [[(60, 10)], [(200, 10)]])
    add_gym(client, headers, "Antiga")
    add_gym(client, headers, "Nova", make_current=True)
    session = train(client, headers, workout["id"], [[(65, 10)], [(120, 10)]])
    insights = client.get(f"/fitness/sessions/{session['id']}/insights", headers=headers).json()
    by_item = {e["item_id"]: e for e in insights["exercises"]}
    assert by_item[session["exercises"][0]["id"]]["previous"]["weight_kg"] == 60
    assert by_item[session["exercises"][1]["id"]]["previous"] is None


def test_history_stats_and_export_filter_by_gym(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    old = add_gym(client, headers, "Antiga")
    train(client, headers, workout["id"], [[(60, 10)], [(100, 10)]])
    new = add_gym(client, headers, "Nova", make_current=True)
    train(client, headers, workout["id"], [[(70, 10)], [(120, 10)]])
    train(client, headers, workout["id"], [[(75, 10)], [(130, 10)]])

    history = lambda gym: client.get("/fitness/sessions", params={"gym_id": gym["id"]}, headers=headers).json()
    assert history(old)["total"] == 1 and history(new)["total"] == 2
    assert {item["gym_name"] for item in history(new)["items"]} == {"Nova"}

    stats = lambda gym: client.get("/fitness/stats", params={"period": "all", "gym_id": gym["id"]}, headers=headers).json()
    assert stats(old)["summary"]["sessions"] == 1 and stats(new)["summary"]["sessions"] == 2

    csv = client.get("/fitness/export", params={"format": "csv", "content": "workouts", "gym_id": old["id"]}, headers=headers)
    rows = csv.content.decode("utf-8-sig").strip().split("\r\n")[1:]
    assert rows and all(row.split(";")[3] == "Antiga" for row in rows)
    text = client.get("/fitness/export", params={"format": "txt", "gym_id": new["id"]}, headers=headers).content.decode("utf-8")
    assert "TREINOS (2)" in text and "· Nova" in text
    assert client.get("/fitness/export", params={"gym_id": 999999}, headers=headers).status_code == 404


def test_machine_records_name_their_gym(client, library, ana):
    _, headers = ana
    workout = make_workout(client, headers, library)
    add_gym(client, headers, "Centro")
    train(client, headers, workout["id"], [[(60, 10)], [(100, 10)]])
    train(client, headers, workout["id"], [[(70, 10)], [(120, 10)]])

    records = client.get("/fitness/stats", params={"period": "all"}, headers=headers).json()["records"]
    by_name = {r["name"]: r["gym_name"] for r in records}
    assert by_name == {"Leg press": "Centro", "Supino reto": None}
    recent = client.get("/fitness/overview", headers=headers).json()["recent_records"]
    assert {r["name"]: r["gym_name"] for r in recent} == by_name
