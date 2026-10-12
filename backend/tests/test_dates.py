from datetime import date, datetime, timezone

from app.dates import today_br


def test_today_br_before_midnight_in_brasilia_is_previous_utc_day():
    assert today_br(datetime(2026, 10, 12, 1, 30, tzinfo=timezone.utc)) == date(2026, 10, 11)


def test_today_br_after_midnight_in_brasilia():
    assert today_br(datetime(2026, 10, 12, 3, 0, tzinfo=timezone.utc)) == date(2026, 10, 12)
