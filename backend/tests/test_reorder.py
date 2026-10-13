from app.models import Goal, Task


def create_goal(client, headers, title):
    return client.post("/goals/", json={"title": title}, headers=headers).json()


def create_task(client, headers, goal_id, title):
    return client.post(f"/tasks/{goal_id}", json={"title": title}, headers=headers).json()


def goal_titles(client, headers):
    return [g["title"] for g in client.get("/goals/", headers=headers).json()]


def task_titles(client, headers, goal_id):
    return [t["title"] for t in client.get(f"/tasks/goal/{goal_id}", headers=headers).json()]


def test_new_goals_are_appended_in_creation_order(client, auth_headers):
    for title in ["A", "B", "C"]:
        create_goal(client, auth_headers, title)

    assert goal_titles(client, auth_headers) == ["A", "B", "C"]


def test_reorder_goals(client, auth_headers):
    a, b, c = (create_goal(client, auth_headers, t) for t in ["A", "B", "C"])

    resp = client.put("/goals/order", json={"ids": [c["id"], a["id"], b["id"]]}, headers=auth_headers)

    assert resp.status_code == 200
    assert goal_titles(client, auth_headers) == ["C", "A", "B"]


def test_reorder_subset_keeps_other_goals_in_place(client, auth_headers):
    a, b, c, d = (create_goal(client, auth_headers, t) for t in ["A", "B", "C", "D"])

    client.put("/goals/order", json={"ids": [d["id"], b["id"]]}, headers=auth_headers)

    assert goal_titles(client, auth_headers) == ["A", "D", "C", "B"]


def test_reorder_rejects_goals_from_other_users(client, auth_headers, db_session):
    other = Goal(title="Outra", user_id=999)
    db_session.add(other)
    db_session.commit()
    mine = create_goal(client, auth_headers, "Minha")

    resp = client.put("/goals/order", json={"ids": [other.id, mine["id"]]}, headers=auth_headers)

    assert resp.status_code == 400


def test_reorder_rejects_duplicate_ids(client, auth_headers):
    a = create_goal(client, auth_headers, "A")

    resp = client.put("/goals/order", json={"ids": [a["id"], a["id"]]}, headers=auth_headers)

    assert resp.status_code == 400


def test_reorder_tasks(client, auth_headers):
    goal = create_goal(client, auth_headers, "Meta")
    x, y, z = (create_task(client, auth_headers, goal["id"], t) for t in ["X", "Y", "Z"])

    resp = client.put(
        f"/tasks/goal/{goal['id']}/order",
        json={"ids": [z["id"], x["id"], y["id"]]},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert task_titles(client, auth_headers, goal["id"]) == ["Z", "X", "Y"]
    today = [t["title"] for t in client.get("/tasks/today", headers=auth_headers).json()]
    assert today == ["Z", "X", "Y"]


def test_reorder_tasks_rejects_task_from_other_goal(client, auth_headers):
    first = create_goal(client, auth_headers, "Primeira")
    second = create_goal(client, auth_headers, "Segunda")
    x = create_task(client, auth_headers, first["id"], "X")
    y = create_task(client, auth_headers, second["id"], "Y")

    resp = client.put(
        f"/tasks/goal/{first['id']}/order",
        json={"ids": [y["id"], x["id"]]},
        headers=auth_headers,
    )

    assert resp.status_code == 400


def test_reorder_tasks_of_another_users_goal_is_not_found(client, auth_headers, db_session):
    other = Goal(title="Outra", user_id=999)
    db_session.add(other)
    db_session.commit()
    task = Task(title="T", goals_id=other.id)
    db_session.add(task)
    db_session.commit()

    resp = client.put(
        f"/tasks/goal/{other.id}/order", json={"ids": [task.id]}, headers=auth_headers
    )

    assert resp.status_code == 404
