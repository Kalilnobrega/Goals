def superset_numbers(values: list) -> list:
    result = [None] * len(values)
    number = 0
    index = 0
    while index < len(values):
        value = values[index]
        end = index + 1
        while value is not None and end < len(values) and values[end] == value:
            end += 1
        if value is not None and end - index >= 2:
            number += 1
            for position in range(index, end):
                result[position] = number
        index = end
    return result


def normalize_supersets(items) -> None:
    ordered = sorted(items, key=lambda item: item.position)
    values = [None if (getattr(item, "tracking", None) or "reps") == "cardio" else item.superset for item in ordered]
    for item, number in zip(ordered, superset_numbers(values)):
        item.superset = number
