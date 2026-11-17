from typing import Literal

REGIONS = {
    "trunk": ["chest", "back", "abs"],
    "arms": ["shoulders", "biceps", "triceps", "forearms"],
    "legs": ["quads", "hamstrings", "glutes", "adductors", "calves"],
}

MUSCLES = {
    "chest_upper": "chest",
    "chest_mid": "chest",
    "chest_lower": "chest",
    "lats": "back",
    "traps_upper": "back",
    "traps_mid": "back",
    "rhomboids": "back",
    "lower_back": "back",
    "abs_rectus": "abs",
    "obliques": "abs",
    "delts_front": "shoulders",
    "delts_side": "shoulders",
    "delts_rear": "shoulders",
    "biceps": "biceps",
    "brachialis": "biceps",
    "triceps_long": "triceps",
    "triceps_lateral": "triceps",
    "triceps_medial": "triceps",
    "brachioradialis": "forearms",
    "forearm_flexors": "forearms",
    "forearm_extensors": "forearms",
    "rectus_femoris": "quads",
    "vastus_lateralis": "quads",
    "vastus_medialis": "quads",
    "biceps_femoris": "hamstrings",
    "semitendinosus": "hamstrings",
    "glute_max": "glutes",
    "glute_med": "glutes",
    "adductors": "adductors",
    "gastrocnemius": "calves",
    "soleus": "calves",
}

MuscleKey = Literal[
    "chest_upper", "chest_mid", "chest_lower",
    "lats", "traps_upper", "traps_mid", "rhomboids", "lower_back",
    "abs_rectus", "obliques",
    "delts_front", "delts_side", "delts_rear",
    "biceps", "brachialis",
    "triceps_long", "triceps_lateral", "triceps_medial",
    "brachioradialis", "forearm_flexors", "forearm_extensors",
    "rectus_femoris", "vastus_lateralis", "vastus_medialis",
    "biceps_femoris", "semitendinosus",
    "glute_max", "glute_med",
    "adductors",
    "gastrocnemius", "soleus",
]

MuscleRole = Literal["primary", "secondary"]

ROLE_CREDIT = {"primary": 1.0, "secondary": 0.5}


def muscle_credit(muscles: list[dict]) -> dict[str, float]:
    credit: dict[str, float] = {}
    for item in muscles or []:
        value = ROLE_CREDIT[item["role"]]
        credit[item["muscle"]] = max(credit.get(item["muscle"], 0.0), value)
    return credit


def group_credit(muscles: list[dict]) -> dict[str, float]:
    credit: dict[str, float] = {}
    for muscle, value in muscle_credit(muscles).items():
        group = MUSCLES[muscle]
        credit[group] = max(credit.get(group, 0.0), value)
    return credit
