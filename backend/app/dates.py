from datetime import date, datetime, timedelta, timezone

BRT = timezone(timedelta(hours=-3))


def today_br(now: datetime | None = None) -> date:
    now = now or datetime.now(timezone.utc)
    return now.astimezone(BRT).date()
