import asyncio
import logging
import re
from typing import AsyncIterator

import requests

from bot.parser.human import build_session, delay_between_listings, delay_between_pages
from bot.parser.utils import normalize_phone

logger = logging.getLogger(__name__)

BASE_URL = "https://krisha.kz"
AJAX_PHONES_URL = BASE_URL + "/a/ajaxPhones"


class CaptchaError(Exception):
    """Raised when ajaxPhones returns a reCAPTCHA challenge we couldn't pass."""


class SolveBudgetExhausted(CaptchaError):
    """Лимит платных solve за прогон исчерпан — прогон надо остановить, а не ротировать."""


def _inject_cookies(session: requests.Session, cookies: list[dict]) -> None:
    """Load Playwright-format cookies into a requests session."""
    for c in cookies:
        domain = c.get("domain", "")
        if not domain:
            continue
        # Playwright cookies with domain ".krisha.kz" or "krisha.kz" or "id.kolesa.kz"
        if "krisha" not in domain and "kolesa" not in domain:
            continue
        session.cookies.set(c["name"], c["value"], domain=domain)
    logger.info("Injected %d cookies into session", len(session.cookies))


def _load_and_inject_cookies(session: requests.Session, account_id: int = 1) -> bool:
    """Load saved session cookies from Key Vault / local file and inject them."""
    try:
        from bot.secrets import get_session_cookies
        cookies = get_session_cookies(account_id)
        _inject_cookies(session, cookies)
        return True
    except Exception as exc:
        logger.warning("No saved session cookies for account %d: %s", account_id, exc)
        return False


def _parse_listing_urls(html: str) -> list[str]:
    advert_ids = re.findall(r'/a/show/(\d+)', html)
    seen = dict.fromkeys(advert_ids)  # deduplicate, preserve order
    return [f"{BASE_URL}/a/show/{aid}" for aid in seen]


def _has_next_page(html: str, current_page: int) -> bool:
    return f"page={current_page + 1}" in html


def _extract_advert_id(url: str) -> str | None:
    m = re.search(r"/a/show/(\d+)", url)
    return m.group(1) if m else None


def _ajax_phones(
    session: requests.Session,
    advert_id: str,
    listing_url: str,
    extra_params: dict | None = None,
) -> dict:
    """GET /a/ajaxPhones?id=<id>[&...]. X-Requested-With только на этом AJAX-вызове."""
    params = {"id": advert_id}
    if extra_params:
        params.update(extra_params)
    r = session.get(
        AJAX_PHONES_URL,
        params=params,
        headers={
            "Referer": listing_url,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _extract_phones(data: dict) -> list[str]:
    return [normalize_phone(p) for p in data.get("phones", []) if p]


def _fetch_phones_sync(
    session: requests.Session, listing_url: str, advert_id: str, budget=None
) -> list[str]:
    # First request — listing page to set cookies / referer context
    resp = session.get(listing_url, timeout=15)
    resp.raise_for_status()

    # Попытка 1: браузер-native v3 не у нас, поэтому обычно прилетает gRecaptcha (v2-челлендж).
    data = _ajax_phones(session, advert_id, listing_url)
    phones = _extract_phones(data)
    if phones:
        return phones

    grecaptcha = data.get("gRecaptcha")
    if not grecaptcha:
        # Нет телефона и нет капчи: объявление без номера ЛИБО протухшая сессия
        # (редирект на логин маскируется под пустой ответ). Логируем для диагностики.
        logger.warning(
            "advert %s: пустой ответ без gRecaptcha — нет номера или протухла сессия",
            advert_id,
        )
        return []

    site_key = grecaptcha.get("siteKey") if isinstance(grecaptcha, dict) else None
    if not site_key:
        raise CaptchaError(f"gRecaptcha без siteKey для advert {advert_id}: {grecaptcha!r}")

    # Лимит платных solve за прогон: если исчерпан — останавливаем прогон, не платим.
    if budget is not None and not budget.try_consume():
        raise SolveBudgetExhausted(
            f"Лимит solve за прогон исчерпан, пропускаю advert {advert_id}"
        )

    # Решаем v2 через 2captcha и повторяем reveal с токеном в gRecaptchaResponse.
    from bot.parser.recaptcha import solve_v2, Solver2CaptchaError
    try:
        token = solve_v2(site_key, listing_url)
    except Solver2CaptchaError as exc:
        logger.warning("2captcha не решил капчу для advert %s: %s", advert_id, exc)
        raise CaptchaError(f"2captcha solve failed for advert {advert_id}") from exc

    data = _ajax_phones(
        session, advert_id, listing_url, extra_params={"gRecaptchaResponse": token}
    )
    phones = _extract_phones(data)
    if phones:
        return phones

    # Капчу решили, но телефон не отдали — возможно нужен валидный v3Token или бан сессии.
    raise CaptchaError(f"Телефон не получен после решения v2 для advert {advert_id}")


def prepare_session(account_id: int = 1) -> requests.Session:
    """Build a session with saved cookies injected. Use one per full parse run."""
    session = build_session()
    _load_and_inject_cookies(session, account_id=account_id)
    return session


async def iter_listing_urls(
    search_url: str, session: requests.Session
) -> AsyncIterator[tuple[str, str]]:
    """
    Yield (listing_url, advert_id) for every listing in the search results.
    Pass the session from prepare_session() — the same one used for fetch_phones.
    """
    page = 1

    while True:
        url = f"{search_url}{'&' if '?' in search_url else '?'}page={page}"
        logger.info("Fetching page %d: %s", page, url)

        try:
            resp = await asyncio.to_thread(session.get, url, timeout=15)
            # krisha.kz returns HTTP 404 for some district pages (soft 404)
            # but still includes valid listing HTML — treat 404 same as 200
            if resp.status_code not in (200, 404):
                resp.raise_for_status()
        except Exception as exc:
            logger.warning("Failed to fetch page %d: %s", page, exc)
            break

        html = resp.text
        listing_urls = _parse_listing_urls(html)
        logger.info("Page %d: found %d listings", page, len(listing_urls))

        for listing_url in listing_urls:
            advert_id = _extract_advert_id(listing_url)
            if not advert_id:
                continue
            yield listing_url, advert_id
            await delay_between_listings()

        if not _has_next_page(html, page):
            break

        page += 1
        await delay_between_pages()


async def fetch_phones(
    session: requests.Session, listing_url: str, advert_id: str, budget=None
) -> list[str]:
    """Fetch phone numbers for a single listing using the provided session.
    Решает v2-капчу через 2captcha (с учётом budget). Raises CaptchaError, если
    капчу пройти не удалось, и SolveBudgetExhausted, если исчерпан лимит solve."""
    try:
        phones = await asyncio.to_thread(
            _fetch_phones_sync, session, listing_url, advert_id, budget
        )
        logger.info("Got %d phone(s) for advert %s", len(phones), advert_id)
        return phones
    except CaptchaError:
        raise  # CaptchaError/SolveBudgetExhausted → обрабатывает scheduler
    except Exception as exc:
        logger.warning("Failed to fetch phones for advert %s: %s", advert_id, exc)
        return []
