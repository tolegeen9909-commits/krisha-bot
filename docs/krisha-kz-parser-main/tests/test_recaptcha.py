"""Тесты 2captcha-солвера и бюджета solve (bot/parser/recaptcha.py)."""
import pytest

from bot.parser import recaptcha
from bot.parser.recaptcha import SolveBudget, Solver2CaptchaError, solve_v2


class _FakeSolver:
    def __init__(self, result=None, exc=None):
        self._result = result
        self._exc = exc
        self.calls = []

    def recaptcha(self, **kwargs):
        self.calls.append(kwargs)
        if self._exc:
            raise self._exc
        return self._result


def test_solve_v2_returns_token(monkeypatch):
    fake = _FakeSolver(result={"code": "TOKEN123", "captchaId": "1"})
    monkeypatch.setattr(recaptcha, "_get_solver", lambda: fake)

    token = solve_v2("site-key-abc", "https://krisha.kz/a/show/1")

    assert token == "TOKEN123"
    # sitekey и url прокинуты в SDK
    assert fake.calls[0]["sitekey"] == "site-key-abc"
    assert fake.calls[0]["url"] == "https://krisha.kz/a/show/1"


def test_solve_v2_empty_code_raises(monkeypatch):
    monkeypatch.setattr(recaptcha, "_get_solver", lambda: _FakeSolver(result={"code": ""}))
    with pytest.raises(Solver2CaptchaError):
        solve_v2("k", "https://krisha.kz/a/show/1")


def test_solve_v2_sdk_exception_wrapped(monkeypatch):
    monkeypatch.setattr(
        recaptcha, "_get_solver", lambda: _FakeSolver(exc=RuntimeError("timeout"))
    )
    with pytest.raises(Solver2CaptchaError):
        solve_v2("k", "https://krisha.kz/a/show/1")


def test_solve_budget_counts_down():
    b = SolveBudget(2)
    assert b.try_consume() is True
    assert b.try_consume() is True
    assert b.try_consume() is False  # исчерпан
    assert b.remaining == 0


def test_solve_budget_zero_blocks_immediately():
    assert SolveBudget(0).try_consume() is False
