from datetime import timedelta

from app.routers.auth import create_token, password_fingerprint


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
