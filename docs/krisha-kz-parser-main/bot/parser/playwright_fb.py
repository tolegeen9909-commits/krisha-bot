"""Playwright fallback — used when the requests-based parser hits CAPTCHA."""
import asyncio
import logging
import os

import requests as _requests

from bot.parser.utils import normalize_phone

logger = logging.getLogger(__name__)

# Proxy for Playwright: socks5:// (not socks5h://) — Chromium format
_ALL_PROXY = (os.environ.get("ALL_PROXY") or os.environ.get("HTTPS_PROXY") or "").replace(
    "socks5h://", "socks5://"
)


def _extract_cookies(session: _requests.Session) -> list[dict]:
    """Convert requests.Session cookies to Playwright format."""
    result = []
    for cookie in session.cookies:
        result.append({
            "name": cookie.name,
            "value": cookie.value,
            "domain": cookie.domain or ".krisha.kz",
            "path": cookie.path or "/",
        })
    return result


async def fetch_phones_playwright(
    listing_url: str,
    session: _requests.Session | None = None,
) -> list[str]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error("Playwright not installed")
        return []

    try:
        proxy_config = {"server": _ALL_PROXY} if _ALL_PROXY else None
        cookies = _extract_cookies(session) if session else []

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, proxy=proxy_config)
            ctx = await browser.new_context(locale="ru-RU")

            if cookies:
                await ctx.add_cookies(cookies)
                logger.info("Playwright: injected %d cookies", len(cookies))

            page = await ctx.new_page()

            loop = asyncio.get_running_loop()
            phones_future: asyncio.Future[dict] = loop.create_future()

            async def on_response(resp):
                if "ajaxPhones" in resp.url and not phones_future.done():
                    try:
                        phones_future.set_result(await resp.json())
                    except Exception:
                        phones_future.set_result({})

            page.on("response", on_response)

            try:
                await page.goto(listing_url, wait_until="domcontentloaded", timeout=30_000)
                await page.click("button.show-phones, #tm-telephone-body", timeout=5_000)
                data = await asyncio.wait_for(phones_future, timeout=10)
                phones = [normalize_phone(p) for p in data.get("phones", []) if p]
                logger.info("Playwright: got %d phone(s) for %s", len(phones), listing_url)
                return phones
            except Exception as exc:
                logger.warning("Playwright fallback failed for %s: %s", listing_url, exc)
                return []
            finally:
                await browser.close()
    except Exception as exc:
        logger.warning("Playwright not available: %s", exc)
        return []
