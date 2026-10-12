from datetime import timedelta

from app.models import RefreshToken, User
import app.routers.auth as auth_module
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


def register(client, email="novo@example.com", password="senha123"):
    return client.post(
        "/auth/register", json={"name": "Novo", "email": email, "password": password}
    )


def login(client, email="novo@example.com", password="senha123"):
    return client.post("/auth/login", data={"username": email, "password": password})


def verify(db_session, email="novo@example.com"):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_verify = True
    db_session.commit()


def test_register_creates_unverified_user_and_sends_verification_email(
    client, db_session, sent_emails
):
    resp = register(client)

    assert resp.status_code == 200
    user = db_session.query(User).filter(User.email == "novo@example.com").first()
    assert user.is_verify is False
    assert user.password != "senha123"
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "novo@example.com"


def test_register_rejects_duplicate_email(client):
    register(client)
    resp = register(client)

    assert resp.status_code == 400


def test_register_rejects_short_password(client):
    resp = register(client, password="123")

    assert resp.status_code == 422


def test_verify_email_marks_user_verified(client, db_session):
    register(client)
    user = db_session.query(User).filter(User.email == "novo@example.com").first()
    token = create_token(user.id, expire=timedelta(hours=24), token_type="verification")

    resp = client.post("/auth/verify-email", params={"token": token})

    assert resp.status_code == 200
    db_session.refresh(user)
    assert user.is_verify is True


def test_verify_email_rejects_access_token(client, db_session):
    register(client)
    user = db_session.query(User).filter(User.email == "novo@example.com").first()

    resp = client.post("/auth/verify-email", params={"token": create_token(user.id)})

    assert resp.status_code == 400


def test_login_blocked_until_email_verified(client):
    register(client)

    resp = login(client)

    assert resp.status_code == 403


def test_login_returns_working_tokens(client, db_session):
    register(client)
    verify(db_session)

    resp = login(client)

    assert resp.status_code == 200
    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {resp.json()['access_token']}"}
    )
    assert me.json()["email"] == "novo@example.com"


def test_login_rejects_wrong_password(client, db_session):
    register(client)
    verify(db_session)

    resp = login(client, password="errada123")

    assert resp.status_code == 400


def test_login_rejects_google_account_password(client, db_session):
    db_session.add(
        User(name="G", email="g@example.com", password="google_oauth_account", is_verify=True)
    )
    db_session.commit()

    resp = login(client, email="g@example.com", password="google_oauth_account")

    assert resp.status_code == 400


def test_login_is_rate_limited(client):
    statuses = [login(client, email="x@example.com").status_code for _ in range(6)]

    assert statuses[-1] == 429


def test_me_rejects_refresh_token(client, user):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")

    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})

    assert resp.status_code == 401


def test_me_rejects_missing_token(client):
    assert client.get("/auth/me").status_code == 401


def test_refresh_token_cannot_be_reused(client, user, db_session):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")
    create_refresh_token_in_db(refresh_token, user.id, db_session)

    first = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    second = client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert first.status_code == 200
    assert second.status_code == 401


def test_refresh_rejects_unknown_token(client, user):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")

    resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert resp.status_code == 401


def test_logout_revokes_refresh_token(client, user, db_session):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")
    create_refresh_token_in_db(refresh_token, user.id, db_session)

    client.post("/auth/logout", json={"refresh_token": refresh_token})
    resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert resp.status_code == 401


def test_reset_password_revokes_existing_sessions(client, user, db_session):
    refresh_token = create_token(user.id, timedelta(days=7), "refresh")
    create_refresh_token_in_db(refresh_token, user.id, db_session)

    client.post(
        "/auth/reset-password",
        json={"token": make_reset_token(user), "new_password": "novasenha1"},
    )
    resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert resp.status_code == 401


def test_forgot_password_sends_email_only_for_known_user(client, user, sent_emails):
    client.post("/auth/forgot-password", json={"email": "ninguem@example.com"})
    assert sent_emails == []

    client.post("/auth/forgot-password", json={"email": user.email})
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == user.email


class FakeGoogleResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def fake_google(monkeypatch, aud="client-id", tokeninfo_status=200):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "client-id")

    def fake_get(url, params=None, timeout=None):
        if "tokeninfo" in url:
            return FakeGoogleResponse(tokeninfo_status, {"aud": aud})
        return FakeGoogleResponse(200, {"email": "google@example.com", "name": "Google User"})

    monkeypatch.setattr(auth_module.requests, "get", fake_get)


def test_google_login_creates_verified_user(client, db_session, monkeypatch):
    fake_google(monkeypatch)

    resp = client.post("/auth/google", json={"token": "abc"})

    assert resp.status_code == 200
    user = db_session.query(User).filter(User.email == "google@example.com").first()
    assert user.is_verify is True


def test_google_login_rejects_token_for_other_app(client, monkeypatch):
    fake_google(monkeypatch, aud="outro-app")

    resp = client.post("/auth/google", json={"token": "abc"})

    assert resp.status_code == 401


def test_google_login_rejects_invalid_token(client, monkeypatch):
    fake_google(monkeypatch, tokeninfo_status=400)

    resp = client.post("/auth/google", json={"token": "abc"})

    assert resp.status_code == 401
