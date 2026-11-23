import pytest
from tests.test_fitness_social import social_user, befriend
from tests.test_fitness_challenges import create, join, payload  # noqa: F401


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla")


def kinds(client, headers):
    return [(n["kind"], n["actor"]["username"]) for n in client.get("/fitness/notifications", headers=headers).json()["notifications"]]


def test_notifications_require_auth(client):
    assert client.get("/fitness/notifications").status_code == 401


def test_friend_request_and_accept_notify(client, ana, bruno):
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert kinds(client, bruno) == [("friend_request", "ana")]
    client.post("/fitness/social/friends/ana/accept", headers=bruno)
    assert kinds(client, bruno) == []
    assert kinds(client, ana) == [("friend_accepted", "bruno")]


def test_cancelled_request_removes_notification(client, ana, bruno):
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    client.delete("/fitness/social/friends/bruno", headers=ana)
    assert kinds(client, bruno) == []


def test_challenge_invite_and_join_notify(client, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    challenge = create(client, ana)
    client.post(f"/fitness/challenges/{challenge['id']}/invites", json={"username": "bruno"}, headers=ana)
    invite = client.get("/fitness/notifications", headers=bruno).json()["notifications"][0]
    assert invite["kind"] == "challenge_invite" and invite["challenge_name"] == "Desafio de novembro"
    join(client, carla, challenge)
    assert ("challenge_joined", "carla") in kinds(client, ana)


def test_reactions_and_comments_notify_the_author(client, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    post = client.post("/fitness/posts", json={"caption": "bora"}, headers=ana).json()
    client.put(f"/fitness/posts/{post['id']}/reaction", json={"kind": "fire"}, headers=bruno)
    client.put(f"/fitness/posts/{post['id']}/reaction", json={"kind": "strong"}, headers=bruno)
    reactions = [n for n in client.get("/fitness/notifications", headers=ana).json()["notifications"] if n["kind"] == "post_reaction"]
    assert len(reactions) == 1 and reactions[0]["detail"] == "strong" and reactions[0]["post_id"] == post["id"]

    client.delete(f"/fitness/posts/{post['id']}/reaction", headers=bruno)
    assert ("post_reaction", "bruno") not in kinds(client, ana)

    comment = client.post(f"/fitness/posts/{post['id']}/comments", json={"text": "monstro demais"}, headers=bruno).json()
    note = client.get("/fitness/notifications", headers=ana).json()["notifications"][0]
    assert note["kind"] == "post_comment" and note["preview"] == "monstro demais"
    client.post(f"/fitness/posts/{post['id']}/comments", json={"text": "valeu"}, headers=ana)
    assert kinds(client, ana) == [("post_comment", "bruno"), ("friend_accepted", "bruno")]

    client.delete(f"/fitness/comments/{comment['id']}", headers=bruno)
    assert ("post_comment", "bruno") not in kinds(client, ana)


def test_unread_count_and_read_all(client, ana, bruno):
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert client.get("/fitness/notifications", headers=bruno).json()["unread"] == 1
    assert client.get("/fitness/challenges/pending/count", headers=bruno).json()["notifications"] == 1
    assert client.post("/fitness/notifications/read-all", headers=bruno).status_code == 204
    data = client.get("/fitness/notifications", headers=bruno).json()
    assert data["unread"] == 0 and data["notifications"][0]["read"] is True


def test_blocked_people_do_not_notify(client, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    post = client.post("/fitness/posts", json={"caption": "bora"}, headers=ana).json()
    client.post("/fitness/social/blocks/bruno", headers=ana)
    client.post("/fitness/notifications/read-all", headers=ana)
    before = len(kinds(client, ana))
    client.post("/fitness/social/blocks/bruno", headers=ana)
    client.delete("/fitness/social/blocks/bruno", headers=ana)
    client.post("/fitness/social/blocks/bruno", headers=ana)
    assert client.post(f"/fitness/posts/{post['id']}/comments", json={"text": "oi"}, headers=bruno).status_code == 404
    assert len(kinds(client, ana)) == before


def test_deleting_a_post_removes_its_notifications(client, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    post = client.post("/fitness/posts", json={"caption": "bora"}, headers=ana).json()
    client.put(f"/fitness/posts/{post['id']}/reaction", json={"kind": "fire"}, headers=bruno)
    client.delete(f"/fitness/posts/{post['id']}", headers=ana)
    assert ("post_reaction", "bruno") not in kinds(client, ana)
