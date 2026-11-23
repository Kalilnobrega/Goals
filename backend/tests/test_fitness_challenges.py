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
        "friend_requests": 0, "challenge_invites": 0,
    }
    client.post("/fitness/social/friends/requests", json={"username": "bruno"}, headers=ana)
    assert client.get("/fitness/challenges/pending/count", headers=bruno).json() == {"friend_requests": 1, "challenge_invites": 0}
    client.post("/fitness/social/friends/ana/accept", headers=bruno)
    challenge = create(client, ana)
    client.post(f"/fitness/challenges/{challenge['id']}/invites", json={"username": "bruno"}, headers=ana)
    assert client.get("/fitness/challenges/pending/count", headers=bruno).json() == {"friend_requests": 0, "challenge_invites": 1}
    assert client.get("/fitness/challenges/pending/count", headers=ana).json() == {"friend_requests": 0, "challenge_invites": 0}
