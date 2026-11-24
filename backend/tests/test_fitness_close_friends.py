from datetime import timedelta
import pytest
from app.dates import today_br
from tests.test_fitness_social import social_user, befriend
from tests.test_fitness_sessions import library, start, log_set, finish, make_workout  # noqa: F401


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla")


def train(client, headers, library):
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    log_set(client, headers, session["exercises"][0]["id"], 80, 8)
    assert finish(client, headers, session["id"]).status_code == 200
    return workout, session


def test_only_friends_can_be_close_friends(client, ana, bruno):
    assert client.put("/fitness/social/close-friends/bruno", headers=ana).status_code == 409
    befriend(client, ana, bruno, "bruno", "ana")
    assert client.put("/fitness/social/close-friends/bruno", headers=ana).status_code == 200
    assert [u["username"] for u in client.get("/fitness/social/close-friends", headers=ana).json()] == ["bruno"]
    friends = client.get("/fitness/social/friends", headers=ana).json()["friends"]
    assert friends[0]["close"] is True
    assert client.get("/fitness/social/friends", headers=bruno).json()["friends"][0]["close"] is False


def test_close_access_is_one_way(client, library, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    train(client, ana, library)
    train(client, bruno, library)
    assert client.get("/fitness/social/users/ana/workouts", headers=bruno).status_code == 404

    client.put("/fitness/social/close-friends/bruno", headers=ana)
    profile = client.get("/fitness/social/users/ana", headers=bruno).json()
    assert profile["close_access"] is True and profile["weight_shared"] is False
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["close_access"] is False
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["is_close_friend"] is True

    fichas = client.get("/fitness/social/users/ana/workouts", headers=bruno).json()
    assert [w["name"] for w in fichas] == ["Treino A"]
    history = client.get("/fitness/social/users/ana/history", headers=bruno).json()
    assert history["total"] == 1
    session_id = history["items"][0]["id"]
    detail = client.get(f"/fitness/social/users/ana/sessions/{session_id}", headers=bruno).json()
    assert detail["session"]["exercises"][0]["sets"][0]["weight_kg"] == 80
    assert client.get("/fitness/social/users/ana/stats", headers=bruno).json()["summary"]["sessions"] == 1
    progress = client.get("/fitness/social/users/ana/progress/exercises", headers=bruno).json()
    assert progress[0]["best_weight_kg"] == 80
    exercise = client.get(f"/fitness/social/users/ana/exercises/{progress[0]['exercise_id']}/progress", headers=bruno)
    assert exercise.status_code == 200
    assert client.get("/fitness/social/users/bruno/workouts", headers=ana).status_code == 404


def test_close_access_works_even_with_private_profile(client, library, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=ana)
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    train(client, ana, library)
    profile = client.get("/fitness/social/users/ana", headers=bruno).json()
    assert profile["can_view"] is False and profile["close_access"] is True
    assert client.get("/fitness/social/users/ana/history", headers=bruno).json()["total"] == 1


def test_body_weight_needs_its_own_switch(client, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    client.post("/fitness/body-weight", json={"weight_kg": 70, "measured_on": (today_br() - timedelta(days=1)).isoformat()}, headers=ana)
    assert client.get("/fitness/social/users/ana/body-weight", headers=bruno).status_code == 404
    assert client.put("/fitness/profile/close-weight", json={"share": True}, headers=ana).json()["share_weight_close"] is True
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["weight_shared"] is True
    assert client.get("/fitness/social/users/ana/body-weight", headers=bruno).json()[0]["weight_kg"] == 70


def test_unfriend_and_block_remove_close_access(client, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    client.delete("/fitness/social/friends/ana", headers=bruno)
    assert client.get("/fitness/social/close-friends", headers=ana).json() == []

    befriend(client, ana, carla, "carla", "ana")
    client.put("/fitness/social/close-friends/carla", headers=ana)
    client.post("/fitness/social/blocks/carla", headers=ana)
    assert client.get("/fitness/social/close-friends", headers=ana).json() == []
    client.delete("/fitness/social/blocks/carla", headers=ana)
    assert client.get("/fitness/social/users/ana/workouts", headers=carla).status_code == 404


def test_copy_close_friend_workout(client, library, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    workout, _ = train(client, ana, library)
    copied = client.post(f"/fitness/social/users/ana/workouts/{workout['id']}/copy", headers=bruno)
    assert copied.status_code == 200 and copied.json()["name"] == "Treino A (Ana)"
    fichas = client.get("/fitness/workouts", headers=bruno).json()
    item = fichas[0]["exercises"][0]
    assert (item["target_sets"], item["reps_min"], item["reps_max"]) == (3, 8, 12)
    assert client.post(f"/fitness/social/users/bruno/workouts/{workout['id']}/copy", headers=ana).status_code == 404


def test_bodyweight_volume_hides_the_owner_weight_unless_shared(client, db_session, ana, bruno):
    from app.fitness_models import Exercise
    pull = Exercise(slug="barra-privada", name="Barra privada", muscle_group="back", equipment="bodyweight")
    db_session.add(pull)
    db_session.commit()
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    client.post("/fitness/body-weight", json={"weight_kg": 83.4, "measured_on": (today_br() - timedelta(days=1)).isoformat()}, headers=ana)
    workout = client.post("/fitness/workouts", json={"name": "Costas", "exercises": [
        {"exercise_id": pull.id, "target_sets": 1, "reps_min": 10},
    ]}, headers=ana).json()
    session = start(client, ana, workout["id"])
    log_set(client, ana, session["exercises"][0]["id"], 0, 10)
    assert finish(client, ana, session["id"]).status_code == 200
    created = client.post("/fitness/posts", json={"session_id": session["id"]}, headers=ana).json()

    assert client.get(f"/fitness/posts/{created['id']}/workout", headers=ana).json()["session"]["volume_kg"] == 834
    assert client.get(f"/fitness/posts/{created['id']}/workout", headers=bruno).json()["session"]["volume_kg"] == 0
    close = f"/fitness/social/users/ana/sessions/{session['id']}"
    assert client.get(close, headers=bruno).json()["session"]["volume_kg"] == 0
    assert client.get("/fitness/social/users/ana/history", headers=bruno).json()["items"][0]["volume_kg"] == 0
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["recent_sessions"][0]["volume_kg"] == 0
    progress = client.get(f"/fitness/social/users/ana/exercises/{pull.id}/progress", headers=bruno).json()
    assert all(point["volume_kg"] == 0 for point in progress["points"])

    client.put("/fitness/profile/close-weight", json={"share": True}, headers=ana)
    assert client.get(close, headers=bruno).json()["session"]["volume_kg"] == 834
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["recent_sessions"][0]["volume_kg"] == 834
