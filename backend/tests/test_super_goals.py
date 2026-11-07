from app.models import SuperGoal, SuperGoalItem
from tests.test_shared_goals import make_user, headers_for, shared_setup


def create_goal(client, headers, title="Meta"):
    return client.post("/goals/", json={"title": title}, headers=headers).json()


def create_super_goal(client, headers, title="Vida saudável", goal_ids=()):
    response = client.post(
        "/super-goals/", json={"title": title, "goal_ids": list(goal_ids)}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def super_goal_of(client, headers, goal_id):
    goals = client.get("/goals/", headers=headers).json()
    return next(g["super_goal_id"] for g in goals if g["id"] == goal_id)


def test_create_super_goal_with_goals(client, auth_headers):
    diet = create_goal(client, auth_headers, "Dieta")
    gym = create_goal(client, auth_headers, "Treino")

    sg = create_super_goal(client, auth_headers, goal_ids=[diet["id"], gym["id"]])

    assert sg["title"] == "Vida saudável"
    assert sg["goal_ids"] == [gym["id"], diet["id"]]
    assert super_goal_of(client, auth_headers, diet["id"]) == sg["id"]


def test_title_is_required(client, auth_headers):
    response = client.post("/super-goals/", json={"title": "   "}, headers=auth_headers)

    assert response.status_code == 422


def test_goal_moves_between_super_goals(client, auth_headers):
    goal = create_goal(client, auth_headers)
    first = create_super_goal(client, auth_headers, "Primeira", [goal["id"]])
    second = create_super_goal(client, auth_headers, "Segunda")

    response = client.post(
        f"/super-goals/{second['id']}/goals", json={"goal_ids": [goal["id"]]}, headers=auth_headers
    )

    assert response.json()["goal_ids"] == [goal["id"]]
    assert client.get(f"/super-goals/{first['id']}", headers=auth_headers).json()["goal_ids"] == []
    assert super_goal_of(client, auth_headers, goal["id"]) == second["id"]


def test_adding_goal_already_inside_is_a_no_op(client, auth_headers):
    goal = create_goal(client, auth_headers)
    sg = create_super_goal(client, auth_headers, goal_ids=[goal["id"]])

    response = client.post(
        f"/super-goals/{sg['id']}/goals", json={"goal_ids": [goal["id"]]}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["goal_ids"] == [goal["id"]]


def test_remove_goal_from_super_goal(client, auth_headers):
    goal = create_goal(client, auth_headers)
    sg = create_super_goal(client, auth_headers, goal_ids=[goal["id"]])

    response = client.delete(f"/super-goals/{sg['id']}/goals/{goal['id']}", headers=auth_headers)

    assert response.json()["goal_ids"] == []
    assert super_goal_of(client, auth_headers, goal["id"]) is None


def test_deleting_super_goal_keeps_its_goals(client, auth_headers):
    goal = create_goal(client, auth_headers)
    sg = create_super_goal(client, auth_headers, goal_ids=[goal["id"]])

    client.delete(f"/super-goals/{sg['id']}", headers=auth_headers)

    assert client.get("/super-goals/", headers=auth_headers).json() == []
    assert super_goal_of(client, auth_headers, goal["id"]) is None


def test_deleting_goal_removes_it_from_super_goal(client, auth_headers):
    goal = create_goal(client, auth_headers)
    sg = create_super_goal(client, auth_headers, goal_ids=[goal["id"]])

    client.delete(f"/goals/{goal['id']}", headers=auth_headers)

    assert client.get(f"/super-goals/{sg['id']}", headers=auth_headers).json()["goal_ids"] == []


def test_rename_super_goal(client, auth_headers):
    sg = create_super_goal(client, auth_headers)

    response = client.put(f"/super-goals/{sg['id']}", json={"title": " Casa "}, headers=auth_headers)

    assert response.json()["title"] == "Casa"


def test_new_super_goals_go_on_top_and_can_be_reordered(client, auth_headers):
    a = create_super_goal(client, auth_headers, "A")
    b = create_super_goal(client, auth_headers, "B")

    assert [sg["title"] for sg in client.get("/super-goals/", headers=auth_headers).json()] == ["B", "A"]

    client.put("/super-goals/order", json={"ids": [a["id"], b["id"]]}, headers=auth_headers)

    assert [sg["title"] for sg in client.get("/super-goals/", headers=auth_headers).json()] == ["A", "B"]


def test_cannot_add_goal_of_another_user(client, auth_headers, db_session):
    other_headers = headers_for(make_user(db_session, "Outro"))
    other_goal = create_goal(client, other_headers)
    sg = create_super_goal(client, auth_headers)

    response = client.post(
        f"/super-goals/{sg['id']}/goals", json={"goal_ids": [other_goal["id"]]}, headers=auth_headers
    )

    assert response.status_code == 400


def test_super_goals_are_private(client, auth_headers, db_session):
    other_headers = headers_for(make_user(db_session, "Outro"))
    sg = create_super_goal(client, auth_headers)

    assert client.get(f"/super-goals/{sg['id']}", headers=other_headers).status_code == 404
    assert client.delete(f"/super-goals/{sg['id']}", headers=other_headers).status_code == 404
    assert client.get("/super-goals/", headers=other_headers).json() == []


def test_shared_goal_grouping_is_per_member(client, auth_headers, db_session):
    member_headers = headers_for(make_user(db_session, "Ana"))
    goal_id, _, _ = shared_setup(client, auth_headers, member_headers, "collaborative")

    sg = create_super_goal(client, member_headers, goal_ids=[goal_id])

    assert super_goal_of(client, member_headers, goal_id) == sg["id"]
    assert super_goal_of(client, auth_headers, goal_id) is None


def test_leaving_collaborative_goal_removes_it_from_super_goal(client, auth_headers, db_session):
    ana = make_user(db_session, "Ana")
    member_headers = headers_for(ana)
    goal_id, group_id, _ = shared_setup(client, auth_headers, member_headers, "collaborative")
    sg = create_super_goal(client, member_headers, goal_ids=[goal_id])

    response = client.delete(f"/groups/{group_id}/members/{ana.id}", headers=member_headers)

    assert response.status_code == 200, response.text
    assert client.get(f"/super-goals/{sg['id']}", headers=member_headers).json()["goal_ids"] == []
    assert db_session.query(SuperGoalItem).count() == 0


def test_deleting_account_removes_super_goals(client, auth_headers, db_session):
    member = make_user(db_session, "Ana")
    member_headers = headers_for(member)
    goal_id, _, _ = shared_setup(client, auth_headers, member_headers, "collaborative")
    own = create_goal(client, member_headers)
    create_super_goal(client, member_headers, goal_ids=[goal_id, own["id"]])

    response = client.request("DELETE", "/auth/me", json={}, headers=member_headers)

    assert response.status_code == 200, response.text
    assert db_session.query(SuperGoal).count() == 0
    assert db_session.query(SuperGoalItem).count() == 0
