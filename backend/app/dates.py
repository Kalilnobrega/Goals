from datetime import date, datetime, time, timedelta, timezone

BRT = timezone(timedelta(hours=-3))


def today_br(now: datetime | None = None) -> date:
    now = now or datetime.now(timezone.utc)
    return now.astimezone(BRT).date()


def to_br_date(dt: datetime) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(BRT).date()


def br_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=BRT).astimezone(timezone.utc)


def count_weekdays(start: date, end: date, weekdays: list[int]) -> int:
    if end < start:
        return 0
    wanted = set(weekdays)
    total_days = (end - start).days + 1
    full_weeks, rest = divmod(total_days, 7)
    count = full_weeks * len(wanted)
    for offset in range(rest):
        if (start + timedelta(days=full_weeks * 7 + offset)).weekday() in wanted:
            count += 1
    return count


def last_scheduled_day(after: date, until: date, weekdays: list[int]) -> date | None:
    wanted = set(weekdays)
    day = until
    while day > after and (until - day).days < 7:
        if day.weekday() in wanted:
            return day
        day -= timedelta(days=1)
    return None
