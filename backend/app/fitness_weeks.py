from datetime import date, timedelta

WEEK = timedelta(days=7)


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def week_runs(weeks, today: date) -> tuple[int, list[list[date]]]:
    runs: list[list[date]] = []
    for week in sorted(set(weeks)):
        if runs and week - runs[-1][-1] == WEEK:
            runs[-1].append(week)
        else:
            runs.append([week])
    this_week = week_start(today)
    current_end = this_week if runs and runs[-1][-1] == this_week else this_week - WEEK
    current = len(runs[-1]) if runs and runs[-1][-1] == current_end else 0
    return current, runs
