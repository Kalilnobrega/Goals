from datetime import date, timedelta
from app.dates import today_br
from app.fitness_forecast import forecast
from tests.test_fitness_sessions import library, ana, bruno, make_workout  # noqa: F401
from tests.test_fitness_stats import train, at


def weigh(client, headers, days_ago, weight):
    day = (today_br() - timedelta(days=days_ago)).isoformat()
    response = client.post("/fitness/body-weight", json={"weight_kg": weight, "measured_on": day}, headers=headers)
    assert response.status_code == 200, response.text


def test_forecast_statuses():
    today = date(2026, 11, 18)
    start = (today - timedelta(days=20), 90.0)
    losing = [(today - timedelta(days=10), 89.0), (today, 88.0)]
    assert forecast(None, [], 80, None, today)["status"] == "no_data"
    assert forecast(start, [(today - timedelta(days=19), 89.9)], 80, None, today)["status"] == "no_data"

    on_track = forecast(start, losing, 80, None, today)
    assert on_track["status"] == "on_track"
    assert on_track["rate_per_day"] == -0.1
    assert on_track["eta"] == today + timedelta(days=80)
    assert on_track["progress"] == 0.2

    behind = forecast(start, losing, 80, today + timedelta(days=9), today)
    assert behind["status"] == "behind"
    assert behind["needed_per_day"] == -0.8

    assert forecast(start, [(today, 91.0)], 80, None, today)["status"] == "no_trend"
    assert forecast(start, [(today, 79.5)], 80, None, today)["status"] == "reached"


def test_body_weight_goal_lifecycle(client, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    assert client.get("/fitness/body-weight-goal", headers=headers).json() is None

    weigh(client, headers, 0, 90)
    goal = client.put("/fitness/body-weight-goal", json={"target_kg": 80}, headers=headers).json()
    assert goal["start_kg"] == 90.0
    assert goal["target_kg"] == 80.0
    assert goal["deadline"] is None
    assert goal["status"] == "no_data"

    past = (today_br() - timedelta(days=1)).isoformat()
    assert client.put("/fitness/body-weight-goal", json={"target_kg": 80, "deadline": past}, headers=headers).status_code == 400
    assert client.put("/fitness/body-weight-goal", json={"target_kg": 10}, headers=headers).status_code == 400

    deadline = (today_br() + timedelta(days=60)).isoformat()
    updated = client.put("/fitness/body-weight-goal", json={"target_kg": 82, "deadline": deadline}, headers=headers).json()
    assert updated["target_kg"] == 82.0
    assert updated["deadline"] == deadline
    assert updated["start_kg"] == 90.0

    assert client.get("/fitness/overview", headers=headers).json()["body_weight"]["goal"]["target_kg"] == 82.0
    assert client.get("/fitness/body-weight-goal", headers=bruno_headers).json() is None

    assert client.delete("/fitness/body-weight-goal", headers=headers).status_code == 200
    assert client.get("/fitness/body-weight-goal", headers=headers).json() is None


def test_exercise_goal_uses_the_best_weight_of_each_session(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10), (62.5, 8)]], at(1))
    bench = library["supino-reto"]

    goal = client.put(f"/fitness/exercises/{bench}/goal", json={"target_kg": 80}, headers=headers).json()
    assert goal["start_kg"] == 62.5
    assert goal["status"] == "no_data"

    progress = client.get(f"/fitness/exercises/{bench}/progress", headers=headers).json()
    assert progress["goal"]["target_kg"] == 80.0
    listed = {item["exercise_id"]: item["goal_kg"] for item in client.get("/fitness/progress/exercises", headers=headers).json()}
    assert listed[bench] == 80.0

    assert client.put("/fitness/exercises/999999/goal", json={"target_kg": 80}, headers=headers).status_code == 404
    client.delete(f"/fitness/exercises/{bench}/goal", headers=headers)
    assert client.get(f"/fitness/exercises/{bench}/progress", headers=headers).json()["goal"] is None
