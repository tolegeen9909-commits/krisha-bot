"""
Authenticate with krisha.kz via password and save session cookies.
Uses id.kolesa.kz login.json (password-based, no SMS required).

Run when session expires:
    python3 scripts/save-session.py              # account 1
    python3 scripts/save-session.py --account 2  # account 2

Through KZ proxy (when IP-blocked):
    ALL_PROXY=socks5h://localhost:1080 python3 scripts/save-session.py --account 1
    ALL_PROXY=socks5h://localhost:1080 python3 scripts/save-session.py --account 2

Credentials are read from Azure Key Vault (az CLI must be logged in to kv-bronxtc-dev).
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from urllib.parse import unquote

import requests

KV_VAULT = "kv-bronxtc-dev"

_KV_LOGIN = {1: "krisha-bot--prod--KRISHA-LOGIN", 2: "krisha-bot--prod--KRISHA-LOGIN-2"}
_KV_PASSWORD = {1: "krisha-bot--prod--KRISHA-PASSWORD", 2: "krisha-bot--prod--KRISHA-PASSWORD-2"}
_KV_COOKIES = {1: "krisha-bot--prod--KRISHA-SESSION-COOKIES", 2: "krisha-bot--prod--KRISHA-SESSION-COOKIES-2"}
_LOCAL_COOKIES = {1: ".session-cookies.json", 2: ".session-cookies-2.json"}

# Proxy: picked up automatically by requests via env var.
# For Playwright we read it explicitly.
_PROXY = os.environ.get("ALL_PROXY") or os.environ.get("HTTPS_PROXY")


def _kv_get(secret_name: str) -> str:
    r = subprocess.run(
        ["az", "keyvault", "secret", "show",
         "--vault-name", KV_VAULT, "--name", secret_name,
         "--query", "value", "-o", "tsv"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"KV read failed: {r.stderr.strip()}")
    return r.stdout.strip()


def _kv_set(secret_name: str, value: str) -> None:
    r = subprocess.run(
        ["az", "keyvault", "secret", "set",
         "--vault-name", KV_VAULT, "--name", secret_name,
         "--value", value, "--output", "none"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"KV write failed: {r.stderr.strip()}")


async def _grab_cookies_playwright(krisha_url: str, kolesa_cookies: dict) -> list:
    """Use headless Playwright to follow the JS redirect and collect krisha.kz cookies."""
    from playwright.async_api import async_playwright

    # Playwright needs socks5:// not socks5h://
    pw_proxy = _PROXY.replace("socks5h://", "socks5://") if _PROXY else None
    proxy_config = {"server": pw_proxy} if pw_proxy else None
    if proxy_config:
        print(f"Playwright using proxy: {_PROXY}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, proxy=proxy_config)
        ctx = await browser.new_context(locale="ru-RU")
        for name, value in kolesa_cookies.items():
            await ctx.add_cookies([{
                "name": name, "value": value,
                "domain": ".kolesa.kz", "path": "/"
            }])
        page = await ctx.new_page()
        await page.goto(krisha_url, wait_until="networkidle", timeout=20_000)
        cookies = await ctx.cookies()
        await browser.close()
    return cookies


def authenticate(account_id: int) -> list:
    print(f"Account {account_id}: reading credentials from Key Vault...")
    phone = _kv_get(_KV_LOGIN[account_id])
    password = _kv_get(_KV_PASSWORD[account_id])
    print(f"Login: {phone}")
    if _PROXY:
        print(f"Using proxy: {_PROXY}")

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ru-RU,ru;q=0.9",
    })
    # requests auto-reads ALL_PROXY / HTTPS_PROXY from env — no extra config needed

    # Step 1: get CSRF token
    r = session.get(
        "https://id.kolesa.kz/login/?destination=https://krisha.kz/my",
        timeout=10,
    )
    m = re.search(r'name="csrf"\s+value="([^"]+)"', r.text)
    csrf = m.group(1) if m else ""
    if not csrf:
        raise RuntimeError("Could not extract CSRF token from login page")

    # Step 2: password login
    r2 = session.post(
        "https://id.kolesa.kz/login.json?destination=https://krisha.kz/my",
        data={"login": phone, "password": password, "csrf": csrf, "project": "krisha"},
        headers={
            "Referer": "https://id.kolesa.kz/login/",
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=10,
    )
    data = r2.json()
    back_url = data.get("backUrl", "")
    if not back_url:
        raise RuntimeError(f"Login failed — no backUrl in response: {data}")
    print("Login successful, following redirect...")

    # Step 3: extract krisha.kz token URL
    m2 = re.search(r'redirectUrl=([^&]+)', back_url)
    krisha_url = unquote(m2.group(1)) if m2 else ""
    if not krisha_url:
        raise RuntimeError(f"Could not parse redirectUrl from: {back_url}")

    kolesa_cookies = {c.name: c.value for c in session.cookies}

    # Step 4: Playwright follows the JS redirect, collects krisha.kz cookies
    cookies = asyncio.run(_grab_cookies_playwright(krisha_url, kolesa_cookies))
    krisha_cookies = [c for c in cookies if "krisha" in c.get("domain", "")]
    print(f"Collected {len(cookies)} cookies ({len(krisha_cookies)} from krisha.kz)")
    return cookies


def verify_cookies(cookies: list) -> bool:
    """Quick check that cookies work by fetching a phone number."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Encoding": "gzip, deflate",
    })
    for c in cookies:
        if "krisha" in c.get("domain", ""):
            session.cookies.set(c["name"], c["value"], domain=c["domain"])

    # Find a live advert from the search page
    r = session.get("https://krisha.kz/prodazha/kvartiry/almaty/", timeout=15)
    ids = re.findall(r'/a/show/(\d+)', r.text)
    if not ids:
        print("Verification: no listings found (HTML may differ)")
        return False

    aid = ids[0]
    listing_url = f"https://krisha.kz/a/show/{aid}"
    session.get(listing_url, timeout=10)
    import time; time.sleep(2)  # human-like delay
    rp = session.get(
        "https://krisha.kz/a/ajaxPhones",
        params={"id": aid},
        headers={"X-Requested-With": "XMLHttpRequest", "Referer": listing_url},
        timeout=10,
    )
    data = rp.json()
    if data.get("phones"):
        print(f"Verification OK — advert {aid}: {data['phones']}")
        return True
    print(f"Verification FAILED — advert {aid}: {rp.text[:100]}")
    return False


def save_cookies(cookies: list, account_id: int) -> None:
    cookies_json = json.dumps(cookies)
    kv_secret = _KV_COOKIES[account_id]
    local_file = _LOCAL_COOKIES[account_id]

    try:
        _kv_set(kv_secret, cookies_json)
        print(f"Cookies saved to Key Vault: {kv_secret}")
    except Exception as e:
        print(f"Key Vault save failed ({e}), falling back to local file")

    with open(local_file, "w") as f:
        f.write(cookies_json)
    print(f"Cookies saved to {local_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", type=int, choices=[1, 2], default=1,
                        help="Account ID to refresh (default: 1)")
    parser.add_argument("--no-verify", action="store_true",
                        help="Skip cookie verification (2 extra requests)")
    args = parser.parse_args()

    cookies = authenticate(args.account)
    if not args.no_verify:
        if not verify_cookies(cookies):
            print("WARNING: cookie verification failed — saving anyway")
    save_cookies(cookies, args.account)
    print("Done.")
