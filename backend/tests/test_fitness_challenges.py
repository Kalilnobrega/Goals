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


def test_challenge_members_count_as_close_for_friends_only_profiles(client, library, ana, bruno, carla):
    train(client, bruno, library)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False

    challenge = create(client, ana)
    join(client, bruno, challenge)
    profile = client.get("/fitness/social/users/bruno", headers=ana).json()
    assert profile["relation"] == "none"
    assert profile["can_view"] is True and profile["recent_sessions"]
    assert client.get("/fitness/social/users/bruno", headers=carla).json()["can_view"] is False

    client.put("/fitness/profile/visibility", json={"visibility": "private"}, headers=bruno)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False

    client.put("/fitness/profile/visibility", json={"visibility": "friends"}, headers=bruno)
    client.delete(f"/fitness/challenges/{challenge['id']}/members/me", headers=bruno)
    assert client.get("/fitness/social/users/bruno", headers=ana).json()["can_view"] is False
