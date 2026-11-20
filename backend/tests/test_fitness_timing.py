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
