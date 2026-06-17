"""Тесты ротации аккаунтов и бюджета solve в scheduler.run_task (сценарий 4 ТЗ).

Весь внешний слой (БД, сеть, парсер) замокан — проверяется только управляющая логика.
asyncio.run используется напрямую, чтобы не тащить pytest-asyncio.
"""
import asyncio
import types

from bot.models import TaskStatus
from bot.parser.krisha import CaptchaError, SolveBudgetExhausted
import bot.scheduler as sched


class _Ctx:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, *a):
        return False


def _aret(value):
    async def _f(*a, **k):
        return value
    return _f


async def _anoop(*a, **k):
    return None


def _setup(monkeypatch, accounts, fetch_impl):
    rec = {"prepared": [], "closed": [], "created": [], "saved": []}

    monkeypatch.setattr(sched, "list_account_ids", lambda: accounts)

    def _prep(acc):
        rec["prepared"].append(acc)
        return types.SimpleNamespace(account=acc, close=lambda: rec["closed"].append(acc))
    monkeypatch.setattr(sched, "prepare_session", _prep)

    async def _iter(search_url, http_session):
        for item in [("https://krisha.kz/a/show/1", "1")]:
            yield item
    monkeypatch.setattr(sched, "iter_listing_urls", _iter)
    monkeypatch.setattr(sched, "fetch_phones", fetch_impl)
    monkeypatch.setattr(sched, "SessionFactory", lambda: _Ctx())

    fake_task = types.SimpleNamespace(status=TaskStatus.active, url="http://x", id=7)
    monkeypatch.setattr(sched, "task_service", types.SimpleNamespace(
        get_task=_aret(fake_task), update_last_run=_anoop,
    ))

    async def _listing_exists(session, task_id, advert):
        return False

    async def _get_or_create(session, task_id, advert, url):
        rec["created"].append(advert)
        return types.SimpleNamespace(id=10), True

    async def _save(session, task_id, listing_id, phones):
        rec["saved"].extend(phones)
        return len(phones)

    monkeypatch.setattr(sched, "phone_service", types.SimpleNamespace(
        listing_exists=_listing_exists,
        get_or_create_listing=_get_or_create,
        save_phones=_save,
    ))
    return rec


def test_rotation_succeeds_on_second_account(monkeypatch):
    async def fetch(session, url, advert, budget):
        if session.account == 1:
            raise CaptchaError("v2 не прошли на аккаунте 1")
        return ["+77770000000"]

    rec = _setup(monkeypatch, [1, 2], fetch)
    asyncio.run(sched.run_task(7))

    assert rec["prepared"] == [1, 2]          # была ротация на второй аккаунт
    assert rec["created"] == ["1"]            # listing создан после успеха
    assert rec["saved"] == ["+77770000000"]   # телефон сохранён


def test_single_account_no_rotation_skips_listing(monkeypatch):
    async def fetch(session, url, advert, budget):
        raise CaptchaError("капча, один аккаунт")

    rec = _setup(monkeypatch, [1], fetch)
    asyncio.run(sched.run_task(7))

    assert rec["prepared"] == [1]   # второй сессии не создавали (нет фиктивной ротации)
    assert rec["created"] == []     # listing НЕ создан → объявление перепробуется
    assert rec["saved"] == []


def test_budget_exhausted_breaks_run(monkeypatch):
    async def fetch(session, url, advert, budget):
        raise SolveBudgetExhausted("лимит solve исчерпан")

    rec = _setup(monkeypatch, [1, 2], fetch)
    asyncio.run(sched.run_task(7))

    assert rec["created"] == []   # прогон прерван, listing не создан
    assert rec["saved"] == []
