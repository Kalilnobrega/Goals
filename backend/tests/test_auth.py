def test_forgot_password_is_rate_limited(client):
    statuses = [
        client.post("/auth/forgot-password", json={"email": "ninguem@example.com"}).status_code
        for _ in range(4)
    ]
    assert statuses[:3] == [200, 200, 200]
    assert statuses[3] == 429
