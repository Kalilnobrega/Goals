from tests.test_shared_goals import make_user, headers_for, shared_setup


def test_overview_bundles_goal_page_data(client, auth_headers):
    goal = client.post("/goals/", json={"title": "Ler"}, headers=auth_headers).json()
    client.post(f"/tasks/{goal['id']}", json={"title": "Cap 1"}, headers=auth_headers)
    client.post("/super-goals/", json={"title": "Estudo", "goal_ids": [goal["id"]]}, headers=auth_headers)

    response = client.get(f"/goals/{goal['id']}/overview", headers=auth_headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["goal"]["id"] == goal["id"]
    assert data["goal"]["super_goal_id"] is not None
    assert [t["title"] for t in data["tasks"]] == ["Cap 1"]
    assert data["cycles"] == []
    assert data["entries"] == []
    assert data["progress"] is None
    assert data["group"] is None
    assert [sg["title"] for sg in data["super_goals"]] == ["Estudo"]


def test_overview_includes_progress_for_numeric_goals(client, auth_headers):
    goal = client.post(
        "/goals/", json={"title": "Correr", "target_value": 100, "unit": "km"}, headers=auth_headers
    ).json()
    client.post(f"/goals/{goal['id']}/entries", json={"value": 10}, headers=auth_headers)

    data = client.get(f"/goals/{goal['id']}/overview", headers=auth_headers).json()

    assert data["progress"] == client.get(f"/goals/{goal['id']}/progress", headers=auth_headers).json()
    assert len(data["entries"]) == 1


def test_overview_includes_group_for_shared_goals(client, auth_headers, db_session):
    member_headers = headers_for(make_user(db_session, "Ana"))
    goal_id, group_id, _ = shared_setup(client, auth_headers, member_headers, "collaborative")

    data = client.get(f"/goals/{goal_id}/overview", headers=member_headers).json()

    assert data["group"]["id"] == group_id
    assert data["group"] == client.get(f"/groups/{group_id}", headers=member_headers).json()


def test_overview_hides_goals_of_other_users(client, auth_headers, db_session):
    other_headers = headers_for(make_user(db_session, "Outro"))
    goal = client.post("/goals/", json={"title": "Minha"}, headers=auth_headers).json()

    response = client.get(f"/goals/{goal['id']}/overview", headers=other_headers)

    assert response.status_code == 404
