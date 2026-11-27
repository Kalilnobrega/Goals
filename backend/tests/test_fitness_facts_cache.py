from datetime import date
import pytest
from app.fitness_models import ExerciseGymLink, Gym, SetEntry
from app.models import User
import app.routers.fitness_stats as stats_module
from tests.test_fitness_sessions import library, ana, bruno, make_workout, start, log_set, finish  # noqa: F401


@pytest.fixture()
def computed(monkeypatch):
    calls = []
    original = stats_module.compute_facts

    def counting(user, db, *args):
        calls.append(user.id)
        return original(user, db, *args)

    monkeypatch.setattr(stats_module, "compute_facts", counting)
    return calls


def volume(client, headers):
    response = client.get("/fitness/stats", params={"period": "4w"}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["summary"]["volume_kg"]


def trained(client, headers, library, sets):
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    logged = [log_set(client, headers, session["exercises"][0]["id"], weight, reps) for weight, reps in sets]
    assert finish(client, headers, session["id"]).status_code == 200
    return session, logged


def version(db_session, user):
    return db_session.query(User.facts_version).filter(User.id == user.id).scalar()


def test_repeated_reads_reuse_the_computed_history(client, library, ana, computed):
    _, headers = ana
    trained(client, headers, library, [(60, 10)])
    computed.clear()
    assert volume(client, headers) == 600
    assert volume(client, headers) == 600
    assert client.get("/fitness/overview", headers=headers).status_code == 200
    assert len(computed) == 1


def test_editing_a_set_refreshes_the_history(client, library, ana, computed):
    _, headers = ana
    _, logged = trained(client, headers, library, [(60, 10)])
    assert volume(client, headers) == 600
    response = client.patch(f"/fitness/sets/{logged[0]['id']}", json={"weight_kg": 70, "reps": 10}, headers=headers)
    assert response.status_code == 200, response.text
    assert volume(client, headers) == 700


def test_deleting_a_set_refreshes_the_history(client, library, ana):
    _, headers = ana
    _, logged = trained(client, headers, library, [(60, 10), (50, 10)])
    assert volume(client, headers) == 1100
    assert client.delete(f"/fitness/sets/{logged[1]['id']}", headers=headers).status_code == 200
    assert volume(client, headers) == 600


def test_deleting_a_session_refreshes_the_history(client, library, ana):
    _, headers = ana
    session, _ = trained(client, headers, library, [(60, 10)])
    assert volume(client, headers) == 600
    assert client.delete(f"/fitness/sessions/{session['id']}", headers=headers).status_code == 200
    assert volume(client, headers) == 0


def test_body_weight_changes_refresh_the_history(client, ana, db_session):
    user, headers = ana
    before = version(db_session, user)
    response = client.post("/fitness/body-weight", json={"weight_kg": 80, "measured_on": str(date.today())}, headers=headers)
    assert response.status_code == 200, response.text
    assert version(db_session, user) != before


def test_another_users_training_keeps_my_history_cached(client, library, ana, bruno, db_session, computed):
    ana_user, ana_headers = ana
    _, bruno_headers = bruno
    trained(client, ana_headers, library, [(60, 10)])
    volume(client, ana_headers)
    before = version(db_session, ana_user)
    trained(client, bruno_headers, library, [(40, 10)])
    assert version(db_session, ana_user) == before
    computed.clear()
    assert volume(client, ana_headers) == 600
    assert computed == []


def test_bulk_deletes_refresh_the_history(db_session, ana, library):
    user, _ = ana
    gym = Gym(user_id=user.id, name="Centro")
    db_session.add(gym)
    db_session.commit()
    db_session.add(ExerciseGymLink(user_id=user.id, exercise_id=library["supino-reto"], gym_id=gym.id))
    db_session.commit()
    before = version(db_session, user)
    db_session.info["facts_user"] = user.id
    db_session.query(ExerciseGymLink).filter(ExerciseGymLink.user_id == user.id).delete()
    db_session.commit()
    assert version(db_session, user) != before


def test_cached_history_is_not_shared_by_reference(client, library, ana, db_session):
    user, headers = ana
    trained(client, headers, library, [(60, 10)])
    first = stats_module.completed_facts(user, db_session)
    first[0]["exercises"].clear()
    second = stats_module.completed_facts(user, db_session)
    assert second[0]["exercises"]
    assert db_session.query(SetEntry).count() == 1
