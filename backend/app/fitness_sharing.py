from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import User
from sqlalchemy import func
from app.fitness_models import Exercise, ExerciseMuscle, Plan, PlanDay, Workout
from app.fitness_schemas import WorkoutSchema


def exercise_snapshot(exercise: Exercise) -> dict:
    return {
        "name": exercise.name,
        "muscle_group": exercise.muscle_group,
        "equipment": exercise.equipment,
        "grip": exercise.grip,
        "is_unilateral": bool(exercise.is_unilateral),
        "family": exercise.family,
        "bodyweight_factor": float(exercise.bodyweight_factor) if exercise.bodyweight_factor is not None else None,
        "tracking": exercise.tracking or "reps",
        "intensity": exercise.intensity,
        "muscles": [{"muscle": m.muscle, "role": m.role} for m in exercise.muscles],
    }


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
                "custom": exercise_snapshot(item.exercise) if item.exercise.user_id is not None else None,
            }
            for item in workout.exercises
        ],
        "cardio": [
            {
                "exercise_id": item.exercise_id,
                "name": item.exercise.name if item.exercise else "Cardio",
                "phase": item.phase,
                "minutes": item.minutes,
                "custom": exercise_snapshot(item.exercise) if item.exercise and item.exercise.user_id is not None else None,
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


def own_exercise(db: Session, user: User, exercise_id: int) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise HTTPException(status_code=404, detail="Só dá para compartilhar exercícios que você criou.")
    return exercise


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
    if kind == "exercise":
        return exercise_snapshot(own_exercise(db, user, item_id))
    return plan_snapshot(own_plan(db, user, item_id))


def usable_exercises(db: Session, user: User, ids: list[int]) -> set[int]:
    ids = [i for i in ids if i]
    if not ids:
        return set()
    return {
        row.id
        for row in db.query(Exercise.id).filter(Exercise.id.in_(ids), or_(Exercise.user_id.is_(None), Exercise.user_id == user.id))
    }


FIELDS = ("target_sets", "reps_min", "reps_max", "rest_seconds", "unilateral", "load_mode", "superset", "set_plan")


def build_copy(
    db: Session,
    user: User,
    snapshot: dict,
    name: str,
    description: str | None,
    author: User | None = None,
    cache: dict | None = None,
) -> tuple[Workout | None, int]:
    from app.routers.fitness import build_workout_cardio, build_workout_exercises

    cache = {} if cache is None else cache
    usable = usable_exercises(
        db, user, [e["exercise_id"] for e in snapshot["exercises"]] + [c["exercise_id"] for c in snapshot["cardio"]]
    )

    def target(entry: dict) -> int | None:
        if entry.get("exercise_id") in usable:
            return entry["exercise_id"]
        return resolve_custom(db, user, author, entry, cache)

    exercises = []
    for entry in snapshot["exercises"]:
        exercise_id = target(entry)
        if exercise_id is not None:
            exercises.append({"exercise_id": exercise_id, **{key: entry.get(key) for key in FIELDS}})
    cardio = [
        {"exercise_id": target(c) if c.get("exercise_id") else None, "phase": c["phase"], "minutes": c["minutes"]}
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
    workout, skipped = build_copy(db, user, snapshot, name, None if mine else f"Copiada da ficha de {author.name}.", author)
    if workout is None:
        raise HTTPException(status_code=422, detail="Nenhum exercício dessa ficha pode ser copiado.")
    db.commit()
    return {"kind": "workout", "id": workout.id, "name": workout.name, "skipped": skipped}


def copy_plan(db: Session, user: User, snapshot: dict, author: User) -> dict:
    from app.routers.fitness_plans import ensure_plan_room

    ensure_plan_room(user, db)
    first = author.name.split(" ")[0]
    mine = author.id == user.id
    created = {}
    skipped = 0
    cache: dict = {}
    for key, workout_snap in snapshot["workouts"].items():
        name = workout_snap["name"] if mine else f"{workout_snap['name']} ({first})"
        workout, missing = build_copy(db, user, workout_snap, name, None if mine else f"Do plano de {author.name}.", author, cache)
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


def name_taken(db: Session, user: User, name: str) -> bool:
    from app.routers.fitness import visible_exercises

    return visible_exercises(user, db).filter(func.lower(Exercise.name) == name.lower()).first() is not None


def copy_names(snapshot: dict, author: User | None) -> list[str]:
    base = snapshot["name"]
    suffix = [f"{base} ({author.name.split(' ')[0]})"] if author else []
    return [candidate[:60] for candidate in [base] + suffix + [f"{base} {number}" for number in range(2, 20)]]


def create_exercise_copy(db: Session, user: User, snapshot: dict, author: User | None) -> Exercise | None:
    name = next((candidate for candidate in copy_names(snapshot, author) if not name_taken(db, user, candidate)), None)
    if name is None:
        return None
    exercise = Exercise(
        user_id=user.id,
        name=name,
        muscle_group=snapshot["muscle_group"],
        equipment=snapshot["equipment"],
        grip=snapshot.get("grip"),
        is_unilateral=snapshot.get("is_unilateral", False),
        family=snapshot.get("family"),
        bodyweight_factor=snapshot.get("bodyweight_factor"),
        tracking=snapshot.get("tracking") or "reps",
        intensity=snapshot.get("intensity"),
        muscles=[ExerciseMuscle(muscle=m["muscle"], role=m["role"]) for m in snapshot.get("muscles", [])],
    )
    db.add(exercise)
    db.flush()
    return exercise


def matching_own_exercise(db: Session, user: User, snapshot: dict, author: User | None) -> Exercise | None:
    names = copy_names(snapshot, author)
    found = (
        db.query(Exercise)
        .filter(
            Exercise.user_id == user.id,
            func.lower(Exercise.name).in_([name.lower() for name in names]),
            Exercise.muscle_group == snapshot["muscle_group"],
            Exercise.equipment == snapshot["equipment"],
            func.coalesce(Exercise.tracking, "reps") == (snapshot.get("tracking") or "reps"),
        )
        .all()
    )
    order = {name.lower(): index for index, name in enumerate(names)}
    return min(found, key=lambda e: order[e.name.lower()], default=None)


def resolve_custom(db: Session, user: User, author: User | None, entry: dict, cache: dict) -> int | None:
    source_id = entry.get("exercise_id")
    if source_id in cache:
        return cache[source_id]
    data = entry.get("custom")
    if data is None and source_id and author is not None:
        source = db.get(Exercise, source_id)
        if source is not None and source.user_id == author.id:
            data = exercise_snapshot(source)
    if data is None:
        return None
    exercise = matching_own_exercise(db, user, data, author) or create_exercise_copy(db, user, data, author)
    cache[source_id] = exercise.id if exercise else None
    return cache[source_id]


def copy_exercise(db: Session, user: User, snapshot: dict, author: User) -> dict:
    exercise = create_exercise_copy(db, user, snapshot, author)
    if exercise is None:
        raise HTTPException(status_code=409, detail="Você já tem exercícios com esse nome.")
    db.commit()
    return {"kind": "exercise", "id": exercise.id, "name": exercise.name, "skipped": 0}


def copy_snapshot(db: Session, user: User, kind: str, snapshot: dict, author: User) -> dict:
    if kind == "exercise":
        return copy_exercise(db, user, snapshot, author)
    if kind == "workout":
        return copy_workout(db, user, snapshot, author)
    return copy_plan(db, user, snapshot, author)
