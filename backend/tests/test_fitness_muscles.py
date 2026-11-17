import pytest
from app.fitness_muscles import MUSCLES, REGIONS, group_credit, muscle_credit
from tests.test_fitness_sessions import ana, bruno  # noqa: F401

BENCH = [
    {"muscle": "chest_upper", "role": "primary"},
    {"muscle": "delts_front", "role": "secondary"},
    {"muscle": "triceps_lateral", "role": "secondary"},
    {"muscle": "triceps_medial", "role": "secondary"},
]


def create(client, headers, muscles, name="Supino máquina inclinado", group="chest"):
    response = client.post(
        "/fitness/exercises",
        json={"name": name, "muscle_group": group, "equipment": "machine", "muscles": muscles},
        headers=headers,
    )
    return response


def test_taxonomy_is_consistent():
    groups = [group for groups in REGIONS.values() for group in groups]
    assert len(groups) == len(set(groups))
    assert set(MUSCLES.values()) == set(groups)


def test_credit_counts_secondary_as_half_and_groups_once():
    assert muscle_credit(BENCH) == {"chest_upper": 1.0, "delts_front": 0.5, "triceps_lateral": 0.5, "triceps_medial": 0.5}
    assert group_credit(BENCH) == {"chest": 1.0, "shoulders": 0.5, "triceps": 0.5}
    assert group_credit([{"muscle": "biceps", "role": "secondary"}, {"muscle": "brachialis", "role": "primary"}]) == {"biceps": 1.0}
    assert group_credit([]) == {}


def test_create_exercise_with_muscles(client, ana):
    _, headers = ana
    response = create(client, headers, BENCH)
    assert response.status_code == 200, response.text
    assert response.json()["muscles"] == BENCH


def test_exercise_without_muscles_defaults_to_empty(client, ana):
    _, headers = ana
    response = create(client, headers, [])
    assert response.json()["muscles"] == []


@pytest.mark.parametrize("muscles", [
    [{"muscle": "peito", "role": "primary"}],
    [{"muscle": "chest_upper", "role": "main"}],
    [{"muscle": "chest_upper", "role": "primary"}, {"muscle": "chest_upper", "role": "secondary"}],
])
def test_invalid_muscles_are_rejected(client, ana, muscles):
    _, headers = ana
    assert create(client, headers, muscles).status_code == 422


def test_forearms_group_is_accepted(client, ana):
    _, headers = ana
    response = create(client, headers, [{"muscle": "forearm_flexors", "role": "primary"}], name="Rosca punho", group="forearms")
    assert response.status_code == 200
    assert response.json()["muscle_group"] == "forearms"


def test_edit_replaces_or_keeps_muscles(client, ana):
    _, headers = ana
    exercise = create(client, headers, BENCH).json()

    renamed = client.patch(f"/fitness/exercises/{exercise['id']}", json={"name": "Supino inclinado máquina"}, headers=headers)
    assert renamed.json()["muscles"] == BENCH

    replaced = client.patch(
        f"/fitness/exercises/{exercise['id']}",
        json={"muscles": [{"muscle": "chest_mid", "role": "primary"}]},
        headers=headers,
    )
    assert replaced.status_code == 200
    assert replaced.json()["muscles"] == [{"muscle": "chest_mid", "role": "primary"}]


def test_session_keeps_a_snapshot_of_the_muscles(client, ana):
    _, headers = ana
    exercise = create(client, headers, BENCH).json()
    workout = client.post(
        "/fitness/workouts",
        json={"name": "Peito", "exercises": [{"exercise_id": exercise["id"], "target_sets": 3, "reps_min": 10}]},
        headers=headers,
    ).json()
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()
    assert session["exercises"][0]["muscles"] == BENCH

    client.patch(f"/fitness/exercises/{exercise['id']}", json={"muscles": [{"muscle": "chest_mid", "role": "primary"}]}, headers=headers)
    fetched = client.get(f"/fitness/sessions/{session['id']}", headers=headers).json()
    assert fetched["exercises"][0]["muscles"] == BENCH

    other = create(client, headers, [{"muscle": "lats", "role": "primary"}], name="Puxada máquina", group="back").json()
    added = client.post(f"/fitness/sessions/{session['id']}/exercises", json={"exercise_id": other["id"]}, headers=headers).json()
    assert added["exercises"][1]["muscles"] == [{"muscle": "lats", "role": "primary"}]
