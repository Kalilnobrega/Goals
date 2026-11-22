import pytest
from tests.test_fitness_sessions import ana, bruno  # noqa: F401


def test_profile_requires_authentication(client):
    assert client.get("/fitness/profile").status_code == 401
    assert client.put("/fitness/profile", json={"body_type": "female"}).status_code == 401


def test_profile_defaults_to_male_and_can_change(client, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    assert client.get("/fitness/profile", headers=headers).json() == {"body_type": "male", "username": None}

    assert client.put("/fitness/profile", json={"body_type": "female"}, headers=headers).json()["body_type"] == "female"
    assert client.get("/fitness/profile", headers=headers).json()["body_type"] == "female"
    assert client.get("/fitness/profile", headers=bruno_headers).json()["body_type"] == "male"

    assert client.put("/fitness/profile", json={"body_type": "male"}, headers=headers).json()["body_type"] == "male"


@pytest.mark.parametrize("body_type", ["other", "", None])
def test_profile_rejects_unknown_body_types(client, ana, body_type):
    _, headers = ana
    assert client.put("/fitness/profile", json={"body_type": body_type}, headers=headers).status_code == 422


def test_username_requires_authentication(client):
    assert client.put("/fitness/profile/username", json={"username": "ana"}).status_code == 401
    assert client.get("/fitness/profile/username-available", params={"username": "ana"}).status_code == 401


def test_username_is_normalized_saved_and_kept_with_body_type(client, ana):
    _, headers = ana
    response = client.put("/fitness/profile/username", json={"username": "  @Ana.Silva_ "}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"body_type": "male", "username": "ana.silva_"}

    client.put("/fitness/profile", json={"body_type": "female"}, headers=headers)
    assert client.get("/fitness/profile", headers=headers).json() == {"body_type": "female", "username": "ana.silva_"}

    renamed = client.put("/fitness/profile/username", json={"username": "ana2"}, headers=headers)
    assert renamed.json() == {"body_type": "female", "username": "ana2"}


def test_username_must_be_unique_across_users(client, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    client.put("/fitness/profile/username", json={"username": "treino"}, headers=headers)

    taken = client.put("/fitness/profile/username", json={"username": "Treino"}, headers=bruno_headers)
    assert taken.status_code == 409
    assert taken.json()["detail"] == "Esse username já está em uso."

    again = client.put("/fitness/profile/username", json={"username": "treino"}, headers=headers)
    assert again.status_code == 200


def test_username_availability(client, ana, bruno):
    _, headers = ana
    _, bruno_headers = bruno
    client.put("/fitness/profile/username", json={"username": "treino"}, headers=headers)

    check = lambda name, h: client.get("/fitness/profile/username-available", params={"username": name}, headers=h).json()
    assert check("@Treino", headers) == {"username": "treino", "available": True, "reason": None}
    assert check("treino", bruno_headers)["available"] is False
    assert check("treino", bruno_headers)["reason"] == "Esse username já está em uso."
    assert check("bruno.fit", bruno_headers)["available"] is True
    assert check("ab", bruno_headers)["available"] is False
    assert check("admin", bruno_headers)["reason"] == "Esse username é reservado."


@pytest.mark.parametrize("username", ["ab", "a" * 21, "ana silva", ".ana", "_ana", "ana.", "an..a", "ana-silva", "anã", "admin", "gymgoals"])
def test_username_rejects_invalid_values(client, ana, username):
    _, headers = ana
    response = client.put("/fitness/profile/username", json={"username": username}, headers=headers)
    assert response.status_code == 422
    assert client.get("/fitness/profile", headers=headers).json()["username"] is None
