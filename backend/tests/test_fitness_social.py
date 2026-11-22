import pytest
from tests.test_shared_goals import make_user, headers_for
from tests.test_fitness_sessions import library, start, log_set, finish, make_workout  # noqa: F401


def social_user(db_session, client, name, username, visibility=None):
    user = make_user(db_session, name)
    headers = headers_for(user)
    assert client.put("/fitness/profile/username", json={"username": username}, headers=headers).status_code == 200
    if visibility:
        assert client.put("/fitness/profile/visibility", json={"visibility": visibility}, headers=headers).status_code == 200
    return headers


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla", "public")


def befriend(client, a, b, b_username, a_username):
    assert client.post("/fitness/social/friends/requests", json={"username": b_username}, headers=a).status_code == 200
    assert client.post(f"/fitness/social/friends/{a_username}/accept", headers=b).status_code == 200


def train(client, headers, library):
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    assert finish(client, headers, session["id"]).status_code == 200
    second = start(client, headers, workout["id"])
    log_set(client, headers, second["exercises"][0]["id"], 70, 8)
    assert finish(client, headers, second["id"]).status_code == 200


def test_social_requires_authentication(client):
    assert client.get("/fitness/social/friends").status_code == 401
    assert client.get("/fitness/social/search", params={"q": "ana"}).status_code == 401
    assert client.get("/fitness/social/users/ana").status_code == 401


def test_social_requires_a_username(client, db_session):
    headers = headers_for(make_user(db_session, "Sem Nome"))
    response = client.get("/fitness/social/friends", headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "Crie seu @username para usar o Social."
    assert client.post("/fitness/social/friends/requests", json={"username": "ana"}, headers=headers).status_code == 409


def test_visibility_defaults_to_friends_and_can_change(client, ana):
    assert client.get("/fitness/profile", headers=ana).json()["visibility"] == "friends"
    response = client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=ana)
    assert response.json()["visibility"] == "private"
    assert client.put("/fitness/profile/visibility", json={"visibility": "secret"}, headers=ana).status_code == 422


def test_search_by_username_for_everyone_and_by_name_only_for_public(client, ana, bruno, carla):
    def search(q, headers=ana):
        return [u["username"] for u in client.get("/fitness/social/search", params={"q": q}, headers=headers).json()]

    assert search("@bru") == ["bruno"]
    assert search("Lima") == []
    assert search("Dias") == ["carla"]
    assert search("an") == []
    assert search("a") == []
    assert search("ana", bruno) == ["ana"]


def test_search_hides_people_who_blocked_you(client, ana, bruno):
    client.post("/fitness/social/blocks/ana", headers=bruno)
    assert client.get("/fitness/social/search", params={"q": "bruno"}, headers=ana).json() == []
    assert client.get("/fitness/social/users/bruno", headers=ana).status_code == 404


def test_friend_request_flow(client, ana, bruno):
    sent = client.post("/fitness/social/friends/requests", json={"username": "@Bruno"}, headers=ana)
    assert sent.json() == {"username": "bruno", "name": "Bruno Lima", "relation": "request_sent"}

    bruno_view = client.get("/fitness/social/friends", headers=bruno).json()
    assert [f["username"] for f in bruno_view["incoming"]] == ["ana"]
    assert client.get("/fitness/social/friends", headers=ana).json()["outgoing"][0]["username"] == "bruno"

    assert client.post("/fitness/social/friends/bruno/accept", headers=ana).status_code == 404
    accepted = client.post("/fitness/social/friends/ana/accept", headers=bruno)
    assert accepted.json()["relation"] == "friends"

    assert [f["username"] for f in client.get("/fitness/social/friends", headers=ana).json()["friends"]] == ["bruno"]
    again = client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert again.status_code == 409

    removed = client.delete("/fitness/social/friends/bruno", headers=ana)
    assert removed.json()["relation"] == "none"
    assert client.get("/fitness/social/friends", headers=bruno).json() == {"friends": [], "incoming": [], "outgoing": []}


def test_crossed_requests_become_a_friendship(client, ana, bruno):
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    response = client.post("/fitness/social/friends/requests", json={"username": "ana"}, headers=bruno)
    assert response.json()["relation"] == "friends"


def test_declining_and_cancelling_requests(client, ana, bruno):
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert client.delete("/fitness/social/friends/ana", headers=bruno).json()["relation"] == "none"
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert client.delete("/fitness/social/friends/bruno", headers=ana).json()["relation"] == "none"
    assert client.delete("/fitness/social/friends/bruno", headers=ana).status_code == 404


def test_cannot_befriend_yourself_or_unknown_people(client, ana):
    assert client.post("/fitness/social/friends/requests", json={"username": "ana"}, headers=ana).status_code == 422
    assert client.post("/fitness/social/friends/requests", json={"username": "ninguem"}, headers=ana).status_code == 404


def test_blocking_removes_friendship_and_prevents_requests(client, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    blocked = client.post("/fitness/social/blocks/bruno", headers=ana)
    assert blocked.json()["relation"] == "blocked"
    assert client.get("/fitness/social/friends", headers=ana).json()["friends"] == []
    assert [u["username"] for u in client.get("/fitness/social/blocks", headers=ana).json()] == ["bruno"]

    assert client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana).status_code == 409
    assert client.post("/fitness/social/friends/requests", json={"username": "ana"}, headers=bruno).status_code == 404

    view = client.get("/fitness/social/users/bruno", headers=ana).json()
    assert view["relation"] == "blocked" and view["can_view"] is False

    assert client.delete("/fitness/social/blocks/bruno", headers=ana).json()["relation"] == "none"
    assert client.get("/fitness/social/users/ana", headers=bruno).status_code == 200


def test_report_is_saved(client, ana, bruno, db_session):
    from app.fitness_models import UserReport
    response = client.post("/fitness/social/reports/bruno", json={"reason": "spam", "details": " link estranho "}, headers=ana)
    assert response.status_code == 201
    report = db_session.query(UserReport).one()
    assert report.reason == "spam" and report.details == "link estranho"
    assert client.post("/fitness/social/reports/bruno", json={"reason": "outro"}, headers=ana).status_code == 422


def test_friends_only_profile_shows_details_only_to_friends(client, library, ana, bruno, carla):
    train(client, bruno, library)

    stranger = client.get("/fitness/social/users/bruno", headers=carla).json()
    assert stranger["can_view"] is False
    assert stranger["stats"] is None and stranger["records"] is None and stranger["recent_sessions"] is None
    assert stranger["name"] == "Bruno Lima" and stranger["relation"] == "none"

    befriend(client, ana, bruno, "bruno", "ana")
    friend = client.get("/fitness/social/users/bruno", headers=ana).json()
    assert friend["can_view"] is True
    assert friend["stats"]["workouts"] == 2
    assert friend["stats"]["friends"] == 1
    assert friend["records"][0]["weight_kg"] == 70
    assert len(friend["recent_sessions"]) == 2
    assert "weight" not in str(friend["stats"])


def test_public_profile_hides_recent_sessions_from_strangers(client, library, ana, carla):
    train(client, carla, library)
    stranger = client.get("/fitness/social/users/carla", headers=ana).json()
    assert stranger["can_view"] is True
    assert stranger["stats"]["workouts"] == 2
    assert stranger["records"]
    assert stranger["recent_sessions"] is None


def test_private_profile_hides_details_even_from_friends(client, library, ana, bruno):
    train(client, bruno, library)
    befriend(client, ana, bruno, "bruno", "ana")
    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)

    view = client.get("/fitness/social/users/bruno", headers=ana).json()
    assert view["relation"] == "friends"
    assert view["can_view"] is False
    assert view["stats"] is None

    own = client.get("/fitness/social/users/bruno", headers=bruno).json()
    assert own["relation"] == "self" and own["can_view"] is True and own["recent_sessions"]
