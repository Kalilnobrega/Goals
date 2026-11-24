from datetime import datetime, timedelta, timezone
import pytest
from tests.test_fitness_social import social_user, befriend
from tests.test_fitness_sessions import library, start, log_set, make_workout  # noqa: F401


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla")


def live(client, headers):
    return [item["username"] for item in client.get("/fitness/social/live", headers=headers).json()]


def test_close_friends_see_who_is_training_now(client, db_session, library, ana, bruno, carla):
    from app.fitness_models import WorkoutSession
    befriend(client, ana, bruno, "bruno", "ana")
    befriend(client, ana, carla, "carla", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    workout = make_workout(client, ana, library)
    session = start(client, ana, workout["id"])

    assert live(client, bruno) == ["ana"]
    assert live(client, carla) == []
    item = client.get("/fitness/social/live", headers=bruno).json()[0]
    assert item["session_name"] == "Treino A" and item["name"] == "Ana Souza"

    client.put("/fitness/profile/share-live", json={"share": False}, headers=ana)
    assert live(client, bruno) == []
    client.put("/fitness/profile/share-live", json={"share": True}, headers=ana)

    row = db_session.get(WorkoutSession, session["id"])
    row.started_at = datetime.now(timezone.utc) - timedelta(minutes=40)
    db_session.commit()
    assert live(client, bruno) == []
    log_set(client, ana, session["exercises"][0]["id"], 60, 10)
    assert live(client, bruno) == ["ana"]


def test_close_friends_watch_the_workout_live(client, library, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    befriend(client, ana, carla, "carla", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    assert client.get("/fitness/social/users/ana/live", headers=carla).status_code == 404
    assert client.get("/fitness/social/users/ana/live", headers=bruno).json()["live"] is False

    workout = make_workout(client, ana, library)
    session = start(client, ana, workout["id"])
    client.patch(f"/fitness/session-exercises/{session['exercises'][0]['id']}", json={"note": "segredo"}, headers=ana)
    log_set(client, ana, session["exercises"][0]["id"], 60, 10)
    watched = client.get("/fitness/social/users/ana/live", headers=bruno).json()
    assert watched["live"] is True and watched["author"]["username"] == "ana"
    first = watched["session"]["exercises"][0]
    assert [(s["weight_kg"], s["reps"]) for s in first["sets"]] == [(60, 10)]
    assert first["note"] is None and first["previous"] == []

    client.post(f"/fitness/sessions/{session['id']}/finish", json={}, headers=ana)
    assert client.get("/fitness/social/users/ana/live", headers=bruno).json()["live"] is False


def test_live_alert_notifies_only_watchers_who_asked(client, library, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    befriend(client, ana, carla, "carla", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    assert client.put("/fitness/social/users/ana/live-alert", headers=carla).status_code == 404
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["live_alert"] is False
    assert client.put("/fitness/social/users/ana/live-alert", headers=bruno).status_code == 204
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["live_alert"] is True

    workout = make_workout(client, ana, library)
    session = start(client, ana, workout["id"])
    notes = [n for n in client.get("/fitness/notifications", headers=bruno).json()["notifications"] if n["kind"] == "live_started"]
    assert len(notes) == 1 and notes[0]["detail"] == "Treino A" and notes[0]["actor"]["username"] == "ana"
    assert all(n["kind"] != "live_started" for n in client.get("/fitness/notifications", headers=carla).json()["notifications"])

    client.delete(f"/fitness/sessions/{session['id']}", headers=ana)
    start(client, ana, workout["id"])
    assert len([n for n in client.get("/fitness/notifications", headers=bruno).json()["notifications"] if n["kind"] == "live_started"]) == 1

    client.delete("/fitness/social/users/ana/live-alert", headers=bruno)
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["live_alert"] is False


def test_close_friends_cheer_someone_training(client, library, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    befriend(client, ana, carla, "carla", "ana")
    client.put("/fitness/social/close-friends/bruno", headers=ana)
    url = "/fitness/social/users/ana/live/cheer"
    assert client.post(url, json={"kind": "fire"}, headers=bruno).status_code == 409

    workout = make_workout(client, ana, library)
    session = start(client, ana, workout["id"])
    assert client.post(url, json={"kind": "fire"}, headers=carla).status_code == 404
    assert client.post(url, json={"kind": "nope"}, headers=bruno).status_code == 422
    assert client.post(url, json={"kind": "fire"}, headers=bruno).status_code == 204
    assert client.post(url, json={"kind": "go"}, headers=bruno).status_code == 429

    cheers_url = f"/fitness/social/my-live/{session['id']}/cheers"
    cheers = client.get(cheers_url, headers=ana).json()
    assert [(c["kind"], c["name"]) for c in cheers] == [("fire", "Bruno")]
    assert client.get(cheers_url, params={"after": cheers[0]["id"]}, headers=ana).json() == []
    assert client.get(cheers_url, headers=bruno).status_code == 404
