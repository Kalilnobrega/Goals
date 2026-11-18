import pytest
from tests.test_fitness_sessions import ana, bruno  # noqa: F401


def test_profile_requires_authentication(client):
    assert client.get("/fitness/profile").status_code == 401
    assert client.put("/fitness/profile", json={"body_type": "female"}).status_code == 401


def test_profile_defaults_to_male_and_can_change(client, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    assert client.get("/fitness/profile", headers=headers).json() == {"body_type": "male"}

    assert client.put("/fitness/profile", json={"body_type": "female"}, headers=headers).json() == {"body_type": "female"}
    assert client.get("/fitness/profile", headers=headers).json() == {"body_type": "female"}
    assert client.get("/fitness/profile", headers=bruno_headers).json() == {"body_type": "male"}

    assert client.put("/fitness/profile", json={"body_type": "male"}, headers=headers).json() == {"body_type": "male"}


@pytest.mark.parametrize("body_type", ["other", "", None])
def test_profile_rejects_unknown_body_types(client, ana, body_type):
    _, headers = ana
    assert client.put("/fitness/profile", json={"body_type": body_type}, headers=headers).status_code == 422
