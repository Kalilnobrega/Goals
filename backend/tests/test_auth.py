from datetime import timedelta

from app.models import RefreshToken
from app.routers.auth import create_token, create_refresh_token_in_db, password_fingerprint


def test_forgot_password_is_rate_limited(client):
    statuses = [
        client.post("/auth/forgot-password", json={"email": "ninguem@example.com"}).status_code
        for _ in range(4)
    ]
    assert statuses[:3] == [200, 200, 200]
    assert statuses[3] == 429


def make_reset_token(user):
    return create_token(
        user.id,
        expire=timedelta(hours=1),
        token_type="reset",
        extra_claims={"pwd": password_fingerprint(user.password)},
    )


def test_reset_password_link_works_once(client, user):
    token = make_reset_token(user)

    first = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "novasenha1"}
    )
    second = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "outrasenha2"}
    )

    assert first.status_code == 200
    assert second.status_code == 400


def test_reset_password_rejects_token_without_fingerprint(client, user):
    token = create_token(user.id, expire=timedelta(hours=1), token_type="reset")

    resp = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "novasenha1"}
    )

    assert resp.status_code == 400


def test_refresh_rotates_token_and_cleans_up_revoked_ones(client, user, db_session):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")
    create_refresh_token_in_db(refresh_token, user.id, db_session)

    resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert resp.status_code == 200
    tokens = db_session.query(RefreshToken).filter(RefreshToken.user_id == user.id).all()
    assert [t.token for t in tokens] == [resp.json()["refresh_token"]]
