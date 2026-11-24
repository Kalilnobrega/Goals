from datetime import timedelta
import pytest
from app.dates import today_br
from tests.test_shared_goals import make_user, headers_for
from tests.test_fitness_sessions import library, start, log_set, finish, make_workout  # noqa: F401
from tests.test_fitness_social import social_user, befriend


@pytest.fixture()
def ana(db_session, client):
    return social_user(db_session, client, "Ana Souza", "ana")


@pytest.fixture()
def bruno(db_session, client):
    return social_user(db_session, client, "Bruno Lima", "bruno")


@pytest.fixture()
def carla(db_session, client):
    return social_user(db_session, client, "Carla Dias", "carla")


def payload(**overrides):
    today = today_br()
    data = {
        "name": "Desafio de novembro",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=6)).isoformat(),
        "metrics": [{"key": "workouts"}],
    }
    data.update(overrides)
    return data


def create(client, headers, **overrides):
    response = client.post("/fitness/challenges", json=payload(**overrides), headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def join(client, headers, challenge):
    response = client.post(f"/fitness/challenges/invite/{challenge['invite_code']}/join", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def train(client, headers, library, weight=60, reps=10, both=False):
    workout = make_workout(client, headers, library)
    session = start(client, headers, workout["id"])
    log_set(client, headers, session["exercises"][0]["id"], weight, reps)
    if both:
        log_set(client, headers, session["exercises"][1]["id"], 100, 10)
    assert finish(client, headers, session["id"]).status_code == 200


def test_challenges_require_auth_and_username(client, db_session):
    assert client.get("/fitness/challenges").status_code == 401
    headers = headers_for(make_user(db_session, "Sem Nome"))
    assert client.post("/fitness/challenges", json=payload(), headers=headers).status_code == 409


def test_create_challenge_makes_owner_a_member(client, ana):
    challenge = create(client, ana, description="  Bora  ")
    assert challenge["is_owner"] is True
    assert challenge["status"] == "active"
    assert challenge["days_left"] == 6
    assert challenge["description"] == "Bora"
    assert challenge["member_count"] == 1
    assert challenge["ranking"][0]["username"] == "ana"
    lists = client.get("/fitness/challenges", headers=ana).json()
    assert [c["name"] for c in lists["active"]] == ["Desafio de novembro"]
    assert lists["active"][0]["my_position"] == 1


@pytest.mark.parametrize("overrides", [
    {"name": "   "},
    {"metrics": []},
    {"metrics": [{"key": "workouts"}, {"key": "workouts"}]},
    {"metrics": [{"key": "exercise"}]},
    {"metrics": [{"key": "steps"}]},
    {"min_rule": {"kind": "minutes", "value": 2}},
    {"end_date": (today_br() - timedelta(days=1)).isoformat(), "start_date": (today_br() - timedelta(days=3)).isoformat()},
    {"start_date": (today_br() + timedelta(days=5)).isoformat(), "end_date": (today_br() + timedelta(days=2)).isoformat()},
    {"start_date": (today_br() - timedelta(days=10)).isoformat()},
    {"end_date": (today_br() + timedelta(days=400)).isoformat()},
])
def test_create_challenge_validation(client, ana, overrides):
    assert client.post("/fitness/challenges", json=payload(**overrides), headers=ana).status_code == 422


def test_exercise_metric_must_be_a_default_strength_exercise(client, ana, library, db_session):
    from app.fitness_models import Exercise
    custom = Exercise(user_id=None, name="Esteira", muscle_group="cardio", equipment="machine", tracking="cardio")
    db_session.add(custom)
    db_session.commit()
    bad = payload(metrics=[{"key": "exercise", "exercise_id": custom.id, "measure": "reps"}])
    assert client.post("/fitness/challenges", json=bad, headers=ana).status_code == 422
    good = create(client, ana, metrics=[{"key": "exercise", "exercise_id": library["supino-reto"], "measure": "max_weight"}])
    assert good["metrics"][0]["exercise_name"] == "Supino reto"
    assert good["metrics"][0]["id"] == f"exercise:{library['supino-reto']}:max_weight"


def test_join_by_link_and_preview(client, ana, bruno):
    challenge = create(client, ana)
    preview = client.get(f"/fitness/challenges/invite/{challenge['invite_code']}", headers=bruno).json()
    assert preview["is_member"] is False and preview["owner_name"] == "Ana Souza"
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=bruno).status_code == 404

    joined = join(client, bruno, challenge)
    assert joined["member_count"] == 2 and joined["is_owner"] is False
    assert join(client, bruno, challenge)["member_count"] == 2
    assert client.get("/fitness/challenges/invite/nope", headers=bruno).status_code == 404


def test_single_metric_ranking_shows_raw_values(client, library, ana, bruno, carla):
    challenge = create(client, ana)
    join(client, bruno, challenge)
    join(client, carla, challenge)
    train(client, bruno, library)
    train(client, bruno, library)
    train(client, ana, library)

    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    assert [(r["username"], r["position"], r["score"]) for r in ranking] == [("bruno", 1, 2), ("ana", 2, 1), ("carla", 3, 0)]
    assert ranking[1]["is_me"] is True
    assert ranking[0]["values"] == {"workouts": 2}


def test_ties_share_the_position(client, library, ana, bruno):
    challenge = create(client, ana)
    join(client, bruno, challenge)
    train(client, ana, library)
    train(client, bruno, library)
    positions = [r["position"] for r in client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]]
    assert positions == [1, 1]


def test_multi_metric_uses_points_relative_to_the_leader(client, library, ana, bruno):
    supino = library["supino-reto"]
    challenge = create(client, ana, metrics=[
        {"key": "workouts"},
        {"key": "exercise", "exercise_id": supino, "measure": "max_weight", "weight": 2},
    ])
    join(client, bruno, challenge)
    train(client, ana, library, weight=50)
    train(client, ana, library, weight=50)
    train(client, bruno, library, weight=100)

    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    scores = {r["username"]: r["score"] for r in ranking}
    assert scores["ana"] == 100 + 50 * 2
    assert scores["bruno"] == 50 + 100 * 2
    assert ranking[0]["username"] == "bruno"


def test_minimum_workout_rule(client, library, ana):
    challenge = create(client, ana, min_rule={"kind": "exercises", "value": 2}, metrics=[{"key": "days"}])
    train(client, ana, library)
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 0
    train(client, ana, library, both=True)
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 1


def test_upcoming_challenge_has_no_position(client, ana):
    today = today_br()
    create(client, ana, start_date=(today + timedelta(days=3)).isoformat(), end_date=(today + timedelta(days=10)).isoformat())
    upcoming = client.get("/fitness/challenges", headers=ana).json()["upcoming"]
    assert upcoming[0]["status"] == "upcoming" and upcoming[0]["my_position"] is None


def test_invite_friends_only(client, ana, bruno, carla):
    challenge = create(client, ana)
    url = f"/fitness/challenges/{challenge['id']}/invites"
    assert client.post(url, json={"username": "bruno"}, headers=ana).status_code == 403
    befriend(client, ana, bruno, "bruno", "ana")
    assert client.post(url, json={"username": "bruno"}, headers=ana).status_code == 201

    invites = client.get("/fitness/challenges", headers=bruno).json()["invites"]
    assert [i["name"] for i in invites] == ["Desafio de novembro"]
    joined = client.post(f"/fitness/challenges/{challenge['id']}/join", headers=bruno)
    assert joined.status_code == 200
    assert client.get("/fitness/challenges", headers=bruno).json()["invites"] == []
    assert client.post(url, json={"username": "bruno"}, headers=ana).status_code == 409
    assert client.post(f"/fitness/challenges/{challenge['id']}/join", headers=carla).status_code == 404


def test_decline_invite(client, ana, bruno):
    challenge = create(client, ana)
    befriend(client, ana, bruno, "bruno", "ana")
    client.post(f"/fitness/challenges/{challenge['id']}/invites", json={"username": "bruno"}, headers=ana)
    assert client.delete(f"/fitness/challenges/{challenge['id']}/invites/me", headers=bruno).status_code == 204
    assert client.get("/fitness/challenges", headers=bruno).json()["invites"] == []


def test_leave_remove_and_delete(client, ana, bruno, carla):
    challenge = create(client, ana)
    join(client, bruno, challenge)
    join(client, carla, challenge)
    cid = challenge["id"]

    assert client.delete(f"/fitness/challenges/{cid}/members/me", headers=ana).status_code == 409
    assert client.delete(f"/fitness/challenges/{cid}/members/me", headers=bruno).status_code == 204
    assert client.get(f"/fitness/challenges/{cid}", headers=bruno).status_code == 404

    assert client.delete(f"/fitness/challenges/{cid}/members/ana", headers=carla).status_code == 403
    assert client.delete(f"/fitness/challenges/{cid}/members/carla", headers=ana).status_code == 204
    assert client.get(f"/fitness/challenges/{cid}", headers=ana).json()["member_count"] == 1

    assert client.delete(f"/fitness/challenges/{cid}", headers=ana).status_code == 204
    assert client.get(f"/fitness/challenges/{cid}", headers=ana).status_code == 404


def test_private_profiles_still_show_name_and_score(client, library, ana, bruno):
    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    challenge = create(client, ana)
    join(client, bruno, challenge)
    train(client, bruno, library)
    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    assert ranking[0]["name"] == "Bruno Lima" and ranking[0]["score"] == 1


def test_pending_count(client, db_session, ana, bruno):
    assert client.get("/fitness/challenges/pending/count", headers=headers_for(make_user(db_session, "Sem Nome"))).json() == {
        "friend_requests": 0, "challenge_invites": 0, "notifications": 0,
    }
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert client.get("/fitness/challenges/pending/count", headers=bruno).json() == {"friend_requests": 1, "challenge_invites": 0, "notifications": 1}
    client.post("/fitness/social/friends/ana/accept", headers=bruno)
    challenge = create(client, ana)
    client.post(f"/fitness/challenges/{challenge['id']}/invites", json={"username": "bruno"}, headers=ana)
    pending = client.get("/fitness/challenges/pending/count", headers=bruno).json()
    assert pending["friend_requests"] == 0 and pending["challenge_invites"] == 1
    assert client.get("/fitness/challenges/pending/count", headers=ana).json()["challenge_invites"] == 0


def test_exercise_metric_can_count_the_whole_family(client, ana, db_session):
    from app.fitness_models import Exercise
    barra = Exercise(slug="supino-barra", name="Supino com barra", muscle_group="chest", equipment="barbell", family="Supino")
    halter = Exercise(slug="supino-halter", name="Supino com halteres", muscle_group="chest", equipment="dumbbell", family="Supino")
    solo = Exercise(slug="crucifixo", name="Crucifixo", muscle_group="chest", equipment="dumbbell")
    db_session.add_all([barra, halter, solo])
    db_session.commit()

    workout = client.post("/fitness/workouts", json={"name": "Peito", "exercises": [
        {"exercise_id": barra.id, "target_sets": 1, "reps_min": 8},
        {"exercise_id": halter.id, "target_sets": 1, "reps_min": 8},
    ]}, headers=ana).json()
    session = start(client, ana, workout["id"])
    log_set(client, ana, session["exercises"][0]["id"], 60, 10)
    log_set(client, ana, session["exercises"][1]["id"], 30, 12)
    assert finish(client, ana, session["id"]).status_code == 200

    challenge = create(client, ana, metrics=[
        {"key": "exercise", "exercise_id": barra.id, "measure": "reps"},
        {"key": "exercise", "exercise_id": barra.id, "measure": "reps", "scope": "family"},
    ])
    exact_id = f"exercise:{barra.id}:reps"
    family_id = f"exercise:{barra.id}:reps:family"
    assert [m["id"] for m in challenge["metrics"]] == [exact_id, family_id]
    assert challenge["metrics"][1]["family"] == "Supino"
    values = challenge["ranking"][0]["values"]
    assert values[exact_id] == 10
    assert values[family_id] == 22

    bad = payload(metrics=[{"key": "exercise", "exercise_id": solo.id, "measure": "reps", "scope": "family"}])
    assert client.post("/fitness/challenges", json=bad, headers=ana).status_code == 422


def test_records_metric_counts_load_records_inside_the_challenge(client, library, ana, db_session):
    from app.fitness_models import WorkoutSession
    train(client, ana, library, weight=80)
    old = db_session.query(WorkoutSession).one()
    old.started_at = old.started_at - timedelta(days=20)
    old.completed_at = old.completed_at - timedelta(days=20)
    db_session.commit()

    challenge = create(client, ana, metrics=[{"key": "records"}])
    train(client, ana, library, weight=70)
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 0
    train(client, ana, library, weight=85)
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 1


def test_plan_metric_uses_each_members_own_plan(client, library, ana, bruno):
    today = today_br()
    workout = make_workout(client, ana, library)
    plan = client.post("/fitness/plans", json={"name": "Plano", "days": [{"weekday": today.weekday(), "workout_id": workout["id"]}]}, headers=ana)
    assert plan.status_code == 200, plan.text
    challenge = create(client, ana, metrics=[{"key": "plan"}])
    join(client, bruno, challenge)
    train(client, ana, library)
    train(client, bruno, library)
    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    scores = {r["username"]: r["score"] for r in ranking}
    assert scores == {"ana": 100, "bruno": 0}


def test_muscle_metric_counts_sets_by_role(client, ana, db_session):
    from app.fitness_models import Exercise, ExerciseMuscle
    supino = Exercise(slug="supino-m", name="Supino M", muscle_group="chest", equipment="barbell")
    leg = Exercise(slug="leg-m", name="Leg M", muscle_group="quads", equipment="machine")
    db_session.add_all([supino, leg])
    db_session.flush()
    db_session.add_all([
        ExerciseMuscle(exercise_id=supino.id, muscle="chest_mid", role="primary"),
        ExerciseMuscle(exercise_id=supino.id, muscle="triceps_long", role="secondary"),
    ])
    db_session.commit()
    workout = client.post("/fitness/workouts", json={"name": "A", "exercises": [
        {"exercise_id": supino.id, "target_sets": 2, "reps_min": 8},
        {"exercise_id": leg.id, "target_sets": 1, "reps_min": 8},
    ]}, headers=ana).json()
    session = start(client, ana, workout["id"])
    log_set(client, ana, session["exercises"][0]["id"], 60, 10)
    log_set(client, ana, session["exercises"][0]["id"], 60, 8)
    log_set(client, ana, session["exercises"][1]["id"], 100, 10)
    assert finish(client, ana, session["id"]).status_code == 200

    challenge = create(client, ana, metrics=[
        {"key": "muscle", "muscle_group": "chest"},
        {"key": "muscle", "muscle_group": "triceps"},
        {"key": "muscle", "muscle_group": "quads"},
    ])
    values = challenge["ranking"][0]["values"]
    assert values == {"muscle:chest": 2, "muscle:triceps": 1, "muscle:quads": 1}

    bad = payload(metrics=[{"key": "muscle"}])
    assert client.post("/fitness/challenges", json=bad, headers=ana).status_code == 422
    cardio = payload(metrics=[{"key": "muscle", "muscle_group": "cardio"}])
    assert client.post("/fitness/challenges", json=cardio, headers=ana).status_code == 422


def weigh(client, headers, day, kg):
    response = client.post("/fitness/body-weight", json={"weight_kg": kg, "measured_on": day.isoformat()}, headers=headers)
    assert response.status_code == 200, response.text


def backdate_sessions(db_session, days):
    from app.fitness_models import WorkoutSession
    for session in db_session.query(WorkoutSession).all():
        session.started_at -= timedelta(days=days)
        session.completed_at -= timedelta(days=days)
    db_session.commit()


def test_weight_metrics_require_consent(client, ana, bruno):
    body = payload(metrics=[{"key": "body_weight"}])
    response = client.post("/fitness/challenges", json=body, headers=ana)
    assert response.status_code == 422
    challenge = create(client, ana, metrics=[{"key": "body_weight"}], accept_weight=True)
    assert challenge["uses_weight"] is True and challenge["metrics"][0]["direction"] == "lose"

    url = f"/fitness/challenges/invite/{challenge['invite_code']}/join"
    assert client.post(url, headers=bruno).status_code == 422
    assert client.post(url, json={"accept_weight": True}, headers=bruno).status_code == 200


def test_progress_metric_in_percent_and_kg(client, library, ana, bruno, db_session):
    supino = library["supino-reto"]
    train(client, ana, library, weight=100, reps=1)
    backdate_sessions(db_session, 20)
    challenge = create(client, ana, metrics=[
        {"key": "progress", "exercise_id": supino, "unit": "pct"},
        {"key": "progress", "exercise_id": supino, "unit": "kg"},
    ])
    join(client, bruno, challenge)
    train(client, ana, library, weight=110, reps=1)
    train(client, bruno, library, weight=50, reps=1)
    train(client, bruno, library, weight=60, reps=1)

    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    by_user = {r["username"]: r for r in ranking}
    pct, kg = f"progress:{supino}:pct", f"progress:{supino}:kg"
    assert by_user["ana"]["values"] == {pct: 10.0, kg: 10.0}
    assert by_user["ana"]["details"][pct] == {"start_kg": 100.0, "best_kg": 110.0}
    assert by_user["bruno"]["values"] == {pct: 20.0, kg: 10.0}


def test_progress_never_goes_negative(client, library, ana, db_session):
    train(client, ana, library, weight=100, reps=1)
    backdate_sessions(db_session, 20)
    challenge = create(client, ana, metrics=[{"key": "progress", "exercise_id": library["supino-reto"]}])
    train(client, ana, library, weight=80, reps=1)
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 0


def test_body_weight_metric_lose_and_gain(client, ana, bruno):
    today = today_br()
    weigh(client, ana, today - timedelta(days=3), 80)
    weigh(client, ana, today, 78)
    challenge = create(client, ana, metrics=[{"key": "body_weight", "direction": "lose"}], accept_weight=True,
                       start_date=(today - timedelta(days=2)).isoformat())
    client.post(f"/fitness/challenges/invite/{challenge['invite_code']}/join", json={"accept_weight": True}, headers=bruno)

    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=bruno).json()["ranking"]
    ana_row = next(r for r in ranking if r["username"] == "ana")
    bruno_row = next(r for r in ranking if r["username"] == "bruno")
    assert ana_row["score"] == 2.5
    assert ana_row["details"]["body_weight:lose"] == {"start_kg": 80.0, "current_kg": 78.0, "delta_kg": -2.0}
    assert bruno_row["missing"] == ["body_weight:lose"]

    gain = create(client, ana, metrics=[{"key": "body_weight", "direction": "gain"}], accept_weight=True,
                  start_date=(today - timedelta(days=2)).isoformat())
    assert gain["ranking"][0]["score"] == 0


def test_hidden_weight_shows_only_the_percentage_to_others(client, ana, bruno):
    today = today_br()
    weigh(client, ana, today - timedelta(days=3), 80)
    weigh(client, ana, today, 78)
    challenge = create(client, ana, metrics=[{"key": "body_weight"}], accept_weight=True, hide_weight=True,
                       start_date=(today - timedelta(days=2)).isoformat())
    assert challenge["hide_weight"] is True
    client.post(f"/fitness/challenges/invite/{challenge['invite_code']}/join", json={"accept_weight": True}, headers=bruno)

    seen_by_bruno = next(r for r in client.get(f"/fitness/challenges/{challenge['id']}", headers=bruno).json()["ranking"] if r["username"] == "ana")
    assert seen_by_bruno["score"] == 2.5 and seen_by_bruno["details"] == {}
    seen_by_ana = next(r for r in client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"] if r["username"] == "ana")
    assert seen_by_ana["details"]["body_weight:lose"]["current_kg"] == 78.0


def test_hide_weight_is_ignored_without_weight_metrics(client, ana):
    assert create(client, ana, hide_weight=True)["hide_weight"] is False


def test_relative_strength_metric(client, library, ana, bruno):
    supino = library["supino-reto"]
    today = today_br()
    weigh(client, ana, today, 80)
    challenge = create(client, ana, metrics=[{"key": "relative_strength", "exercise_id": supino}], accept_weight=True, hide_weight=True)
    client.post(f"/fitness/challenges/invite/{challenge['invite_code']}/join", json={"accept_weight": True}, headers=bruno)
    train(client, ana, library, weight=100, reps=5)
    train(client, bruno, library, weight=120, reps=5)

    ranking = client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"]
    ana_row = next(r for r in ranking if r["username"] == "ana")
    bruno_row = next(r for r in ranking if r["username"] == "bruno")
    key = f"strength:{supino}"
    assert ana_row["score"] == 1.25
    assert ana_row["details"][key] == {"load_kg": 100.0, "body_kg": 80.0}
    assert bruno_row["score"] == 0 and bruno_row["missing"] == [key]
    assert ranking[0]["username"] == "ana"

    activity = client.get(f"/fitness/challenges/{challenge['id']}/activity", headers=bruno).json()["items"]
    ana_item = next(item for item in activity if item["author"]["username"] == "ana")
    assert ana_item["volume_kg"] == 0
    seen = client.get(f"/fitness/challenges/{challenge['id']}/sessions/{ana_item['session_id']}", headers=bruno).json()
    assert all(e["exercise_id"] != supino for e in seen["session"]["exercises"])
    assert seen["session"]["volume_kg"] == 0 and seen["records"] == []
    own = client.get(f"/fitness/challenges/{challenge['id']}/sessions/{ana_item['session_id']}", headers=ana).json()
    assert own["session"]["exercises"][0]["sets"][0]["weight_kg"] == 100


def test_challenge_members_count_as_close_for_friends_only_profiles(client, library, ana, bruno, carla):
    train(client, bruno, library)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False

    challenge = create(client, ana)
    join(client, bruno, challenge)
    profile = client.get("/fitness/social/users/bruno", headers=ana).json()
    assert profile["relation"] == "none"
    assert profile["can_view"] is True and profile["recent_sessions"]
    assert client.get("/fitness/social/users/bruno", headers=carla).json()["can_view"] is False

    assert client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana).status_code == 200
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is True
    assert client.get("/fitness/social/users/ana", headers=bruno).json()["can_view"] is True

    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False

    client.put("/fitness/profile/visibility", json={"visibility": "friends"}, headers=bruno)
    client.delete(f"/fitness/challenges/{challenge['id']}/members/me", headers=bruno)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False


JPEG = b"\xff\xd8\xff\xe0" + b"0" * 200


@pytest.fixture()
def media_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("FITNESS_MEDIA_DIR", str(tmp_path))
    monkeypatch.delenv("MEDIA_BUCKET", raising=False)
    return tmp_path


def checkin(client, headers, minutes=40, activity="Corrida", photo=True, **extra):
    ids = []
    if photo:
        ids.append(client.post("/fitness/media", files={"file": ("f.jpg", JPEG, "image/jpeg")}, headers=headers).json()["id"])
    return client.post("/fitness/posts", json={"activity": activity, "minutes": minutes, "media_ids": ids, **extra}, headers=headers)


def test_checkin_requires_photo_activity_and_recent_date(client, ana, media_dir):
    assert checkin(client, ana, photo=False).status_code == 422
    assert checkin(client, ana, activity=None).status_code == 422
    old = (today_br() - timedelta(days=10)).isoformat()
    assert checkin(client, ana, performed_on=old).status_code == 422
    created = checkin(client, ana)
    assert created.status_code == 200 and created.json()["minutes"] == 40


def test_checkins_count_only_when_the_challenge_allows(client, library, ana, bruno, media_dir):
    closed = create(client, ana, metrics=[{"key": "days"}, {"key": "minutes"}])
    open_challenge = create(client, ana, metrics=[{"key": "days"}, {"key": "minutes"}], allow_manual=True)
    assert open_challenge["allow_manual"] is True
    checkin(client, ana, minutes=45)

    open_row = client.get(f"/fitness/challenges/{open_challenge['id']}", headers=ana).json()["ranking"][0]
    assert open_row["values"] == {"days": 1, "minutes": 45}
    closed_row = client.get(f"/fitness/challenges/{closed['id']}", headers=ana).json()["ranking"][0]
    assert closed_row["values"] == {"days": 0, "minutes": 0}


def test_checkins_respect_minimum_minutes_but_not_exercise_count(client, ana, media_dir):
    by_minutes = create(client, ana, metrics=[{"key": "workouts"}], allow_manual=True, min_rule={"kind": "minutes", "value": 30})
    by_exercises = create(client, ana, metrics=[{"key": "workouts"}], allow_manual=True, min_rule={"kind": "exercises", "value": 3})
    checkin(client, ana, minutes=20)
    assert client.get(f"/fitness/challenges/{by_minutes['id']}", headers=ana).json()["ranking"][0]["score"] == 0
    assert client.get(f"/fitness/challenges/{by_exercises['id']}", headers=ana).json()["ranking"][0]["score"] == 1


def test_challenge_activity_shows_members_workouts_and_checkins(client, library, ana, bruno, carla, media_dir):
    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    challenge = create(client, ana, allow_manual=True, min_rule={"kind": "exercises", "value": 2})
    join(client, bruno, challenge)
    train(client, bruno, library)
    checkin(client, ana, minutes=30, caption="corridinha")
    train(client, carla, library)

    activity = client.get(f"/fitness/challenges/{challenge['id']}/activity", headers=ana).json()
    kinds = [(item["kind"], item["author"]["username"], item["counts"]) for item in activity["items"]]
    assert ("workout", "bruno", False) in kinds
    assert ("checkin", "ana", True) in kinds
    assert all(username != "carla" for _, username, _ in kinds)
    checkin_item = next(item for item in activity["items"] if item["kind"] == "checkin")
    assert checkin_item["name"] == "Corrida" and checkin_item["caption"] == "corridinha" and len(checkin_item["media"]) == 1

    workout_item = next(item for item in activity["items"] if item["kind"] == "workout")
    detail = client.get(f"/fitness/challenges/{challenge['id']}/sessions/{workout_item['session_id']}", headers=ana)
    assert detail.status_code == 200 and detail.json()["author"]["username"] == "bruno"
    assert client.get(f"/fitness/challenges/{challenge['id']}/activity", headers=carla).status_code == 404
    assert client.get(f"/fitness/challenges/{challenge['id']}/sessions/{workout_item['session_id']}", headers=carla).status_code == 404


def test_challenge_chat_messages_and_unread(client, ana, bruno, carla):
    challenge = create(client, ana)
    join(client, bruno, challenge)
    cid = challenge["id"]
    sent = client.post(f"/fitness/challenges/{cid}/chat", json={"text": "  bora galera  "}, headers=ana)
    assert sent.status_code == 200 and sent.json()["text"] == "bora galera"
    assert client.post(f"/fitness/challenges/{cid}/chat", json={"text": "   "}, headers=ana).status_code == 422
    assert client.post(f"/fitness/challenges/{cid}/chat", json={"text": "oi"}, headers=carla).status_code == 404

    chat = client.get(f"/fitness/challenges/{cid}/chat", headers=bruno).json()
    assert [(i["kind"], i["author"]["username"], i["text"]) for i in chat["items"]] == [("message", "ana", "bora galera")]
    assert chat["unread"] == 1
    assert client.get(f"/fitness/challenges/{cid}", headers=bruno).json()["chat_unread"] == 1
    assert client.get("/fitness/challenges", headers=bruno).json()["active"][0]["chat_unread"] == 1
    client.post(f"/fitness/challenges/{cid}/chat/read", headers=bruno)
    assert client.get(f"/fitness/challenges/{cid}", headers=bruno).json()["chat_unread"] == 0
    assert client.get(f"/fitness/challenges/{cid}", headers=ana).json()["chat_unread"] == 0

    reply = client.post(f"/fitness/challenges/{cid}/chat", json={"text": "partiu"}, headers=bruno).json()
    assert client.delete(f"/fitness/challenges/{cid}/chat/{reply['message_id']}", headers=carla).status_code == 404
    assert client.delete(f"/fitness/challenges/{cid}/chat/{reply['message_id']}", headers=ana).status_code == 204
    assert [i["text"] for i in client.get(f"/fitness/challenges/{cid}/chat", headers=ana).json()["items"]] == ["bora galera"]


def test_comments_on_challenge_posts_show_in_chat(client, library, ana, bruno, media_dir):
    befriend(client, ana, bruno, "bruno", "ana")
    challenge = create(client, ana, allow_manual=True)
    join(client, bruno, challenge)
    cid = challenge["id"]
    created = checkin(client, bruno, minutes=30).json()
    client.post(f"/fitness/posts/{created['id']}/comments", json={"text": "boa corrida!"}, headers=ana)
    outside = client.post("/fitness/posts", json={"caption": "fora do desafio"}, headers=bruno).json()
    client.post(f"/fitness/posts/{outside['id']}/comments", json={"text": "não aparece"}, headers=ana)

    items = client.get(f"/fitness/challenges/{cid}/chat", headers=bruno).json()["items"]
    assert [(i["kind"], i["text"]) for i in items] == [("comment", "boa corrida!")]
    ref = items[0]["post"]
    assert ref == {"post_id": created["id"], "kind": "checkin", "label": "Corrida", "owner_name": "Bruno Lima", "day": today_br().isoformat()}
    assert items[0]["can_delete"] is False


def test_private_member_post_content_stays_out_of_the_challenge(client, library, ana, bruno, media_dir):
    challenge = create(client, ana, allow_manual=True)
    join(client, bruno, challenge)
    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    created = checkin(client, bruno, minutes=30, caption="legenda privada").json()
    client.post(f"/fitness/posts/{created['id']}/comments", json={"text": "meu comentário"}, headers=bruno)

    items = client.get(f"/fitness/challenges/{challenge['id']}/activity", headers=ana).json()["items"]
    bruno_item = next(item for item in items if item["author"]["username"] == "bruno")
    assert bruno_item["counts"] is True and bruno_item["id"] == f"c{created['id']}"
    assert bruno_item["post_id"] is None and bruno_item["caption"] is None and bruno_item["media"] == []
    assert client.get(f"/fitness/challenges/{challenge['id']}/chat", headers=ana).json()["items"] == []
    own = next(item for item in client.get(f"/fitness/challenges/{challenge['id']}/activity", headers=bruno).json()["items"])
    assert own["caption"] == "legenda privada"


def test_blocks_keep_people_out_of_challenges_and_chat(client, ana, bruno, carla):
    challenge = create(client, ana)
    client.post("/fitness/social/blocks/bruno", headers=ana)
    assert client.post(f"/fitness/challenges/invite/{challenge['invite_code']}/join", headers=bruno).status_code == 404

    join(client, carla, challenge)
    client.post("/fitness/social/blocks/carla", headers=ana)
    cid = challenge["id"]
    client.post(f"/fitness/challenges/{cid}/chat", json={"text": "oi"}, headers=carla)
    chat = client.get(f"/fitness/challenges/{cid}/chat", headers=ana).json()
    assert chat["items"] == [] and chat["unread"] == 0
    assert client.get(f"/fitness/challenges/{cid}/chat", headers=carla).json()["unread"] == 0


def test_activity_pages_stay_stable_when_new_items_arrive(client, ana, bruno, media_dir):
    challenge = create(client, ana, allow_manual=True)
    join(client, bruno, challenge)
    for _ in range(21):
        assert checkin(client, ana, minutes=30).status_code == 200
    url = f"/fitness/challenges/{challenge['id']}/activity"
    first = client.get(url, headers=ana).json()
    assert len(first["items"]) == 20 and first["next_before"]
    checkin(client, bruno, minutes=30)
    second = client.get(url, params={"before": first["next_before"]}, headers=ana).json()
    ids = [item["id"] for item in first["items"] + second["items"]]
    assert len(ids) == len(set(ids)) == 21 and second["next_before"] is None
    assert client.get(url, params={"before": "lixo"}, headers=ana).status_code == 422


def test_finished_plan_challenge_counts_a_skipped_last_day(monkeypatch):
    from types import SimpleNamespace
    from app.routers import fitness_challenges
    today = today_br()
    start, end = today - timedelta(days=10), today - timedelta(days=6)
    plan = SimpleNamespace(created_at=None, days=[SimpleNamespace(weekday=w) for w in range(7)])
    monkeypatch.setattr(fitness_challenges, "active_plan", lambda user, db: plan)
    challenge = SimpleNamespace(start_date=start, end_date=end)
    trained = [{"day": start + timedelta(days=n)} for n in range(4)]
    assert fitness_challenges.plan_pct(None, None, trained, challenge) == 80
    every = trained + [{"day": end}]
    assert fitness_challenges.plan_pct(None, None, every, challenge) == 100


def test_removed_member_cannot_rejoin_until_the_owner_invites_again(client, ana, bruno, carla):
    befriend(client, ana, bruno, "bruno", "ana")
    befriend(client, carla, bruno, "bruno", "carla")
    challenge = create(client, ana)
    join(client, bruno, challenge)
    join(client, carla, challenge)
    cid = challenge["id"]
    assert client.delete(f"/fitness/challenges/{cid}/members/bruno", headers=ana).status_code == 204
    url = f"/fitness/challenges/invite/{challenge['invite_code']}/join"
    assert client.post(url, headers=bruno).status_code == 403
    assert client.post(f"/fitness/challenges/{cid}/invites", json={"username": "bruno"}, headers=carla).status_code == 409
    assert client.post(f"/fitness/challenges/{cid}/invites", json={"username": "bruno"}, headers=ana).status_code == 201
    assert client.post(url, headers=bruno).status_code == 200


def test_finished_challenge_freezes_ranking_notifies_and_closes_chat_later(client, library, ana, bruno, monkeypatch):
    from app.routers import fitness_challenges
    challenge = create(client, ana)
    join(client, bruno, challenge)
    train(client, ana, library)
    train(client, ana, library)
    train(client, bruno, library)
    cid = challenge["id"]
    real_today = today_br()

    monkeypatch.setattr(fitness_challenges, "today_br", lambda: real_today + timedelta(days=8))
    assert client.get("/fitness/challenges/pending/count", headers=bruno).json()["notifications"] >= 1
    notes = [n for n in client.get("/fitness/notifications", headers=bruno).json()["notifications"] if n["kind"] == "challenge_finished"]
    assert len(notes) == 1 and notes[0]["detail"] == "2" and notes[0]["challenge_name"] == challenge["name"]
    winner = [n for n in client.get("/fitness/notifications", headers=ana).json()["notifications"] if n["kind"] == "challenge_finished"]
    assert len(winner) == 1 and winner[0]["detail"] == "1"

    sessions = client.get("/fitness/sessions", headers=ana).json()["items"]
    for item in sessions:
        client.delete(f"/fitness/sessions/{item['id']}", headers=ana)
    ranking = client.get(f"/fitness/challenges/{cid}", headers=bruno).json()["ranking"]
    assert [(r["username"], r["score"], r["is_me"]) for r in ranking] == [("ana", 2, False), ("bruno", 1, True)]
    client.get("/fitness/challenges", headers=ana)
    assert len([n for n in client.get("/fitness/notifications", headers=ana).json()["notifications"] if n["kind"] == "challenge_finished"]) == 1

    assert client.get(f"/fitness/challenges/{cid}", headers=ana).json()["chat_open"] is True
    assert client.post(f"/fitness/challenges/{cid}/chat", json={"text": "gg"}, headers=ana).status_code == 200
    monkeypatch.setattr(fitness_challenges, "today_br", lambda: real_today + timedelta(days=14))
    assert client.get(f"/fitness/challenges/{cid}", headers=ana).json()["chat_open"] is False
    assert client.post(f"/fitness/challenges/{cid}/chat", json={"text": "oi"}, headers=ana).status_code == 409
    assert [i["text"] for i in client.get(f"/fitness/challenges/{cid}/chat", headers=bruno).json()["items"]] == ["gg"]


def test_old_finished_challenges_freeze_without_notifying(client, library, ana, monkeypatch):
    from app.routers import fitness_challenges
    challenge = create(client, ana)
    train(client, ana, library)
    real_today = today_br()
    monkeypatch.setattr(fitness_challenges, "today_br", lambda: real_today + timedelta(days=40))
    assert client.get(f"/fitness/challenges/{challenge['id']}", headers=ana).json()["ranking"][0]["score"] == 1
    assert all(n["kind"] != "challenge_finished" for n in client.get("/fitness/notifications", headers=ana).json()["notifications"])


def test_deleting_a_challenge_notifies_the_other_members(client, ana, bruno, carla):
    challenge = create(client, ana, name="Desafio de verão com um nome bem comprido")
    join(client, bruno, challenge)
    join(client, carla, challenge)
    assert client.delete(f"/fitness/challenges/{challenge['id']}", headers=ana).status_code == 204
    for headers in (bruno, carla):
        notes = [n for n in client.get("/fitness/notifications", headers=headers).json()["notifications"] if n["kind"] == "challenge_deleted"]
        assert len(notes) == 1 and notes[0]["detail"] == "Desafio de verão com um nome bem comprido"
        assert notes[0]["actor"]["username"] == "ana"
    assert all(n["kind"] != "challenge_deleted" for n in client.get("/fitness/notifications", headers=ana).json()["notifications"])
