from datetime import datetime, time, timedelta, timezone
import pytest
from app.dates import BRT, today_br
from app.fitness_models import WorkoutSession
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401


def stats(client, headers, period=None):
    params = {"period": period} if period else {}
    response = client.get("/fitness/stats", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def at(days_ago, hour=10):
    return datetime.combine(today_br() - timedelta(days=days_ago), time(hour), tzinfo=BRT)


def train(client, headers, db_session, workout_id, sets_by_item, when, minutes=60):
    session = start(client, headers, workout_id)
    for index, sets in enumerate(sets_by_item):
        for weight, reps in sets:
            log_set(client, headers, session["exercises"][index]["id"], weight, reps)
    assert finish(client, headers, session["id"]).status_code == 200
    stored = db_session.get(WorkoutSession, session["id"])
    stored.started_at = when.astimezone(timezone.utc)
    stored.completed_at = (when + timedelta(minutes=minutes)).astimezone(timezone.utc)
    db_session.commit()
    return session


def test_stats_requires_authentication(client):
    assert client.get("/fitness/stats").status_code == 401


def test_stats_rejects_unknown_period(client, ana):
    _, headers = ana
    assert client.get("/fitness/stats", params={"period": "2w"}, headers=headers).status_code == 422


def test_stats_for_a_new_user(client, ana):
    _, headers = ana
    data = stats(client, headers, "4w")
    assert data["summary"]["sessions"] == 0
    assert data["previous"]["sessions"] == 0
    assert data["bucket"] == "week"
    assert all(bucket["sessions"] == 0 for bucket in data["timeline"])
    assert data["muscles"] == []
    assert data["progressions"] == []
    assert data["records"] == []
    assert data["all_time"]["records"] is None
    assert data["consistency"]["current_week_streak"] == 0


def test_stats_summary_compares_with_previous_period(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10), (60, 8)], [(100, 12)]], at(2), minutes=50)
    train(client, headers, db_session, workout["id"], [[(62.5, 10)]], at(10), minutes=70)
    train(client, headers, db_session, workout["id"], [[(55, 10)]], at(40), minutes=40)

    data = stats(client, headers, "4w")
    summary = data["summary"]
    assert summary["sessions"] == 2
    assert summary["sets"] == 4
    assert summary["reps"] == 40
    assert summary["volume_kg"] == 60 * 10 + 60 * 8 + 100 * 12 + 62.5 * 10
    assert summary["minutes"] == 120
    assert summary["avg_minutes"] == 60
    assert summary["active_days"] == 2
    assert summary["per_week"] == 0.5
    assert data["previous"]["sessions"] == 1
    assert data["previous"]["volume_kg"] == 550
    assert sum(bucket["sessions"] for bucket in data["timeline"]) == 2
    assert data["all_time"]["sessions"] == 3


def test_stats_muscle_groups(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10), (60, 10), (60, 10)], [(100, 10)]], at(1))
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(35))

    muscles = {m["muscle_group"]: m for m in stats(client, headers, "4w")["muscles"]}
    assert muscles["chest"]["sets"] == 3
    assert muscles["chest"]["share"] == 0.75
    assert muscles["chest"]["previous_sets"] == 1
    assert muscles["chest"]["days_since"] == 1
    assert sum(muscles["chest"]["series"]) == 3
    assert muscles["legs"]["volume_kg"] == 1000
    assert muscles["legs"]["sessions"] == 1


def test_stats_lists_neglected_groups_trained_before_the_period(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[], [(100, 10)]], at(50))
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(3))

    muscles = {m["muscle_group"]: m for m in stats(client, headers, "4w")["muscles"]}
    assert muscles["legs"]["sets"] == 0
    assert muscles["legs"]["days_since"] == 50


def test_stats_progressions_declines_and_records(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10)], [(120, 10)]], at(20))
    train(client, headers, db_session, workout["id"], [[(70, 10)], [(110, 10)]], at(10))
    train(client, headers, db_session, workout["id"], [[(75, 8)], [(100, 10)]], at(2))

    data = stats(client, headers, "4w")
    bench = data["progressions"][0]
    assert bench["name"] == "Supino reto"
    assert bench["metric"] == "e1rm"
    assert bench["first_kg"] == 80.0
    assert bench["last_kg"] == 95.0
    assert bench["change_pct"] == 18.8
    assert bench["sessions"] == 3

    legs = data["declines"][0]
    assert legs["name"] == "Leg press"
    assert legs["change_kg"] < 0

    records = data["records"]
    assert [(r["name"], r["weight_kg"], r["previous_kg"]) for r in records] == [
        ("Supino reto", 75.0, 70.0),
        ("Supino reto", 70.0, 60.0),
    ]

    most_done = data["most_done"]
    assert {item["name"] for item in most_done} == {"Supino reto", "Leg press"}


def test_stats_workouts_and_all_time_records(client, library, ana, db_session):
    _, headers = ana
    first = make_workout(client, headers, library, name="Treino A")
    second = make_workout(client, headers, library, name="Treino B")
    train(client, headers, db_session, first["id"], [[(60, 10)]], at(9), minutes=40)
    train(client, headers, db_session, first["id"], [[(60, 10), (60, 10)]], at(2), minutes=80)
    train(client, headers, db_session, second["id"], [[(100, 5)], [(150, 10)]], at(5), minutes=55)

    data = stats(client, headers, "4w")
    workouts = {w["name"]: w for w in data["workouts"]}
    assert workouts["Treino A"]["sessions"] == 2
    assert workouts["Treino A"]["avg_minutes"] == 60
    assert workouts["Treino A"]["volume_change_pct"] == 100.0
    assert workouts["Treino B"]["volume_change_pct"] is None

    records = data["all_time"]["records"]
    assert records["biggest_volume"]["name"] == "Treino B"
    assert records["biggest_volume"]["value"] == 2000
    assert records["longest"]["value"] == 80
    assert records["most_sets"]["value"] == 2
    assert records["heaviest_set"]["name"] == "Leg press"
    assert records["heaviest_set"]["weight_kg"] == 150


def test_stats_consistency(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    today = today_br()
    monday = today - timedelta(days=today.weekday())
    for days_back, hour in [(0, 7), (7, 19), (21, 13), (28, 13), (35, 2)]:
        day = monday - timedelta(days=days_back)
        when = datetime.combine(day, time(hour), tzinfo=BRT)
        train(client, headers, db_session, workout["id"], [[(60, 10)]], when)

    data = stats(client, headers, "1y")
    consistency = data["consistency"]
    assert consistency["current_week_streak"] == 2
    assert consistency["best_week_streak"] == 3
    assert consistency["weekdays"][0] == 5
    parts = {p["part"]: p["sessions"] for p in consistency["day_parts"]}
    assert parts == {"dawn": 1, "morning": 1, "afternoon": 2, "night": 1}


def test_stats_all_period_uses_months_for_long_histories(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(500))
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(1))

    data = stats(client, headers, "all")
    assert data["bucket"] == "month"
    assert data["previous"] is None
    assert data["summary"]["sessions"] == 2
    assert sum(bucket["sessions"] for bucket in data["timeline"]) == 2


@pytest.mark.parametrize("period", ["4w", "3m", "6m", "1y", "all"])
def test_stats_is_private(client, library, ana, bruno, db_session, period):
    _, ana_headers = ana
    _, bruno_headers = bruno
    train(client, ana_headers, db_session, make_workout(client, ana_headers, library)["id"], [[(60, 10)]], at(1))
    data = stats(client, bruno_headers, period)
    assert data["summary"]["sessions"] == 0
    assert data["all_time"]["sessions"] == 0
