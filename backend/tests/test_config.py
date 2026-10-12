import pytest

from app.main import require_env


def test_require_env_returns_value(monkeypatch):
    monkeypatch.setenv("GOALS_TEST_VAR", "abc")
    assert require_env("GOALS_TEST_VAR") == "abc"


def test_require_env_names_missing_variable(monkeypatch):
    monkeypatch.delenv("GOALS_TEST_VAR", raising=False)
    with pytest.raises(RuntimeError, match="GOALS_TEST_VAR"):
        require_env("GOALS_TEST_VAR")
