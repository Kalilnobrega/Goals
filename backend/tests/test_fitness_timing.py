from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from app.fitness_intensity import guess_intensity, set_seconds
from app.fitness_timing import exercise_timings
from tests.test_fitness_sessions import library, ana

START = datetime(2026, 11, 20, 18, 0, tzinfo=timezone.utc)


def entry(minute: float, reps: int = 10, side=None, position=1, entry_id=None):
    return SimpleNamespace(
        id=entry_id or int(minute * 1000) + (1 if side == "right" else 0),
        created_at=START + timedelta(minutes=minute),
        reps=reps,
        side=side,
        position=position,
        duration_seconds=None,
    )


def item(item_id, exercise_id, sets, rest=None, muscle_group="chest", tracking="reps"):
    return SimpleNamespace(
        id=item_id, exercise_id=exercise_id, sets=sets, rest_seconds=rest,
        muscle_group=muscle_group, muscles=[], tracking=tracking,
    )


def session(*items):
    return SimpleNamespace(started_at=START, exercises=list(items))


def test_set_duration_by_intensity():
    assert set_seconds(10, "low") == 33
    assert set_seconds(10, "moderate") == 41.5
    assert set_seconds(10, "high") == 47.5
    assert set_seconds(10, "very_high") == 58


def test_guess_intensity_from_muscles():
    legs = [{"muscle": "vastus_lateralis", "role": "primary"}, {"muscle": "glute_max", "role": "primary"}]
    assert guess_intensity("quads", legs) == "very_high"
    assert guess_intensity("quads", [{"muscle": "rectus_femoris", "role": "primary"}]) == "moderate"
    assert guess_intensity("biceps", []) == "low"
    assert guess_intensity("back", []) == "high"
    assert guess_intensity("abs", [], "time") is None


def test_prep_work_and_rest_are_split():
    bench = item(1, 10, [entry(5), entry(7)], rest=120)
    timing = exercise_timings(session(bench), {10: "very_high"})[1]

    assert timing["work"] == 116
    assert timing["prep"] == 300 - 58
    assert timing["rests"] == [120 - 58]
    assert timing["seconds"] == 420


def test_prep_counts_from_the_previous_exercise():
    first = item(1, 10, [entry(5)], rest=90)
    second = item(2, 11, [entry(12)], rest=90)
    timings = exercise_timings(session(first, second), {10: "low", 11: "low"})

    assert timings[2]["prep"] == (12 - 5) * 60 - 33
    assert timings[2]["seconds"] == (12 - 5) * 60


def test_long_gaps_still_count_as_rest():
    curl = item(1, 10, [entry(2), entry(4), entry(12)], rest=60)
    timing = exercise_timings(session(curl), {10: "low"})[1]

    assert timing["rests"] == [120 - 33, 8 * 60 - 33]
    assert timing["rest"] == 120 - 33 + 8 * 60 - 33


def test_unilateral_pair_counts_both_sides():
    row = item(1, 10, [entry(3, side="left", position=1), entry(3.5, side="right", position=1)], rest=90)
    timing = exercise_timings(session(row), {10: "high"})[1]

    assert timing["work"] == 2 * 47.5


def test_timed_exercises_use_the_logged_duration():
    plank = item(1, 10, [SimpleNamespace(id=1, created_at=START + timedelta(minutes=3), reps=0, side=None, position=1, duration_seconds=60)], tracking="time", muscle_group="abs")
    timing = exercise_timings(session(plank))[1]

    assert timing["work"] == 60
    assert timing["prep"] == 120


def test_exercises_expose_and_accept_intensity(client, library, ana):
    _, headers = ana
    listed = {e["id"]: e for e in client.get("/fitness/exercises", headers=headers).json()}
    assert listed[library["supino-reto"]]["intensity"] == "high"

    created = client.post(
        "/fitness/exercises",
        json={"name": "Rosca no banco", "muscle_group": "biceps", "equipment": "dumbbell"},
        headers=headers,
    ).json()
    assert created["intensity"] == "low"

    edited = client.patch(f"/fitness/exercises/{created['id']}", json={"intensity": "moderate"}, headers=headers).json()
    assert edited["intensity"] == "moderate"
    assert client.patch(f"/fitness/exercises/{created['id']}", json={"intensity": "extreme"}, headers=headers).status_code == 422


def test_estimates_never_exceed_the_real_time():
    fast = item(1, 10, [entry(0.2), entry(0.5)], rest=60)
    timing = exercise_timings(session(fast), {10: "very_high"})[1]

    assert timing["work"] == 12 + 18
    assert timing["prep"] == 0
    assert timing["rests"] == []
    assert timing["seconds"] == 30


def test_users_can_adjust_a_library_exercise_only_for_themselves(client, library, ana, db_session):
    from tests.test_shared_goals import make_user, headers_for
    _, headers = ana
    bench = library["supino-reto"]

    adjusted = client.put(f"/fitness/exercises/{bench}/intensity", json={"intensity": "very_high"}, headers=headers).json()
    assert (adjusted["intensity"], adjusted["default_intensity"]) == ("very_high", "high")
    listed = {e["id"]: e for e in client.get("/fitness/exercises", headers=headers).json()}
    assert listed[bench]["intensity"] == "very_high"

    other = headers_for(make_user(db_session, "Bia"))
    others = {e["id"]: e for e in client.get("/fitness/exercises", headers=other).json()}
    assert others[bench]["intensity"] == "high"

    reset = client.put(f"/fitness/exercises/{bench}/intensity", json={"intensity": None}, headers=headers).json()
    assert reset["intensity"] == "high"


def test_adjusted_intensity_changes_the_timing(client, library, ana, db_session):
    from tests.test_fitness_sessions import start, finish
    from app.fitness_models import SetEntry
    user, headers = ana
    session = start(client, headers)
    item = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": library["supino-reto"]}, headers=headers).json()["exercises"][0]["id"]
    for _ in range(2):
        client.post(f"/fitness/session-exercises/{item}/sets", json={"weight_kg": 60, "reps": 10}, headers=headers)
    entries = db_session.query(SetEntry).order_by(SetEntry.id).all()
    started = db_session.get(__import__("app.fitness_models", fromlist=["WorkoutSession"]).WorkoutSession, session["id"]).started_at
    for entry, minutes in zip(entries, (5, 8)):
        entry.created_at = started + timedelta(minutes=minutes)
    db_session.commit()
    finish(client, headers, session["id"])

    before = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()
    client.put(f"/fitness/exercises/{library['supino-reto']}/intensity", json={"intensity": "low"}, headers=headers)
    after = client.get(f"/fitness/exercises/{library['supino-reto']}/progress", headers=headers).json()

    assert before["time"]["avg_set_seconds"] == 48
    assert after["time"]["avg_set_seconds"] == 33
    assert (after["intensity"], after["default_intensity"]) == ("low", "high")


def test_custom_exercise_intensity_is_set_on_the_exercise(client, ana):
    _, headers = ana
    created = client.post("/fitness/exercises", json={"name": "Remada no banco", "muscle_group": "back", "equipment": "dumbbell"}, headers=headers).json()
    assert created["intensity"] == "high"

    changed = client.put(f"/fitness/exercises/{created['id']}/intensity", json={"intensity": "moderate"}, headers=headers).json()
    assert (changed["intensity"], changed["default_intensity"]) == ("moderate", "moderate")
