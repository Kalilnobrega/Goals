from datetime import timedelta

from app.dates import today_br
from app.models import Streak


def create_task(client, auth_headers, title="tarefa"):
    goal = client.post("/goals/", json={"title": "Meta"}, headers=auth_headers).json()
    return client.post(
        f"/tasks/{goal['id']}",
        json={"title": title, "is_recurring": False},
        headers=auth_headers,
    ).json()


def get_streak(client, auth_headers):
    return client.get("/auth/me/streak", headers=auth_headers).json()


def set_streak(db_session, user, current, longest, last_activity):
    db_session.add(
        Streak(
            user_id=user.id,
            current_streak=current,
            longest_streak=longest,
            last_activity=last_activity,
        )
    )
    db_session.commit()


def test_streak_starts_empty(client, auth_headers):
    assert get_streak(client, auth_headers) == {
        "current_streak": 0,
        "longest_streak": 0,
        "last_activity": None,
    }


def test_completing_first_task_starts_streak(client, auth_headers):
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 1
    assert streak["longest_streak"] == 1
    assert streak["last_activity"] == str(today_br())


def test_second_task_same_day_does_not_increase_streak(client, auth_headers):
    first = create_task(client, auth_headers, "a")
    second = create_task(client, auth_headers, "b")

    client.patch(f"/tasks/{first['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{second['id']}/toggle", headers=auth_headers)

    assert get_streak(client, auth_headers)["current_streak"] == 1


def test_activity_after_yesterday_continues_streak(client, auth_headers, user, db_session):
    set_streak(db_session, user, 3, 5, today_br() - timedelta(days=1))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 4
    assert streak["longest_streak"] == 5


def test_streak_updates_longest_when_surpassed(client, auth_headers, user, db_session):
    set_streak(db_session, user, 5, 5, today_br() - timedelta(days=1))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    assert get_streak(client, auth_headers)["longest_streak"] == 6


def test_gap_of_more_than_a_day_restarts_streak(client, auth_headers, user, db_session):
    set_streak(db_session, user, 3, 5, today_br() - timedelta(days=3))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 1
    assert streak["longest_streak"] == 5


def test_reading_broken_streak_resets_current_but_keeps_longest(
    client, auth_headers, user, db_session
):
    set_streak(db_session, user, 3, 5, today_br() - timedelta(days=2))

    streak = get_streak(client, auth_headers)

    assert streak["current_streak"] == 0
    assert streak["longest_streak"] == 5
    assert streak["last_activity"] is None


def test_streak_from_yesterday_is_still_shown(client, auth_headers, user, db_session):
    set_streak(db_session, user, 3, 5, today_br() - timedelta(days=1))

    assert get_streak(client, auth_headers)["current_streak"] == 3


def test_untoggling_only_task_undoes_todays_increment(
    client, auth_headers, user, db_session
):
    set_streak(db_session, user, 3, 5, today_br() - timedelta(days=1))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 3
    assert streak["last_activity"] == str(today_br() - timedelta(days=1))


def test_untoggling_first_ever_task_clears_streak(client, auth_headers):
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    assert get_streak(client, auth_headers) == {
        "current_streak": 0,
        "longest_streak": 0,
        "last_activity": None,
    }


def test_untoggling_task_that_set_new_record_restores_previous_record(
    client, auth_headers, user, db_session
):
    set_streak(db_session, user, 5, 5, today_br() - timedelta(days=1))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    assert get_streak(client, auth_headers)["longest_streak"] == 6
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 5
    assert streak["longest_streak"] == 5


def test_untoggling_keeps_older_record_equal_to_todays_streak(
    client, auth_headers, user, db_session
):
    set_streak(db_session, user, 5, 6, today_br() - timedelta(days=1))
    task = create_task(client, auth_headers)

    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{task['id']}/toggle", headers=auth_headers)

    streak = get_streak(client, auth_headers)
    assert streak["current_streak"] == 5
    assert streak["longest_streak"] == 6


def test_untoggling_one_of_two_tasks_keeps_streak(client, auth_headers):
    first = create_task(client, auth_headers, "a")
    second = create_task(client, auth_headers, "b")

    client.patch(f"/tasks/{first['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{second['id']}/toggle", headers=auth_headers)
    client.patch(f"/tasks/{first['id']}/toggle", headers=auth_headers)

    assert get_streak(client, auth_headers)["current_streak"] == 1
