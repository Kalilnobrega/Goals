import pytest
from tests.test_shared_goals import make_user, headers_for
from tests.test_fitness_sessions import library, start, log_set, finish, make_workout  # noqa: F401
from tests.test_fitness_social import social_user, befriend

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 200


@pytest.fixture(autouse=True)
def media_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_MEDIA_DIR", str(tmp_path))
    monkeypatch.delenv("MEDIA_BUCKET", raising=False)
    return tmp_path


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla", "public")


def upload(client, headers, data=JPEG, **fields):
    response = client.post("/fitness/media", files={"file": ("foto.jpg", data, "image/jpeg")}, data=fields, headers=headers)
    return response


def finished_session(client, headers, library):
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    log_set(client, headers, session["exercises"][0]["id"], 60, 10)
    assert finish(client, headers, session["id"]).status_code == 200
    return session


def post(client, headers, **body):
    response = client.post("/fitness/posts", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_upload_validates_and_serves_with_signed_url(client, ana, media_dir):
    assert upload(client, ana, data=b"not an image").status_code == 415
    response = upload(client, ana, data=PNG, width="800", height="600")
    assert response.status_code == 200
    media = response.json()
    assert media["width"] == 800 and media["url"].startswith(f"/fitness/media/{media['id']}?v=feed&exp=")
    assert media["full_url"] == media["url"]
    assert len(list(media_dir.rglob("*.png"))) == 1

    served = client.get(media["url"])
    assert served.status_code == 200 and served.content == PNG and served.headers["content-type"] == "image/png"
    tampered = media["url"].replace("sig=", "sig=0")
    assert client.get(tampered).status_code == 403


def test_upload_rejects_large_files(client, ana):
    big = b"\xff\xd8\xff" + b"0" * (8 * 1024 * 1024)
    assert upload(client, ana, data=big).status_code == 413


def test_workout_post_with_photos(client, library, ana):
    session = finished_session(client, ana, library)
    first = upload(client, ana).json()
    second = upload(client, ana, data=PNG).json()
    created = post(client, ana, session_id=session["id"], caption="  Treino pago  ", media_ids=[second["id"], first["id"]])
    assert created["caption"] == "Treino pago"
    assert [m["id"] for m in created["media"]] == [second["id"], first["id"]]
    assert created["workout"]["name"] == "Treino A" and created["workout"]["exercises"] == 1
    assert created["is_mine"] is True

    again = client.post("/fitness/posts", json={"session_id": session["id"]}, headers=ana)
    assert again.status_code == 409
    reuse = client.post("/fitness/posts", json={"caption": "x", "media_ids": [first["id"]]}, headers=ana)
    assert reuse.status_code == 422


def test_post_rules(client, library, ana, bruno):
    assert client.post("/fitness/posts", json={}, headers=ana).status_code == 422
    assert client.post("/fitness/posts", json={"media_ids": [1, 2, 3, 4, 5]}, headers=ana).status_code == 422
    foreign = upload(client, bruno).json()
    assert client.post("/fitness/posts", json={"media_ids": [foreign["id"]]}, headers=ana).status_code == 422
    bruno_session = finished_session(client, bruno, library)
    assert client.post("/fitness/posts", json={"session_id": bruno_session["id"]}, headers=ana).status_code == 404
    free = post(client, ana, activity="Corrida", caption="5 km no parque")
    assert free["workout"] is None and free["activity"] == "Corrida"


def test_feed_shows_network_posts_respecting_privacy(client, ana, bruno, carla, db_session):
    befriend(client, ana, bruno, "bruno", "ana")
    post(client, ana, caption="da ana")
    post(client, bruno, caption="do bruno")
    post(client, carla, caption="da carla")

    feed = client.get("/fitness/feed", headers=ana).json()
    assert [p["caption"] for p in feed["posts"]] == ["do bruno", "da ana"]
    assert feed["next_before"] is None

    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    assert [p["caption"] for p in client.get("/fitness/feed", headers=ana).json()["posts"]] == ["da ana"]

    carla_posts = client.get("/fitness/users/carla/posts", headers=ana).json()["posts"]
    assert [p["caption"] for p in carla_posts] == ["da carla"]
    assert client.get("/fitness/users/bruno/posts", headers=carla).json()["posts"] == []


def test_feed_pagination(client, ana):
    for index in range(23):
        post(client, ana, caption=f"post {index}")
    first = client.get("/fitness/feed", headers=ana).json()
    assert len(first["posts"]) == 20 and first["next_before"]
    second = client.get("/fitness/feed", params={"before": first["next_before"]}, headers=ana).json()
    assert [p["caption"] for p in second["posts"]] == ["post 2", "post 1", "post 0"]


def test_reactions_and_comments(client, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    created = post(client, ana, caption="bora")
    pid = created["id"]

    reacted = client.put(f"/fitness/posts/{pid}/reaction", json={"kind": "fire"}, headers=bruno).json()
    assert reacted["reactions"] == {"fire": 1} and reacted["my_reaction"] == "fire"
    changed = client.put(f"/fitness/posts/{pid}/reaction", json={"kind": "strong"}, headers=bruno).json()
    assert changed["reactions"] == {"strong": 1}
    assert client.put(f"/fitness/posts/{pid}/reaction", json={"kind": "love"}, headers=bruno).status_code == 422
    assert client.delete(f"/fitness/posts/{pid}/reaction", headers=bruno).json()["reactions"] == {}

    comment = client.post(f"/fitness/posts/{pid}/comments", json={"text": " monstro "}, headers=bruno).json()
    assert comment["text"] == "monstro" and comment["can_delete"] is True
    detail = client.get(f"/fitness/posts/{pid}", headers=ana).json()
    assert detail["comment_count"] == 1 and detail["comments"][0]["can_delete"] is True

    assert client.get(f"/fitness/posts/{pid}", headers=carla).status_code == 404
    assert client.post(f"/fitness/posts/{pid}/comments", json={"text": "oi"}, headers=carla).status_code == 404
    assert client.delete(f"/fitness/comments/{comment['id']}", headers=carla).status_code == 404
    assert client.delete(f"/fitness/comments/{comment['id']}", headers=ana).status_code == 204


def test_delete_post_removes_photos(client, ana, bruno, media_dir):
    media = upload(client, ana).json()
    created = post(client, ana, caption="foto", media_ids=[media["id"]])
    assert client.delete(f"/fitness/posts/{created['id']}", headers=bruno).status_code == 404
    assert client.delete(f"/fitness/posts/{created['id']}", headers=ana).status_code == 204
    assert list(media_dir.rglob("*.jpg")) == []
    assert client.get(media["url"]).status_code == 404


def test_report_post(client, ana, bruno, db_session):
    from app.fitness_models import UserReport
    befriend(client, ana, bruno, "bruno", "ana")
    created = post(client, ana, caption="x")
    assert client.post(f"/fitness/posts/{created['id']}/report", json={"reason": "offensive"}, headers=ana).status_code == 422
    assert client.post(f"/fitness/posts/{created['id']}/report", json={"reason": "offensive"}, headers=bruno).status_code == 201
    assert db_session.query(UserReport).one().post_id == created["id"]


def test_progress_photos_are_private(client, ana, bruno):
    photo = upload(client, ana, kind="progress", taken_on="2026-11-01", note="antes").json()
    assert photo["taken_on"] == "2026-11-01" and photo["note"] == "antes"
    assert [p["id"] for p in client.get("/fitness/progress-photos", headers=ana).json()] == [photo["id"]]
    assert client.get("/fitness/progress-photos", headers=bruno).json() == []
    assert client.post("/fitness/posts", json={"media_ids": [photo["id"]]}, headers=ana).status_code == 422
    assert client.delete(f"/fitness/media/{photo['id']}", headers=bruno).status_code == 404
    assert client.delete(f"/fitness/media/{photo['id']}", headers=ana).status_code == 204
    assert upload(client, ana, kind="progress", taken_on="2999-01-01").status_code == 422


def test_account_deletion_removes_photos(client, db_session, media_dir):
    user = make_user(db_session, "Dani")
    headers = headers_for(user)
    upload(client, headers, kind="progress")
    assert list(media_dir.rglob("*.jpg"))
    assert client.request("DELETE", "/auth/me", json={"password": None}, headers=headers).status_code == 200
    assert list(media_dir.rglob("*.jpg")) == []


def test_full_size_version_is_stored_and_served_separately(client, ana, media_dir):
    response = client.post(
        "/fitness/media",
        files={"file": ("feed.jpg", JPEG, "image/jpeg"), "full": ("full.png", PNG, "image/png")},
        data={"width": "1080", "height": "1350", "full_width": "2560", "full_height": "1920"},
        headers=ana,
    )
    assert response.status_code == 200, response.text
    media = response.json()
    assert media["full_url"] != media["url"] and "v=full" in media["full_url"]
    assert media["full_width"] == 2560 and media["width"] == 1080
    assert client.get(media["url"]).content == JPEG
    full = client.get(media["full_url"])
    assert full.content == PNG and full.headers["content-type"] == "image/png"
    assert client.get(media["url"].replace("v=feed", "v=full")).status_code == 403

    created = client.post("/fitness/posts", json={"caption": "x", "media_ids": [media["id"]]}, headers=ana).json()
    assert len(list(media_dir.rglob("*.*"))) == 2
    client.delete(f"/fitness/posts/{created['id']}", headers=ana)
    assert list(media_dir.rglob("*.*")) == []


def test_postable_sessions_lists_recent_unposted_workouts(client, library, ana, bruno, db_session):
    from datetime import timedelta
    from app.fitness_models import WorkoutSession
    first = finished_session(client, ana, library)
    second = finished_session(client, ana, library)
    old = finished_session(client, ana, library)
    stale = db_session.get(WorkoutSession, old["id"])
    stale.started_at -= timedelta(days=40)
    stale.completed_at -= timedelta(days=40)
    db_session.commit()
    finished_session(client, bruno, library)

    listed = client.get("/fitness/posts/postable-sessions", headers=ana).json()
    assert [s["id"] for s in listed] == [second["id"], first["id"]]
    assert listed[0]["name"] == "Treino A" and listed[0]["exercises"] == 1

    post(client, ana, session_id=second["id"], caption="pago")
    assert [s["id"] for s in client.get("/fitness/posts/postable-sessions", headers=ana).json()] == [first["id"]]


def test_post_workout_detail_follows_post_visibility_and_hides_notes(client, library, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    workout = make_workout(client, ana, library)
    first = start(client, ana, workout["id"])
    log_set(client, ana, first["exercises"][0]["id"], 60, 10)
    assert finish(client, ana, first["id"]).status_code == 200
    session = start(client, ana, workout["id"])
    item = session["exercises"][0]["id"]
    log_set(client, ana, item, 70, 8)
    client.patch(f"/fitness/session-exercises/{item}", json={"note": "ombro doendo"}, headers=ana)
    assert finish(client, ana, session["id"]).status_code == 200
    created = post(client, ana, session_id=session["id"])
    free = post(client, ana, caption="sem treino")

    seen = client.get(f"/fitness/posts/{created['id']}/workout", headers=bruno).json()
    assert seen["is_mine"] is False and seen["author"]["username"] == "ana"
    exercise = seen["session"]["exercises"][0]
    assert exercise["sets"][0]["weight_kg"] == 70 and exercise["sets"][0]["reps"] == 8
    assert exercise["note"] is None and exercise["previous"] == [] and exercise["history"] == []
    assert seen["records"] == [{"name": "Supino reto", "weight_kg": 70.0, "reps": 8, "previous_kg": 60.0}]

    own = client.get(f"/fitness/posts/{created['id']}/workout", headers=ana).json()
    assert own["is_mine"] is True

    assert client.get(f"/fitness/posts/{created['id']}/workout", headers=carla).status_code == 404
    assert client.get(f"/fitness/posts/{free['id']}/workout", headers=bruno).status_code == 404


def test_copy_post_workout_into_own_workouts(client, library, ana, bruno, carla, db_session):
    from app.fitness_models import Exercise
    befriend(client, ana, bruno, "bruno", "ana")
    custom = client.post("/fitness/exercises", json={"name": "Meu exercício", "muscle_group": "chest", "equipment": "machine"}, headers=ana).json()
    workout = client.post("/fitness/workouts", json={"name": "Peito da Ana", "exercises": [
        {"exercise_id": library["supino-reto"], "target_sets": 4, "reps_min": 8, "reps_max": 12, "rest_seconds": 90},
        {"exercise_id": custom["id"], "target_sets": 2, "reps_min": 10},
    ]}, headers=ana).json()
    session = start(client, ana, workout["id"])
    log_set(client, ana, session["exercises"][0]["id"], 60, 10)
    log_set(client, ana, session["exercises"][0]["id"], 60, 9)
    log_set(client, ana, session["exercises"][1]["id"], 30, 10)
    assert finish(client, ana, session["id"]).status_code == 200
    created = post(client, ana, session_id=session["id"])

    copied = client.post(f"/fitness/posts/{created['id']}/copy-workout", headers=bruno)
    assert copied.status_code == 200, copied.text
    body = copied.json()
    assert body["name"] == "Peito da Ana (Ana)" and body["skipped"] == 1
    fichas = client.get("/fitness/workouts", headers=bruno).json()
    assert len(fichas) == 1
    item = fichas[0]["exercises"][0]
    assert item["exercise"]["id"] == library["supino-reto"]
    assert (item["target_sets"], item["reps_min"], item["reps_max"], item["rest_seconds"]) == (2, 8, 12, 90)
    assert "Copiada do treino de Ana Souza" in fichas[0]["description"]

    assert client.post(f"/fitness/posts/{created['id']}/copy-workout", headers=carla).status_code == 404
    free = post(client, ana, caption="sem treino")
    assert client.post(f"/fitness/posts/{free['id']}/copy-workout", headers=bruno).status_code == 404
