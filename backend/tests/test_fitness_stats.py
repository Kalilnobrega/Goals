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
    assert data["previous"] is None
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
    assert muscles["quads"]["volume_kg"] == 1000
    assert muscles["quads"]["sessions"] == 1


def test_stats_lists_neglected_groups_trained_before_the_period(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[], [(100, 10)]], at(50))
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(3))

    muscles = {m["muscle_group"]: m for m in stats(client, headers, "4w")["muscles"]}
    assert muscles["quads"]["sets"] == 0
    assert muscles["quads"]["days_since"] == 50


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


def test_stats_rep_progressions_and_averages(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 8)], [(0, 10)]], at(20))
    train(client, headers, db_session, workout["id"], [[(66, 10)], [(0, 15)]], at(5))

    data = stats(client, headers, "4w")
    reps = {p["name"]: p for p in data["rep_progressions"]}
    assert reps["Supino reto"]["first_reps"] == 8
    assert reps["Supino reto"]["last_reps"] == 10
    assert reps["Supino reto"]["change_pct"] == 25.0
    assert reps["Leg press"]["change_reps"] == 5
    assert reps["Leg press"]["change_pct"] == 50.0

    bench = next(p for p in data["progressions"] if p["name"] == "Supino reto")
    average = data["progress_average"]
    assert average["load_pct"] == bench["change_pct"]
    assert average["reps_pct"] == 37.5
    assert average["exercises"] == 2

    ficha = data["workouts"][0]
    assert ficha["progress_pct"] == bench["change_pct"]


def test_stats_progress_average_is_empty_without_repeats(client, library, ana, db_session):
    _, headers = ana
    train(client, headers, db_session, make_workout(client, headers, library)["id"], [[(60, 10)]], at(3))
    data = stats(client, headers, "4w")
    assert data["progress_average"] == {"load_pct": None, "reps_pct": None, "exercises": 0}
    assert data["rep_progressions"] == []
    assert data["workouts"][0]["progress_pct"] is None


def test_stats_activity_days_for_the_heatmap(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(60, 10), (60, 10)]], at(3), minutes=45)
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(3, hour=18), minutes=30)
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(400))

    activity = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["activity"]
    assert activity == [{
        "date": (today_br() - timedelta(days=3)).isoformat(),
        "sessions": 2,
        "sets": 3,
        "minutes": 75,
        "volume_kg": 1800.0,
        "workouts": ["Treino A", "Treino A"],
    }]


def test_stats_filter_by_plan_keeps_only_its_fichas(client, library, ana, bruno, db_session):
    _, headers = ana
    _, bruno_headers = bruno
    upper = make_workout(client, headers, library, name="Upper")
    other = make_workout(client, headers, library, name="Outra")
    plan = client.post("/fitness/plans", json={"name": "Treino 1", "days": [{"weekday": 0, "workout_id": upper["id"]}]}, headers=headers).json()
    train(client, headers, db_session, upper["id"], [[(60, 10)]], at(5))
    train(client, headers, db_session, other["id"], [[(60, 10)]], at(4))

    everything = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()
    filtered = client.get("/fitness/stats", params={"period": "4w", "plan_id": plan["id"]}, headers=headers).json()
    assert everything["summary"]["sessions"] == 2
    assert filtered["summary"]["sessions"] == 1
    assert filtered["plan_id"] == plan["id"]
    assert [w["name"] for w in filtered["workouts"]] == ["Upper"]
    assert len(filtered["activity"]) == 1
    assert client.get("/fitness/stats", params={"plan_id": plan["id"]}, headers=bruno_headers).status_code == 404


def test_stats_plan_adherence_counts_planned_days(client, library, ana, db_session):
    from app.fitness_models import Plan
    _, headers = ana
    upper = make_workout(client, headers, library, name="Upper")
    today = today_br()
    days = [{"weekday": (today - timedelta(days=offset)).weekday(), "workout_id": upper["id"]} for offset in (1, 2)]
    plan = client.post("/fitness/plans", json={"name": "Treino 1", "days": days}, headers=headers).json()
    stored = db_session.get(Plan, plan["id"])
    stored.created_at = datetime.combine(today - timedelta(days=13), time(8), tzinfo=BRT).astimezone(timezone.utc)
    db_session.commit()
    train(client, headers, db_session, upper["id"], [[(60, 10)]], at(1))
    train(client, headers, db_session, upper["id"], [[(60, 10)]], at(8))
    train(client, headers, db_session, upper["id"], [[(60, 10)]], at(3))

    adherence = client.get("/fitness/stats", params={"period": "4w", "plan_id": plan["id"]}, headers=headers).json()["adherence"]
    assert adherence["since"] == (today - timedelta(days=13)).isoformat()
    assert adherence["planned"] == 4
    assert adherence["done"] == 2
    assert adherence["pct"] == 50
    assert adherence["extra_days"] == 1
    assert sum(w["planned"] for w in adherence["weekdays"]) == 4

    assert client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["adherence"] is None


def test_stats_plan_details_cover_weeks_skips_workouts_and_muscles(client, library, ana, db_session):
    from app.fitness_models import Plan
    _, headers = ana
    upper = make_workout(client, headers, library, name="Upper")
    today = today_br()
    days = [{"weekday": (today - timedelta(days=offset)).weekday(), "workout_id": upper["id"]} for offset in (1, 2)]
    plan = client.post("/fitness/plans", json={"name": "Treino 1", "days": days}, headers=headers).json()
    stored = db_session.get(Plan, plan["id"])
    stored.created_at = datetime.combine(today - timedelta(days=13), time(8), tzinfo=BRT).astimezone(timezone.utc)
    db_session.commit()
    for days_ago in (1, 8, 3):
        train(client, headers, db_session, upper["id"], [[(60, 10)]], at(days_ago))

    details = client.get("/fitness/stats", params={"period": "4w", "plan_id": plan["id"]}, headers=headers).json()["plan_details"]
    muscles = {row["muscle_group"]: row for row in details["muscles"]}

    assert sum(week["planned"] for week in details["weeks"]) == 4
    assert sum(week["done"] for week in details["weeks"]) == 2
    assert [row["date"] for row in details["skipped"]] == [(today - timedelta(days=d)).isoformat() for d in (2, 9)]
    assert details["skipped"][0]["workouts"] == ["Upper"]
    assert details["most_skipped_weekday"] in {(today - timedelta(days=2)).weekday()}
    assert (details["workouts"][0]["planned"], details["workouts"][0]["done"], details["workouts"][0]["completion_pct"]) == (4, 3, 14.3)
    assert (muscles["chest"]["planned_sets"], muscles["chest"]["done_sets"], muscles["quads"]["planned_sets"]) == (6, 1.5, 8)
    assert details["cardio"] is None


def test_stats_relative_strength_uses_the_body_weight_of_the_day(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    empty = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["relative_strength"]
    assert empty == {"has_body_weight": False, "items": []}

    client.post("/fitness/body-weight", json={"weight_kg": 80, "measured_on": (today_br() - timedelta(days=20)).isoformat()}, headers=headers)
    client.post("/fitness/body-weight", json={"weight_kg": 75, "measured_on": (today_br() - timedelta(days=5)).isoformat()}, headers=headers)
    train(client, headers, db_session, workout["id"], [[(60, 10)]], at(14))
    train(client, headers, db_session, workout["id"], [[(75, 10)]], at(2))

    strength = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["relative_strength"]
    bench = strength["items"][0]
    assert bench["name"] == "Supino reto"
    assert bench["e1rm_kg"] == 100.0
    assert bench["body_weight_kg"] == 75.0
    assert bench["ratio"] == 1.33
    assert bench["first_ratio"] == 1.0


def test_stats_density_and_best_periods(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    train(client, headers, db_session, workout["id"], [[(50, 10)]], at(20), minutes=50)
    train(client, headers, db_session, workout["id"], [[(100, 10)]], at(3), minutes=40)
    train(client, headers, db_session, workout["id"], [[(10, 10)]], at(2), minutes=20)

    data = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()
    assert data["summary"]["density_kg_min"] == round(1600 / 110, 1)
    assert all("density_kg_min" in bucket for bucket in data["timeline"])

    best = data["all_time"]["best_periods"]
    assert best["week_volume"]["volume_kg"] in (1000.0, 1100.0)
    assert best["week_sessions"]["sessions"] in (1, 2)
    assert best["month_volume"]["volume_kg"] >= 1100.0


def test_time_stats_per_set_exercise_and_rest(client, library, ana, db_session):
    from datetime import timedelta as delta
    from app.fitness_models import SetEntry
    _, headers = ana
    workout = make_workout(client, headers, library)
    session = train(client, headers, db_session, workout["id"], [[(60, 10), (60, 10)], [(100, 10)]], at(2), minutes=30)
    start_at = at(2).astimezone(timezone.utc)
    sets = db_session.query(SetEntry).order_by(SetEntry.id).all()
    for entry, offset in zip(sets, (5, 7, 20)):
        entry.created_at = start_at + delta(minutes=offset)
    db_session.commit()

    time = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["time"]
    assert time["avg_session_seconds"] == 1800
    assert time["avg_set_seconds"] == 46
    assert time["avg_exercise_seconds"] == 600
    assert time["avg_rest_seconds"] == 72
    assert time["avg_prep_seconds"] == 496
    assert time["longest_exercises"][0]["name"] == "Leg press"
    assert time["longest_exercises"][0]["avg_seconds"] == 780
    assert time["longest_exercises"][0]["prep_seconds"] == 738

    insights = client.get(f"/fitness/sessions/{session['id']}/insights", headers=headers).json()
    assert [e["seconds"] for e in insights["exercises"]] == [420, 780]
    assert [e["prep_seconds"] for e in insights["exercises"]] == [252, 738]
    assert insights["exercises"][0]["rest_seconds"] == 72
    assert insights["set_seconds"] == 46
    assert insights["time"] == {"prep_seconds": 991, "work_seconds": 136, "rest_seconds": 72}

    progress = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()["time"]
    assert progress == {"sessions": 1, "avg_seconds": 420, "avg_set_seconds": 48, "avg_rest_seconds": 72, "avg_prep_seconds": 252}



def test_stats_per_week_counts_only_since_the_first_session(client, library, ana, db_session):
    _, headers = ana
    workout = make_workout(client, headers, library)
    for days in (13, 6):
        train(client, headers, db_session, workout["id"], [[(60, 10)]], at(days))
    data = stats(client, headers, "3m")
    assert data["summary"]["per_week"] == 1.0
    assert data["previous"] is None
    assert len(data["timeline"]) <= 3
    assert data["timeline"][0]["start"] <= (today_br() - timedelta(days=13)).isoformat()


def test_cardio_stats_and_timed_progress(client, ana, db_session):
    from app.fitness_models import Exercise
    from tests.test_fitness_sessions import start, finish
    _, headers = ana
    bike = Exercise(slug="bike-stats", name="Bike stats", muscle_group="cardio", equipment="cardio", tracking="cardio")
    plank = Exercise(slug="prancha-stats", name="Prancha stats", muscle_group="abs", equipment="bodyweight", tracking="time", bodyweight_factor=0)
    db_session.add_all([bike, plank])
    db_session.commit()
    session = start(client, headers)
    for exercise in (bike, plank):
        client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": exercise.id}, headers=headers)
    items = {item["exercise_id"]: item for item in client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()["exercises"]}
    client.post(f"/fitness/session-exercises/{items[bike.id]['id']}/sets", json={"duration_seconds": 1500, "distance_km": 10}, headers=headers)
    for seconds in (45, 60):
        client.post(f"/fitness/session-exercises/{items[plank.id]['id']}/sets", json={"duration_seconds": seconds}, headers=headers)
    finish(client, headers, session["id"])

    cardio = client.get("/fitness/stats", params={"period": "4w"}, headers=headers).json()["cardio"]
    assert (cardio["sessions"], cardio["minutes"], cardio["distance_km"]) == (1, 25, 10.0)
    assert cardio["exercises"][0]["name"] == "Bike stats"

    progress = client.get(f"/fitness/exercises/{plank.id}/progress", headers=headers).json()
    assert progress["tracking"] == "time"
    point = progress["points"][0]
    assert (point["duration_seconds"], point["best_duration_seconds"], point["estimated_1rm_kg"]) == (105, 60, None)
