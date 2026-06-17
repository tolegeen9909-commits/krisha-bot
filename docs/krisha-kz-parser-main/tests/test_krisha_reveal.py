"""Тесты reveal-флоу с inline-решением reCAPTCHA v2 (bot/parser/krisha.py)."""
import pytest

from bot.parser import recaptcha
from bot.parser.krisha import (
    _fetch_phones_sync,
    AJAX_PHONES_URL,
    CaptchaError,
    SolveBudgetExhausted,
)
from bot.parser.recaptcha import SolveBudget

LISTING = "https://krisha.kz/a/show/761452389"
ADVERT = "761452389"


class _Resp:
    def __init__(self, json_data=None, status=200):
        self._json = json_data or {}
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._json


class _FakeSession:
    """Отдаёт заранее заготовленные ответы по очереди и пишет историю вызовов."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.ajax_calls = []  # params каждого вызова ajaxPhones

    def get(self, url, params=None, headers=None, timeout=None):
        if url == AJAX_PHONES_URL:
            self.ajax_calls.append(params or {})
        return self._responses.pop(0)


def test_phone_on_first_try_no_solve(monkeypatch):
    called = {"solve": False}
    monkeypatch.setattr(
        recaptcha, "solve_v2",
        lambda *a, **k: called.__setitem__("solve", True) or "tok",
    )
    s = _FakeSession([
        _Resp(),                                  # страница объявления
        _Resp({"phones": ["+7 701 000 11 22"]}),  # ajaxPhones сразу с номером
    ])

    phones = _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(5))

    assert phones == ["+77010001122"]
    assert called["solve"] is False              # solver не дёргали — бесплатно
    assert len(s.ajax_calls) == 1


def test_v2_solved_then_phone(monkeypatch):
    monkeypatch.setattr(recaptcha, "solve_v2", lambda site_key, url: "TOKEN_V2")
    s = _FakeSession([
        _Resp(),                                                       # страница
        _Resp({"phones": [], "gRecaptcha": {"siteKey": "6Lc2jVAs"}}),  # челлендж v2
        _Resp({"phones": ["8 (777) 123-45-67"]}),                      # после решения
    ])

    phones = _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(5))

    assert phones == ["+77771234567"]
    # второй ajax ушёл с решённым токеном в gRecaptchaResponse
    assert s.ajax_calls[1]["gRecaptchaResponse"] == "TOKEN_V2"
    assert s.ajax_calls[1]["id"] == ADVERT


def test_grecaptcha_without_sitekey_raises():
    s = _FakeSession([
        _Resp(),
        _Resp({"phones": [], "gRecaptcha": {"scriptUrl": "x"}}),  # нет siteKey
    ])
    with pytest.raises(CaptchaError):
        _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(5))


def test_empty_without_captcha_returns_empty():
    s = _FakeSession([
        _Resp(),
        _Resp({"phones": []}),  # нет номера и нет капчи
    ])
    assert _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(5)) == []


def test_budget_exhausted_raises_before_solve(monkeypatch):
    called = {"solve": False}
    monkeypatch.setattr(
        recaptcha, "solve_v2",
        lambda *a, **k: called.__setitem__("solve", True) or "tok",
    )
    s = _FakeSession([
        _Resp(),
        _Resp({"phones": [], "gRecaptcha": {"siteKey": "K"}}),
    ])

    with pytest.raises(SolveBudgetExhausted):
        _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(0))  # бюджет 0
    assert called["solve"] is False  # платный solve не вызывался


def test_solver_failure_becomes_captcha_error(monkeypatch):
    def _boom(site_key, url):
        raise recaptcha.Solver2CaptchaError("no balance")
    monkeypatch.setattr(recaptcha, "solve_v2", _boom)
    s = _FakeSession([
        _Resp(),
        _Resp({"phones": [], "gRecaptcha": {"siteKey": "K"}}),
    ])
    with pytest.raises(CaptchaError):
        _fetch_phones_sync(s, LISTING, ADVERT, SolveBudget(5))
