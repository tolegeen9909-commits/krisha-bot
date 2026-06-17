import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_KV_COOKIES_SECRET = "krisha-bot--prod--KRISHA-SESSION-COOKIES"
_LOCAL_COOKIES_FILE = ".session-cookies.json"


def _kv_client():
    kv_url = os.environ.get("AZURE_KEYVAULT_URL")
    if not kv_url:
        return None
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.secrets import SecretClient
    return SecretClient(vault_url=kv_url, credential=DefaultAzureCredential())


def _kv_secret_name(account_id: int) -> str:
    return _KV_COOKIES_SECRET if account_id == 1 else f"{_KV_COOKIES_SECRET}-{account_id}"


def _local_cookies_file(account_id: int) -> str:
    return _LOCAL_COOKIES_FILE if account_id == 1 else f".session-cookies-{account_id}.json"


def _secret_exists(client, secret_name: str) -> bool:
    import logging as _logging
    azure_log = _logging.getLogger("azure")
    prev = azure_log.level
    azure_log.setLevel(_logging.CRITICAL)  # suppress noisy credential errors during probe
    try:
        client.get_secret(secret_name)
        return True
    except Exception:
        return False
    finally:
        azure_log.setLevel(prev)


def list_account_ids() -> list[int]:
    """Return IDs of all configured accounts, e.g. [1, 2]."""
    ids = []
    client = _kv_client()
    for i in range(1, 10):
        secret = _kv_secret_name(i)
        local = _local_cookies_file(i)
        if (client and _secret_exists(client, secret)) or os.path.exists(local):
            ids.append(i)
    return ids or [1]  # fallback to account 1 so the bot always tries


def get_session_cookies(account_id: int = 1) -> list[dict[str, Any]]:
    """
    Return Playwright-format cookies for krisha.kz.
    Source priority: Azure Key Vault → local file.
    account_id=1 → default account; account_id=2 → second account, etc.
    To create cookies, run: python3 scripts/save-session.py
    """
    secret_name = _kv_secret_name(account_id)
    local_file = _local_cookies_file(account_id)

    client = _kv_client()
    if client:
        try:
            raw = client.get_secret(secret_name).value
            logger.info("Loaded session cookies for account %d from Key Vault", account_id)
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Could not load cookies for account %d from Key Vault (%s)", account_id, exc)

    if os.path.exists(local_file):
        with open(local_file) as f:
            logger.info("Loaded session cookies for account %d from local file", account_id)
            return json.loads(f.read())

    raise RuntimeError(
        f"No krisha.kz session cookies found for account {account_id}. "
        "Run: python3 scripts/save-session.py"
    )


def get_twocaptcha_key() -> str:
    """Return the 2captcha API key from Azure Key Vault (env fallback for local dev)."""
    client = _kv_client()
    if client:
        try:
            key = client.get_secret("krisha-bot--prod--TWOCAPTCHA-API-KEY").value
            logger.info("Loaded 2captcha API key from Key Vault")
            return key
        except Exception as exc:
            logger.warning("Key Vault unavailable for 2captcha key (%s), falling back to env", exc)

    key = os.environ.get("TWOCAPTCHA_API_KEY", "")
    if not key:
        raise RuntimeError(
            "2captcha API key not available. "
            "Set AZURE_KEYVAULT_URL (secret krisha-bot--prod--TWOCAPTCHA-API-KEY) "
            "or TWOCAPTCHA_API_KEY env var."
        )
    return key


def get_krisha_credentials() -> tuple[str, str]:
    """Return (login, password) for krisha.kz from Azure Key Vault or env fallback."""
    client = _kv_client()
    if client:
        try:
            login = client.get_secret("krisha-bot--prod--KRISHA-LOGIN").value
            password = client.get_secret("krisha-bot--prod--KRISHA-PASSWORD").value
            logger.info("Loaded krisha credentials from Key Vault")
            return login, password
        except Exception as exc:
            logger.warning("Key Vault unavailable (%s), falling back to env", exc)

    login = os.environ.get("KRISHA_LOGIN", "")
    password = os.environ.get("KRISHA_PASSWORD", "")
    if not login or not password:
        raise RuntimeError(
            "Krisha credentials not available. "
            "Set AZURE_KEYVAULT_URL or KRISHA_LOGIN/KRISHA_PASSWORD env vars."
        )
    return login, password
