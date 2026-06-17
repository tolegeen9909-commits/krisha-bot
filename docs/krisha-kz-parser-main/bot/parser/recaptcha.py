"""Решение reCAPTCHA v2 через 2captcha.

krisha.kz отдаёт показ телефона через каскад reCAPTCHA v3 → v2 (см.
docs/specs/2026-06-07-browser-phone-reveal.md). v3-скоринг requests-сессии низкий,
поэтому сервер требует решить v2-челлендж. Здесь — решение v2 и возврат токена,
который вызывающий код передаёт в `ajaxPhones?...&gRecaptchaResponse=<token>`.
"""
import contextlib
import logging
import os

from bot.secrets import get_twocaptcha_key

logger = logging.getLogger(__name__)

_PROXY_ENV = ("ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy")


@contextlib.contextmanager
def _no_proxy_env():
    """Временно убрать прокси из окружения: запрос к 2captcha.com должен идти НАПРЯМУЮ,
    а не через KZ-туннель (туннель рвёт TLS к 2captcha). Через туннель ходит только krisha."""
    saved = {k: os.environ.pop(k) for k in _PROXY_ENV if k in os.environ}
    try:
        yield
    finally:
        os.environ.update(saved)

# Таймаут ожидания решения от воркеров 2captcha (сек). reCAPTCHA обычно 15-60с.
_SOLVE_TIMEOUT = 180
_POLL_INTERVAL = 5

_solver = None


class Solver2CaptchaError(Exception):
    """Не удалось решить reCAPTCHA через 2captcha (таймаут/ошибка/нет баланса)."""


class SolveBudget:
    """Лимит платных solve 2captcha на один прогон задания — защита от лавины затрат.

    В headless v3-скоринг низкий → v2-челлендж почти на каждом объявлении, поэтому без
    лимита один прогон по большому фильтру = сотни платных solve. `try_consume()` отдаёт
    False, когда лимит исчерпан, и вызывающий код останавливает прогон.
    """

    def __init__(self, limit: int):
        self.limit = limit
        self.remaining = limit

    def try_consume(self) -> bool:
        if self.remaining <= 0:
            return False
        self.remaining -= 1
        return True


def _get_solver():
    """Ленивая инициализация клиента 2captcha — ключ из KV тянем только при первом solve."""
    global _solver
    if _solver is None:
        from twocaptcha import TwoCaptcha
        _solver = TwoCaptcha(
            get_twocaptcha_key(),
            defaultTimeout=_SOLVE_TIMEOUT,
            pollingInterval=_POLL_INTERVAL,
        )
    return _solver


def solve_v2(site_key: str, page_url: str) -> str:
    """Решить reCAPTCHA v2 (checkbox/normal) и вернуть g-recaptcha-response токен.

    Raises Solver2CaptchaError при любой ошибке решения.
    """
    solver = _get_solver()
    logger.info("2captcha: решаю v2 sitekey=%s url=%s", site_key, page_url)
    try:
        with _no_proxy_env():  # 2captcha — напрямую, мимо KZ-туннеля
            result = solver.recaptcha(sitekey=site_key, url=page_url)
    except Exception as exc:  # twocaptcha бросает свои исключения (ApiException, TimeoutException...)
        raise Solver2CaptchaError(f"2captcha solve failed: {exc}") from exc

    token = result.get("code") if isinstance(result, dict) else None
    if not token:
        raise Solver2CaptchaError(f"2captcha вернул пустой токен: {result!r}")
    logger.info("2captcha: токен получен (%d симв.)", len(token))
    return token
