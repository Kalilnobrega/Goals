from app.fitness_models import SetEntry

WALK_RUN_METS = [(3.2, 2.8), (4.8, 3.5), (5.6, 4.3), (6.4, 5.0), (8.0, 8.3), (9.7, 9.8), (11.3, 11.0), (12.9, 11.8), (14.5, 12.8), (16.1, 14.5)]
SPEED_BASED = ("esteira", "corrida", "caminhada")
DEVICE_METS = [("bicicleta", 6.8), ("bike", 6.8), ("spinning", 8.5), ("elíptico", 5.0), ("eliptico", 5.0), ("escada", 9.0), ("remo", 7.0), ("corda", 11.8)]
TREADMILL_MET = 5.0
DEFAULT_MET = 6.0


def speed_met(speed: float) -> float:
    if speed <= WALK_RUN_METS[0][0]:
        return WALK_RUN_METS[0][1]
    for (low_speed, low_met), (high_speed, high_met) in zip(WALK_RUN_METS, WALK_RUN_METS[1:]):
        if speed <= high_speed:
            return low_met + (high_met - low_met) * (speed - low_speed) / (high_speed - low_speed)
    return WALK_RUN_METS[-1][1]


def entry_speed(entry: SetEntry) -> float | None:
    if entry.speed_kmh:
        return float(entry.speed_kmh)
    if entry.distance_km and entry.duration_seconds:
        return float(entry.distance_km) / (entry.duration_seconds / 3600)
    return None


def cardio_met(name: str, entry: SetEntry) -> float:
    lowered = (name or "").lower()
    if any(key in lowered for key in SPEED_BASED):
        speed = entry_speed(entry)
        return speed_met(speed) if speed else TREADMILL_MET
    for key, met in DEVICE_METS:
        if key in lowered:
            return met
    return DEFAULT_MET


def entry_calories(name: str, entry: SetEntry, weight_kg: float) -> tuple[float | None, bool]:
    if entry.calories:
        return float(entry.calories), False
    if not weight_kg or not entry.duration_seconds:
        return None, True
    return cardio_met(name, entry) * weight_kg * entry.duration_seconds / 3600, True


def entry_distance(entry: SetEntry) -> tuple[float, bool]:
    if entry.distance_km:
        return float(entry.distance_km), False
    if entry.speed_kmh and entry.duration_seconds:
        return float(entry.speed_kmh) * entry.duration_seconds / 3600, True
    return 0.0, False


def cardio_numbers(name: str, entries, weight_kg: float) -> dict:
    km = 0.0
    km_estimated = False
    calories = 0.0
    has_calories = False
    calories_estimated = False
    speeds = []
    levels = []
    for entry in entries:
        if entry.level:
            levels.append(entry.level)
        distance, guessed = entry_distance(entry)
        km += distance
        km_estimated = km_estimated or (guessed and distance > 0)
        value, guessed = entry_calories(name, entry, weight_kg)
        if value is not None:
            calories += value
            has_calories = True
            calories_estimated = calories_estimated or guessed
        speed = entry_speed(entry)
        if speed:
            speeds.append(speed)
    return {
        "km": round(km, 2),
        "km_estimated": km_estimated,
        "calories": round(calories) if has_calories else None,
        "calories_estimated": calories_estimated,
        "max_speed": round(max(speeds), 1) if speeds else None,
        "level": max(levels) if levels else None,
    }
