from datetime import datetime, timedelta, timezone
import pytest
from app.fitness_models import Exercise, WorkoutSession
from tests.test_shared_goals import make_user, headers_for


@pytest.fixture()
def library(db_session):
    exercises = [
        Exercise(slug="supino-reto", name="Supino reto", muscle_group="chest", equipment="barbell"),
        Exercise(slug="esteira", name="Esteira", muscle_group="cardio", equipment="machine", tracking="cardio"),
    ]
    db_session.add_all(exercises)
    db_session.commit()
    return {e.slug: e.id for e in exercises}


@pytest.fixture()
def ana(db_session):
    user = make_user(db_session, "Ana")
    return user, headers_for(user)


def finished_workout(client, headers, library):
    workout = client.post(
        "/fitness/workouts",
        json={
            "name": "Treino A",
            "exercises": [{"exercise_id": library["supino-reto"], "target_sets": 2, "reps_min": 8, "set_plan": ["warmup", "normal", "drop"]}],
            "cardio": [{"exercise_id": library["esteira"], "phase": "end", "minutes": 10}],
        },
        headers=headers,
    ).json()
    session = client.post("/fitness/sessions", json={"workout_id": workout["id"]}, headers=headers).json()
    bench, treadmill = session["exercises"]
    sets = f"/fitness/session-exercises/{bench['id']}/sets"
    client.post(sets, json={"kind": "warmup"}, headers=headers)
    client.post(sets, json={"weight_kg": 62.5, "reps": 10, "rir": 2}, headers=headers)
    drop = client.post(sets, json={"weight_kg": 60, "reps": 8, "kind": "drop"}, headers=headers).json()
    client.patch(f"/fitness/sets/{drop['id']}", json={"stages": [{"weight_kg": 45, "reps": 8}]}, headers=headers)
    client.post(f"/fitness/session-exercises/{treadmill['id']}/sets", json={"duration_seconds": 600, "distance_km": 1.5}, headers=headers)
    assert client.post(f"/fitness/sessions/{session['id']}/finish", json={}, headers=headers).status_code == 200
    return session


def test_export_requires_authentication(client):
    assert client.get("/fitness/export").status_code == 401


def test_workouts_csv_has_one_row_per_set(client, library, ana):
    _, headers = ana
    finished_workout(client, headers, library)

    response = client.get("/fitness/export", params={"format": "csv", "content": "workouts"}, headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "gymgoals-treinos-" in response.headers["content-disposition"]
    lines = response.content.decode("utf-8-sig").strip().split("\r\n")
    assert lines[0].startswith("Data;Hora;Treino;Exercício;Série")
    rows = [line.split(";") for line in lines[1:]]
    assert [(r[3], r[4], r[6], r[7], r[8], r[10]) for r in rows] == [
        ("Supino reto", "Aq", "Aquecimento", "", "", ""),
        ("Supino reto", "1", "Normal", "62,5", "10", ""),
        ("Supino reto", "2", "Drop", "60", "8", "45 x 8"),
        ("Esteira", "1", "Normal", "", "", ""),
    ]
    assert rows[3][11] == "600"
    assert rows[3][12] == "1,5"


def test_weights_csv(client, ana):
    _, headers = ana
    client.post("/fitness/body-weight", json={"weight_kg": 80.4, "measured_on": "2026-01-10", "note": "jejum"}, headers=headers)
    response = client.get("/fitness/export", params={"format": "csv", "content": "weights"}, headers=headers)
    lines = response.content.decode("utf-8-sig").strip().split("\r\n")
    assert lines == ["Data;Hora;Peso (kg);Observação", "10/01/2026;;80,4;jejum"]


def test_csv_needs_a_single_content(client, ana):
    _, headers = ana
    assert client.get("/fitness/export", params={"format": "csv", "content": "all"}, headers=headers).status_code == 400


def test_text_export_lists_workouts_and_weights(client, library, ana):
    _, headers = ana
    finished_workout(client, headers, library)
    client.post("/fitness/body-weight", json={"weight_kg": 80, "measured_on": "2026-01-10"}, headers=headers)

    response = client.get("/fitness/export", params={"format": "txt"}, headers=headers)
    text = response.content.decode("utf-8")

    assert response.headers["content-type"].startswith("text/plain")
    assert "TREINOS (1)" in text
    assert "Treino A" in text
    assert "Aq   Aquecimento feito" in text
    assert "1    62,5 kg × 10 · RIR 2" in text
    assert "2    60 kg × 8 · drops: 45 kg × 8" in text
    assert "10:00 · 1,5 km" in text
    assert "PESO CORPORAL (1)" in text
    assert "10/01/2026   80 kg" in text


def test_pdf_export_is_a_pdf(client, library, ana):
    _, headers = ana
    finished_workout(client, headers, library)
    response = client.get("/fitness/export", params={"format": "pdf"}, headers=headers)
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-1.4")
    assert response.content.rstrip().endswith(b"%%EOF")
    assert b"Supino reto" in response.content


def test_export_period_and_isolation(client, library, ana, db_session):
    user, headers = ana
    session = finished_workout(client, headers, library)
    old = db_session.get(WorkoutSession, session["id"])
    old.started_at = datetime.now(timezone.utc) - timedelta(days=60)
    old.completed_at = old.started_at + timedelta(hours=1)
    db_session.commit()

    recent = client.get("/fitness/export", params={"format": "txt", "content": "workouts", "period": "30d"}, headers=headers).text
    assert "TREINOS (0)" in recent
    assert "TREINOS (1)" in client.get("/fitness/export", params={"format": "txt", "content": "workouts", "period": "90d"}, headers=headers).text

    other = headers_for(make_user(db_session, "Bruno"))
    assert "TREINOS (0)" in client.get("/fitness/export", params={"format": "txt"}, headers=other).text
