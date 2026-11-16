import pytest
from app.fitness_models import Exercise
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="leg-press", name="Leg press", muscle_group="legs", equipment="machine"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return exercises


@pytest.fixture()
def ana(db_session):
    user = make_user(db_session, "Ana")
    return user, headers_for(user)


@pytest.fixture()
def bruno(db_session):
    user = make_user(db_session, "Bruno")
    return user, headers_for(user)


def create_exercise(client, headers, name="Remada máquina", muscle_group="back", equipment="machine"):
    response = client.post(
        "/fitness/exercises",
        json={"name": name, "muscle_group": muscle_group, "equipment": equipment},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def names(client, headers):
    return [e["name"] for e in client.get("/fitness/exercises", headers=headers).json()]


def test_requires_authentication(client):
    assert client.get("/fitness/exercises").status_code == 401
    assert client.post("/fitness/exercises", json={}).status_code == 401


def test_lists_library_and_own_exercises_sorted(client, library, ana):
    _, headers = ana
    create_exercise(client, headers, "Abdominal bola", "abs", "other")

    exercises = client.get("/fitness/exercises", headers=headers).json()

    assert [e["name"] for e in exercises] == ["Abdominal bola", "Leg press", "Supino reto"]
    assert [e["is_custom"] for e in exercises] == [True, False, False]


def test_custom_exercises_are_private(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    mine = create_exercise(client, ana_headers)

    assert mine["name"] not in names(client, bruno_headers)
    assert client.patch(
        f"/fitness/exercises/{mine['id']}", json={"name": "Hack"}, headers=bruno_headers
    ).status_code == 404
    assert client.delete(f"/fitness/exercises/{mine['id']}", headers=bruno_headers).status_code == 404
    assert mine["name"] in names(client, ana_headers)


def test_user_id_in_payload_is_ignored(client, ana, bruno):
    ana_user, ana_headers = ana
    bruno_user, bruno_headers = bruno

    response = client.post(
        "/fitness/exercises",
        json={"name": "Remada", "muscle_group": "back", "equipment": "cable", "user_id": bruno_user.id},
        headers=ana_headers,
    )

    assert response.status_code == 200
    assert "Remada" in names(client, ana_headers)
    assert "Remada" not in names(client, bruno_headers)


def test_edit_custom_exercise(client, ana):
    _, headers = ana
    exercise = create_exercise(client, headers)

    response = client.patch(
        f"/fitness/exercises/{exercise['id']}",
        json={"name": "  Remada   articulada ", "equipment": "smith"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Remada articulada"
    assert response.json()["equipment"] == "smith"
    assert response.json()["muscle_group"] == "back"


def test_delete_custom_exercise(client, ana):
    _, headers = ana
    exercise = create_exercise(client, headers)

    assert client.delete(f"/fitness/exercises/{exercise['id']}", headers=headers).status_code == 200
    assert exercise["name"] not in names(client, headers)


def test_library_exercises_cannot_be_changed(client, library, ana):
    _, headers = ana
    supino = library[0]

    assert client.patch(
        f"/fitness/exercises/{supino.id}", json={"name": "Meu supino"}, headers=headers
    ).status_code == 403
    assert client.delete(f"/fitness/exercises/{supino.id}", headers=headers).status_code == 403
    assert "Supino reto" in names(client, headers)


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "muscle_group": "back", "equipment": "cable"},
        {"name": "Remada", "muscle_group": "costas", "equipment": "cable"},
        {"name": "Remada", "muscle_group": "back", "equipment": "trator"},
        {"name": "x" * 61, "muscle_group": "back", "equipment": "cable"},
    ],
)
def test_invalid_exercise_is_rejected(client, ana, payload):
    _, headers = ana

    assert client.post("/fitness/exercises", json=payload, headers=headers).status_code == 422


def test_duplicate_names_are_rejected(client, library, ana, bruno):
    _, ana_headers = ana
    _, bruno_headers = bruno
    first = create_exercise(client, ana_headers, "Remada máquina")
    other = create_exercise(client, ana_headers, "Remada cabo")

    def post(name, headers):
        return client.post(
            "/fitness/exercises",
            json={"name": name, "muscle_group": "back", "equipment": "machine"},
            headers=headers,
        )

    assert post("supino RETO", ana_headers).status_code == 409
    assert post("remada máquina", ana_headers).status_code == 409
    assert post("Remada máquina", bruno_headers).status_code == 200
    assert client.patch(
        f"/fitness/exercises/{other['id']}", json={"name": "Remada Máquina"}, headers=ana_headers
    ).status_code == 409
    assert client.patch(
        f"/fitness/exercises/{first['id']}", json={"name": "Remada Máquina"}, headers=ana_headers
    ).status_code == 200
