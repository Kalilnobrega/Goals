import pytest
from tests.test_fitness_social import social_user, befriend
from tests.test_fitness_sessions import library, make_workout  # noqa: F401


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla")


def make_plan(client, headers, library):
    a = make_workout(client, headers, library, name="Treino A")
    b = make_workout(client, headers, library, name="Treino B")
    plan = client.post("/fitness/plans", json={"name": "ABC", "days": [
        {"weekday": 0, "workout_id": a["id"]}, {"weekday": 2, "workout_id": b["id"]}, {"weekday": 4, "workout_id": a["id"]},
    ]}, headers=headers)
    assert plan.status_code == 200, plan.text
    return plan.json(), a, b


def test_share_workout_in_feed_and_copy(client, library, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    workout = make_workout(client, ana, library)
    post = client.post("/fitness/posts", json={"share_workout_id": workout["id"], "caption": "minha ficha"}, headers=ana)
    assert post.status_code == 200, post.text
    body = post.json()
    assert body["shared_kind"] == "workout" and body["shared"]["name"] == "Treino A"
    assert [e["name"] for e in body["shared"]["exercises"]] == ["Supino reto", "Leg press"]

    client.put(f"/fitness/workouts/{workout['id']}", json={"name": "Mudou", "exercises": []}, headers=ana)
    feed_post = client.get("/fitness/feed", headers=bruno).json()["posts"][0]
    assert feed_post["shared"]["name"] == "Treino A"

    copied = client.post(f"/fitness/posts/{body['id']}/copy-shared", headers=bruno).json()
    assert copied == {"kind": "workout", "id": copied["id"], "name": "Treino A (Ana)", "skipped": 0}
    fichas = client.get("/fitness/workouts", headers=bruno).json()
    assert fichas[0]["exercises"][0]["target_sets"] == 3


def test_cannot_share_someone_elses_workout(client, library, ana, bruno):
    workout = make_workout(client, ana, library)
    assert client.post("/fitness/posts", json={"share_workout_id": workout["id"]}, headers=bruno).status_code == 404
    assert client.post("/fitness/posts", json={"share_workout_id": workout["id"], "share_plan_id": 1}, headers=ana).status_code == 422


def test_share_plan_and_copy_creates_inactive_plan(client, library, ana, bruno):
    befriend(client, ana, bruno, "bruno", "ana")
    own_plan, _, _ = make_plan(client, bruno, library)
    plan, _, _ = make_plan(client, ana, library)
    post = client.post("/fitness/posts", json={"share_plan_id": plan["id"]}, headers=ana).json()
    assert post["shared_kind"] == "plan" and len(post["shared"]["workouts"]) == 2

    copied = client.post(f"/fitness/posts/{post['id']}/copy-shared", headers=bruno).json()
    assert copied["kind"] == "plan" and copied["name"] == "ABC (Ana)"
    plans = {p["id"]: p for p in client.get("/fitness/plans", headers=bruno).json()}
    assert plans[own_plan["id"]]["is_active"] is True
    new_plan = plans[copied["id"]]
    assert new_plan["is_active"] is False
    assert [(d["weekday"], d["workout_name"]) for d in new_plan["days"]] == [(0, "Treino A (Ana)"), (2, "Treino B (Ana)"), (4, "Treino A (Ana)")]
    assert len(client.get("/fitness/workouts", headers=bruno).json()) == 4


def test_send_to_friends_notifies_and_can_be_copied(client, library, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    workout = make_workout(client, ana, library)
    assert client.post("/fitness/shares", json={"kind": "workout", "item_id": workout["id"], "usernames": ["carla"]}, headers=ana).status_code == 422
    sent = client.post("/fitness/shares", json={"kind": "workout", "item_id": workout["id"], "usernames": ["@bruno"], "message": " testa essa "}, headers=ana)
    assert sent.status_code == 200, sent.text
    share = sent.json()[0]
    assert share["message"] == "testa essa"

    note = client.get("/fitness/notifications", headers=bruno).json()["notifications"][0]
    assert note["kind"] == "shared_item" and note["share_id"] == share["id"] and note["detail"] == "workout"
    received = client.get("/fitness/shares/received", headers=bruno).json()
    assert [r["snapshot"]["name"] for r in received] == ["Treino A"]
    assert client.get(f"/fitness/shares/{share['id']}", headers=carla).status_code == 404
    copied = client.post(f"/fitness/shares/{share['id']}/copy", headers=bruno).json()
    assert copied["name"] == "Treino A (Ana)"

    assert client.delete(f"/fitness/shares/{share['id']}", headers=bruno).status_code == 204
    assert client.get("/fitness/shares/received", headers=bruno).json() == []
    assert all(n["kind"] != "shared_item" for n in client.get("/fitness/notifications", headers=bruno).json()["notifications"])


def test_share_custom_exercise_and_copy(client, ana, bruno, library):
    befriend(client, ana, bruno, "bruno", "ana")
    custom = client.post("/fitness/exercises", json={
        "name": "Supino maluco", "muscle_group": "chest", "equipment": "machine",
        "muscles": [{"muscle": "chest_mid", "role": "primary"}],
    }, headers=ana).json()
    assert client.post("/fitness/posts", json={"share_exercise_id": library["supino-reto"]}, headers=ana).status_code == 404
    post = client.post("/fitness/posts", json={"share_exercise_id": custom["id"]}, headers=ana).json()
    assert post["shared_kind"] == "exercise" and post["shared"]["name"] == "Supino maluco"

    copied = client.post(f"/fitness/posts/{post['id']}/copy-shared", headers=bruno).json()
    assert copied["kind"] == "exercise" and copied["name"] == "Supino maluco"
    again = client.post(f"/fitness/posts/{post['id']}/copy-shared", headers=bruno).json()
    assert again["name"] == "Supino maluco (Ana)"
    mine = [e for e in client.get("/fitness/exercises", headers=bruno).json() if e["is_custom"]]
    assert sorted(e["name"] for e in mine) == ["Supino maluco", "Supino maluco (Ana)"]
    assert mine[0]["muscles"][0]["muscle"] == "chest_mid"

    sent = client.post("/fitness/shares", json={"kind": "exercise", "item_id": custom["id"], "usernames": ["bruno"]}, headers=ana)
    assert sent.status_code == 200 and sent.json()[0]["kind"] == "exercise"
