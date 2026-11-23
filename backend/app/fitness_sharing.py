from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import User
from app.fitness_models import Exercise, Plan, PlanDay, Workout
from app.fitness_schemas import WorkoutSchema


def workout_snapshot(workout: Workout) -> dict:
    return {
        "name": workout.name,
        "description": workout.description,
        "exercises": [
            {
                "exercise_id": item.exercise_id,
                "name": item.exercise.name,
                "muscle_group": item.exercise.muscle_group,
                "target_sets": item.target_sets,
                "reps_min": item.reps_min,
                "reps_max": item.reps_max,
                "rest_seconds": item.rest_seconds,
                "unilateral": item.unilateral,
                "load_mode": item.load_mode,
                "superset": item.superset,
                "set_plan": item.set_plan,
            }
            for item in workout.exercises
        ],
        "cardio": [
            {
                "exercise_id": item.exercise_id,
                "name": item.exercise.name if item.exercise else "Cardio",
                "phase": item.phase,
                "minutes": item.minutes,
            }
            for item in workout.cardio
        ],
    }


def plan_snapshot(plan: Plan) -> dict:
    workouts = {}
    days = []
    for day in plan.days:
        key = str(day.workout_id)
        if key not in workouts:
            workouts[key] = workout_snapshot(day.workout)
        days.append({"weekday": day.weekday, "workout": key})
    return {"name": plan.name, "days": days, "workouts": workouts}


def own_workout(db: Session, user: User, workout_id: int) -> Workout:
    workout = db.get(Workout, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    return workout


def own_plan(db: Session, user: User, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    return plan


def snapshot_for(db: Session, user: User, kind: str, item_id: int) -> dict:
    if kind == "workout":
        return workout_snapshot(own_workout(db, user, item_id))
    return plan_snapshot(own_plan(db, user, item_id))


def usable_exercises(db: Session, user: User, ids: list[int]) -> set[int]:
    ids = [i for i in ids if i]
    if not ids:
        return set()
    return {
        row.id
        for row in db.query(Exercise.id).filter(Exercise.id.in_(ids), or_(Exercise.user_id.is_(None), Exercise.user_id == user.id))
    }


def build_copy(db: Session, user: User, snapshot: dict, name: str, description: str | None) -> tuple[Workout | None, int]:
    from app.routers.fitness import build_workout_cardio, build_workout_exercises

    usable = usable_exercises(
        db, user, [e["exercise_id"] for e in snapshot["exercises"]] + [c["exercise_id"] for c in snapshot["cardio"]]
    )
    exercises = [
        {key: e[key] for key in ("exercise_id", "target_sets", "reps_min", "reps_max", "rest_seconds", "unilateral", "load_mode", "superset", "set_plan")}
        for e in snapshot["exercises"]
        if e["exercise_id"] in usable
    ]
    cardio = [
        {"exercise_id": c["exercise_id"] if c["exercise_id"] in usable else None, "phase": c["phase"], "minutes": c["minutes"]}
        for c in snapshot["cardio"]
    ]
    skipped = len(snapshot["exercises"]) - len(exercises)
    if not exercises and not cardio:
        return None, skipped
    data = WorkoutSchema(name=name[:60], description=description, exercises=exercises[:40], cardio=cardio[:6])
    workout = Workout(
        user_id=user.id,
        name=data.name,
        description=data.description,
        exercises=build_workout_exercises(data, user, db),
        cardio=build_workout_cardio(data),
    )
    db.add(workout)
    db.flush()
    return workout, skipped


def copy_workout(db: Session, user: User, snapshot: dict, author: User) -> dict:
    mine = author.id == user.id
    name = snapshot["name"] if mine else f"{snapshot['name']} ({author.name.split(' ')[0]})"
    workout, skipped = build_copy(db, user, snapshot, name, None if mine else f"Copiada da ficha de {author.name}.")
    if workout is None:
        raise HTTPException(status_code=422, detail="Nenhum exercício dessa ficha pode ser copiado.")
    db.commit()
    return {"kind": "workout", "id": workout.id, "name": workout.name, "skipped": skipped}


def copy_plan(db: Session, user: User, snapshot: dict, author: User) -> dict:
    first = author.name.split(" ")[0]
    mine = author.id == user.id
    created = {}
    skipped = 0
    for key, workout_snap in snapshot["workouts"].items():
        name = workout_snap["name"] if mine else f"{workout_snap['name']} ({first})"
        workout, missing = build_copy(db, user, workout_snap, name, None if mine else f"Do plano de {author.name}.")
        skipped += missing
        if workout is not None:
            created[key] = workout
    days = [day for day in snapshot["days"] if day["workout"] in created]
    if not days:
        raise HTTPException(status_code=422, detail="Nenhuma ficha desse plano pode ser copiada.")
    plan = Plan(user_id=user.id, name=(snapshot["name"] if mine else f"{snapshot['name']} ({first})")[:60], is_active=False)
    positions: dict[int, int] = {}
    for day in days:
        position = positions.get(day["weekday"], 0)
        plan.days.append(PlanDay(workout_id=created[day["workout"]].id, weekday=day["weekday"], position=position))
        positions[day["weekday"]] = position + 1
    db.add(plan)
    db.commit()
    return {"kind": "plan", "id": plan.id, "name": plan.name, "skipped": skipped}


def copy_snapshot(db: Session, user: User, kind: str, snapshot: dict, author: User) -> dict:
    if kind == "workout":
        return copy_workout(db, user, snapshot, author)
    return copy_plan(db, user, snapshot, author)
