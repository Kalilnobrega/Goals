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
