from datetime import datetime, timedelta, timezone

import pytest

from app.models import User, Streak, Goal, GroupInvite, TaskCompletion, GoalEntry
from app.routers.auth import create_token
from app.access import MEMBER_LIMIT


def make_user(db_session, name):
    user = User(
        name=name,
        email=f"{name.lower()}@example.com",
        password="google_oauth_account",
        is_verify=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def headers_for(user):
    return {"Authorization": f"Bearer {create_token(user.id)}"}


@pytest.fixture()
def ana(db_session):
    user = make_user(db_session, "Ana")
    return user, headers_for(user)


@pytest.fixture()
def bruno(db_session):
    user = make_user(db_session, "Bruno")
    return user, headers_for(user)


def create_goal(client, headers, **extra):
    response = client.post("/goals/", json={"title": "Correr", **extra}, headers=headers)
    assert response.status_code == 200
    return response.json()


def create_task(client, headers, goal_id, title="Treino"):
    response = client.post(f"/tasks/{goal_id}", json={"title": title}, headers=headers)
    assert response.status_code == 200
    return response.json()


def share(client, headers, goal_id, kind):
    response = client.post("/groups/", json={"goal_id": goal_id, "kind": kind}, headers=headers)
    assert response.status_code == 200
    return response.json()


def invite(client, headers, group_id):
    response = client.post(f"/groups/{group_id}/invites", headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def join(client, headers, token):
    response = client.post(f"/groups/invites/{token}/accept", headers=headers)
    assert response.status_code == 200
    return response.json()["goal_id"]


def shared_setup(client, auth_headers, member_headers, kind, tasks=1):
    goal = create_goal(client, auth_headers)
    for index in range(tasks):
        create_task(client, auth_headers, goal["id"], f"Tarefa {index}")
    group = share(client, auth_headers, goal["id"], kind)
    member_goal_id = join(client, member_headers, invite(client, auth_headers, group["id"]))
    return goal["id"], group["id"], member_goal_id


def test_sharing_marks_creator_as_leader(client, auth_headers):
    goal = create_goal(client, auth_headers)

    group = share(client, auth_headers, goal["id"], "collaborative")

    assert group["my_role"] == "leader"
    assert group["goal_id"] == goal["id"]
    detail = client.get(f"/goals/{goal['id']}", headers=auth_headers).json()
    assert detail["group_id"] == group["id"]
    assert detail["group_kind"] == "collaborative"
    assert detail["can_edit"] and detail["can_delete"]


def test_cannot_share_twice(client, auth_headers):
    goal = create_goal(client, auth_headers)
    share(client, auth_headers, goal["id"], "collaborative")

    response = client.post(
        "/groups/", json={"goal_id": goal["id"], "kind": "challenge"}, headers=auth_headers
    )

    assert response.status_code == 400


def test_collaborative_member_sees_goal_and_can_check_tasks(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, member_goal_id = shared_setup(client, auth_headers, ana_headers, "collaborative")

    assert member_goal_id == goal_id
    goals = client.get("/goals/", headers=ana_headers).json()
    assert [g["id"] for g in goals] == [goal_id]
    assert goals[0]["can_act"] and not goals[0]["can_edit"]

    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]
    response = client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)

    assert response.status_code == 200
    tasks = client.get(f"/tasks/goal/{goal_id}", headers=auth_headers).json()
    assert tasks[0]["status"] is True
    assert tasks[0]["completed_by"] == "Ana"


def test_collaborative_streak_goes_to_who_did_it(client, db_session, user, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]

    client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)

    assert db_session.query(Streak).filter_by(user_id=ana_user.id).one().current_streak == 1
    assert db_session.query(Streak).filter_by(user_id=user.id).first() is None


def test_unchecking_undoes_streak_of_who_checked(client, db_session, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]

    client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    assert db_session.query(Streak).filter_by(user_id=ana_user.id).one().current_streak == 0


def test_collaborative_member_cannot_edit(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]

    assert client.put(f"/goals/{goal_id}", json={"title": "X"}, headers=ana_headers).status_code == 403
    assert client.post(f"/tasks/{goal_id}", json={"title": "X"}, headers=ana_headers).status_code == 403
    assert client.put(f"/tasks/{task['id']}", json={"title": "X"}, headers=ana_headers).status_code == 403
    assert client.delete(f"/tasks/{task['id']}", headers=ana_headers).status_code == 403
    assert client.delete(f"/goals/{goal_id}", headers=ana_headers).status_code == 403
    assert client.put(f"/goals/{goal_id}", json={"status": "completed"}, headers=ana_headers).status_code == 403
    assert client.post(f"/groups/{goal_id}/invites", headers=ana_headers).status_code == 403


def test_moderator_can_edit_but_not_delete(client, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    response = client.patch(
        f"/groups/{group_id}/members/{ana_user.id}", json={"role": "moderator"}, headers=auth_headers
    )
    assert response.status_code == 200

    assert client.put(f"/goals/{goal_id}", json={"title": "Novo"}, headers=ana_headers).status_code == 200
    assert client.post(f"/tasks/{goal_id}", json={"title": "Nova"}, headers=ana_headers).status_code == 200
    assert client.post(f"/groups/{group_id}/invites", headers=ana_headers).status_code == 200
    assert client.delete(f"/goals/{goal_id}", headers=ana_headers).status_code == 403


def test_only_leader_changes_roles(client, auth_headers, ana, bruno):
    ana_user, ana_headers = ana
    bruno_user, bruno_headers = bruno
    _, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    join(client, bruno_headers, invite(client, auth_headers, group_id))
    client.patch(f"/groups/{group_id}/members/{ana_user.id}", json={"role": "moderator"}, headers=auth_headers)

    response = client.patch(
        f"/groups/{group_id}/members/{bruno_user.id}", json={"role": "moderator"}, headers=ana_headers
    )

    assert response.status_code == 403


def test_moderator_removes_members_but_not_moderators(client, user, auth_headers, ana, bruno):
    ana_user, ana_headers = ana
    bruno_user, bruno_headers = bruno
    _, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    join(client, bruno_headers, invite(client, auth_headers, group_id))
    client.patch(f"/groups/{group_id}/members/{ana_user.id}", json={"role": "moderator"}, headers=auth_headers)

    assert client.delete(f"/groups/{group_id}/members/{user.id}", headers=ana_headers).status_code == 403
    assert client.delete(f"/groups/{group_id}/members/{bruno_user.id}", headers=ana_headers).status_code == 200
    assert client.get("/goals/", headers=bruno_headers).json() == []


def test_leader_cannot_be_demoted(client, user, auth_headers, ana):
    _, ana_headers = ana
    _, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    response = client.patch(
        f"/groups/{group_id}/members/{user.id}", json={"role": "member"}, headers=auth_headers
    )

    assert response.status_code == 400


def test_transfer_leadership(client, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    response = client.post(f"/groups/{group_id}/transfer", json={"user_id": ana_user.id}, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["my_role"] == "moderator"
    detail = client.get(f"/goals/{goal_id}", headers=ana_headers).json()
    assert detail["my_role"] == "leader" and detail["can_delete"]


def test_leader_leaving_passes_to_oldest_moderator(client, db_session, user, auth_headers, ana, bruno):
    ana_user, ana_headers = ana
    bruno_user, bruno_headers = bruno
    goal_id, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    join(client, bruno_headers, invite(client, auth_headers, group_id))
    client.patch(f"/groups/{group_id}/members/{bruno_user.id}", json={"role": "moderator"}, headers=auth_headers)

    assert client.delete(f"/groups/{group_id}/members/{user.id}", headers=auth_headers).status_code == 200

    group = client.get(f"/groups/{group_id}", headers=bruno_headers).json()
    assert group["my_role"] == "leader"
    assert db_session.get(Goal, goal_id).user_id == bruno_user.id
    assert client.get(f"/goals/{goal_id}", headers=auth_headers).status_code == 404


def test_leader_leaving_without_moderators_passes_to_oldest_member(client, user, auth_headers, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    _, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    join(client, bruno_headers, invite(client, auth_headers, group_id))

    client.delete(f"/groups/{group_id}/members/{user.id}", headers=auth_headers)

    assert client.get(f"/groups/{group_id}", headers=ana_headers).json()["my_role"] == "leader"


def test_sole_member_leaving_collaborative_deletes_goal(client, db_session, user, auth_headers):
    goal = create_goal(client, auth_headers)
    group = share(client, auth_headers, goal["id"], "collaborative")

    client.delete(f"/groups/{group['id']}/members/{user.id}", headers=auth_headers)

    assert db_session.get(Goal, goal["id"]) is None


def test_contributions_stay_after_member_leaves(client, db_session, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")
    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]
    client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)

    client.delete(f"/groups/{group_id}/members/{ana_user.id}", headers=ana_headers)

    assert client.get(f"/goals/{goal_id}", headers=auth_headers).json()["progress"] == 100.0


def test_collaborative_numeric_entries_sum_and_authorship(client, auth_headers, ana):
    _, ana_headers = ana
    goal = create_goal(client, auth_headers, target_value=10, numeric_mode="sum")
    group = share(client, auth_headers, goal["id"], "collaborative")
    join(client, ana_headers, invite(client, auth_headers, group["id"]))

    client.post(f"/goals/{goal['id']}/entries", json={"value": 3}, headers=auth_headers)
    client.post(f"/goals/{goal['id']}/entries", json={"value": 4}, headers=ana_headers)

    assert client.get(f"/goals/{goal['id']}", headers=ana_headers).json()["current_value"] == 7
    entries = client.get(f"/goals/{goal['id']}/entries", headers=ana_headers).json()
    by_author = {entry["user_name"]: entry for entry in entries}
    assert by_author["Ana"]["can_delete"] is True
    assert by_author["Test User"]["can_delete"] is False
    response = client.delete(
        f"/goals/{goal['id']}/entries/{by_author['Test User']['id']}", headers=ana_headers
    )
    assert response.status_code == 403


def test_invite_expired(client, db_session, auth_headers, ana):
    _, ana_headers = ana
    goal = create_goal(client, auth_headers)
    group = share(client, auth_headers, goal["id"], "collaborative")
    token = invite(client, auth_headers, group["id"])
    stored = db_session.query(GroupInvite).filter_by(token=token).one()
    stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    assert client.get(f"/groups/invites/{token}", headers=ana_headers).status_code == 404
    assert client.post(f"/groups/invites/{token}/accept", headers=ana_headers).status_code == 404


def test_invite_preview(client, auth_headers, ana):
    _, ana_headers = ana
    goal = create_goal(client, auth_headers)
    group = share(client, auth_headers, goal["id"], "challenge")
    token = invite(client, auth_headers, group["id"])

    preview = client.get(f"/groups/invites/{token}", headers=ana_headers).json()

    assert preview == {
        "kind": "challenge",
        "goal_title": "Correr",
        "leader_name": "Test User",
        "member_count": 1,
        "member_limit": MEMBER_LIMIT,
        "is_member": False,
        "goal_id": None,
    }


def test_accepting_twice_is_idempotent(client, auth_headers, ana):
    _, ana_headers = ana
    goal = create_goal(client, auth_headers)
    group = share(client, auth_headers, goal["id"], "challenge")
    token = invite(client, auth_headers, group["id"])

    first = join(client, ana_headers, token)
    second = join(client, ana_headers, token)

    assert first == second
    assert len(client.get(f"/groups/{group['id']}", headers=ana_headers).json()["members"]) == 2


def test_member_limit(client, db_session, auth_headers):
    goal = create_goal(client, auth_headers)
    group = share(client, auth_headers, goal["id"], "collaborative")
    token = invite(client, auth_headers, group["id"])
    for index in range(MEMBER_LIMIT - 1):
        join(client, headers_for(make_user(db_session, f"Pessoa{index}")), token)

    extra = headers_for(make_user(db_session, "Extra"))
    response = client.post(f"/groups/invites/{token}/accept", headers=extra)

    assert response.status_code == 400


def test_outsider_cannot_see_shared_goal(client, auth_headers, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    goal_id, group_id, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    assert client.get(f"/goals/{goal_id}", headers=bruno_headers).status_code == 404
    assert client.get(f"/groups/{group_id}", headers=bruno_headers).status_code == 404


def test_challenge_join_creates_copy_with_tasks(client, user, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge", tasks=2)

    assert copy_id != goal_id
    copy = client.get(f"/goals/{copy_id}", headers=ana_headers).json()
    assert copy["is_mine"] and copy["can_act"] and not copy["can_edit"]
    tasks = client.get(f"/tasks/goal/{copy_id}", headers=ana_headers).json()
    assert [t["title"] for t in tasks] == ["Tarefa 0", "Tarefa 1"]
    assert all(t["status"] is False for t in tasks)


def test_challenge_progress_is_individual(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, group_id, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge", tasks=2)
    task = client.get(f"/tasks/goal/{copy_id}", headers=ana_headers).json()[0]

    client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)

    assert client.get(f"/goals/{copy_id}", headers=ana_headers).json()["progress"] == 50.0
    assert client.get(f"/goals/{goal_id}", headers=auth_headers).json()["progress"] == 0.0
    group = client.get(f"/groups/{group_id}", headers=auth_headers).json()
    assert [m["name"] for m in group["members"]] == ["Ana", "Test User"]
    assert group["members"][0]["progress"] == 50.0


def test_challenge_members_view_but_not_touch_other_copies(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")
    leader_task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]

    leader_copy = client.get(f"/goals/{goal_id}", headers=ana_headers).json()
    assert not leader_copy["is_mine"] and not leader_copy["can_act"]
    assert leader_copy["owner_name"] == "Test User"
    assert client.patch(f"/tasks/{leader_task['id']}/toggle", headers=ana_headers).status_code == 403
    assert client.post(f"/goals/{goal_id}/entries", json={"value": 1}, headers=ana_headers).status_code == 403


def test_challenge_member_can_complete_own_copy_only(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")

    assert client.put(f"/goals/{copy_id}", json={"status": "completed"}, headers=ana_headers).status_code == 200
    assert client.put(f"/goals/{copy_id}", json={"title": "X"}, headers=ana_headers).status_code == 403
    assert client.put(f"/goals/{goal_id}", json={"status": "completed"}, headers=ana_headers).status_code == 403
    assert client.get(f"/goals/{goal_id}", headers=auth_headers).json()["status"] == "open"


def test_challenge_edits_propagate(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge", tasks=2)
    leader_tasks = client.get(f"/tasks/goal/{goal_id}", headers=auth_headers).json()

    client.put(f"/goals/{goal_id}", json={"title": "Maratona"}, headers=auth_headers)
    client.post(f"/tasks/{goal_id}", json={"title": "Alongar"}, headers=auth_headers)
    client.put(f"/tasks/{leader_tasks[0]['id']}", json={"title": "Correr 5km"}, headers=auth_headers)
    client.delete(f"/tasks/{leader_tasks[1]['id']}", headers=auth_headers)

    assert client.get(f"/goals/{copy_id}", headers=ana_headers).json()["title"] == "Maratona"
    titles = [t["title"] for t in client.get(f"/tasks/goal/{copy_id}", headers=ana_headers).json()]
    assert titles == ["Correr 5km", "Alongar"]


def test_challenge_reorder_propagates(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge", tasks=3)
    leader_ids = [t["id"] for t in client.get(f"/tasks/goal/{goal_id}", headers=auth_headers).json()]

    response = client.put(
        f"/tasks/goal/{goal_id}/order", json={"ids": list(reversed(leader_ids))}, headers=auth_headers
    )

    assert response.status_code == 200
    titles = [t["title"] for t in client.get(f"/tasks/goal/{copy_id}", headers=ana_headers).json()]
    assert titles == ["Tarefa 2", "Tarefa 1", "Tarefa 0"]


def test_moderator_edits_challenge_from_own_copy(client, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")
    client.patch(f"/groups/{group_id}/members/{ana_user.id}", json={"role": "moderator"}, headers=auth_headers)

    client.post(f"/tasks/{copy_id}", json={"title": "Nova"}, headers=ana_headers)

    titles = [t["title"] for t in client.get(f"/tasks/goal/{goal_id}", headers=auth_headers).json()]
    assert titles == ["Tarefa 0", "Nova"]


def test_leaving_challenge_keeps_copy_as_personal_goal(client, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")

    client.delete(f"/groups/{group_id}/members/{ana_user.id}", headers=ana_headers)

    copy = client.get(f"/goals/{copy_id}", headers=ana_headers).json()
    assert copy["group_id"] is None and copy["can_edit"]
    client.put(f"/goals/{goal_id}", json={"title": "Só do líder"}, headers=auth_headers)
    assert client.get(f"/goals/{copy_id}", headers=ana_headers).json()["title"] == "Correr"


def test_leader_deleting_challenge_keeps_others_copies(client, db_session, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")

    assert client.delete(f"/goals/{goal_id}", headers=auth_headers).status_code == 200

    assert db_session.get(Goal, goal_id) is None
    copy = client.get(f"/goals/{copy_id}", headers=ana_headers).json()
    assert copy["group_id"] is None


def test_leader_deleting_collaborative_removes_for_everyone(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    client.delete(f"/goals/{goal_id}", headers=auth_headers)

    assert client.get("/goals/", headers=ana_headers).json() == []


def test_new_challenge_member_inherits_leader_after_transfer(client, auth_headers, ana, bruno):
    ana_user, ana_headers = ana
    _, bruno_headers = bruno
    goal_id, group_id, copy_id = shared_setup(client, auth_headers, ana_headers, "challenge")
    client.post(f"/groups/{group_id}/transfer", json={"user_id": ana_user.id}, headers=auth_headers)
    client.post(f"/tasks/{copy_id}", json={"title": "Da Ana"}, headers=ana_headers)

    bruno_copy = join(client, bruno_headers, invite(client, ana_headers, group_id))

    titles = [t["title"] for t in client.get(f"/tasks/goal/{bruno_copy}", headers=bruno_headers).json()]
    assert titles == ["Tarefa 0", "Da Ana"]


def test_deleting_account_passes_leadership(client, db_session, user, auth_headers, ana):
    ana_user, ana_headers = ana
    goal_id, group_id, _ = shared_setup(client, ana_headers, auth_headers, "collaborative")
    task = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()[0]
    client.patch(f"/tasks/{task['id']}/toggle", headers=ana_headers)

    response = client.request("DELETE", "/auth/me", json={}, headers=ana_headers)

    assert response.status_code == 200
    group = client.get(f"/groups/{group_id}", headers=auth_headers).json()
    assert group["my_role"] == "leader"
    assert [m["name"] for m in group["members"]] == ["Test User"]
    assert db_session.get(Goal, goal_id).user_id == user.id
    assert db_session.query(TaskCompletion).one().user_id is None


def test_shared_goals_ordering_is_per_member(client, auth_headers, ana):
    _, ana_headers = ana
    own = create_goal(client, ana_headers)
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative")

    assert [g["id"] for g in client.get("/goals/", headers=ana_headers).json()] == [own["id"], goal_id]

    client.put("/goals/order", json={"ids": [goal_id, own["id"]]}, headers=ana_headers)

    assert [g["id"] for g in client.get("/goals/", headers=ana_headers).json()] == [goal_id, own["id"]]
    leader_goals = client.get("/goals/", headers=auth_headers).json()
    assert [g["id"] for g in leader_goals] == [goal_id]


def test_today_includes_collaborative_tasks(client, auth_headers, ana):
    _, ana_headers = ana
    shared_setup(client, auth_headers, ana_headers, "collaborative")

    today = client.get("/tasks/today", headers=ana_headers).json()

    assert [t["title"] for t in today] == ["Tarefa 0"]


def test_stats_count_only_own_activity_in_collaborative(client, auth_headers, ana):
    _, ana_headers = ana
    goal_id, _, _ = shared_setup(client, auth_headers, ana_headers, "collaborative", tasks=2)
    tasks = client.get(f"/tasks/goal/{goal_id}", headers=ana_headers).json()
    client.patch(f"/tasks/{tasks[0]['id']}/toggle", headers=ana_headers)

    ana_stats = client.get("/stats/", headers=ana_headers).json()
    leader_stats = client.get("/stats/", headers=auth_headers).json()

    assert ana_stats["summary"]["total_activities"] == 1
    assert leader_stats["summary"]["total_activities"] == 0
