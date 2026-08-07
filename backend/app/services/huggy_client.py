"""
HTTP client for the Huggy API v3.

Mirrors the only existing outbound-HTTP precedent in this codebase (the OpenAI call in
app/routers/leads.py: `async with httpx.AsyncClient()`, explicit timeout, Portuguese error
messages) and adds — scoped to Huggy only, without refactoring that call — the three things it
lacks: granular timeouts, retry with backoff on 429/5xx, and typed exceptions so routers can map
failures to meaningful status codes.

Token handling is lazy-refresh: there is no scheduler in this project and we are not adding one.
A 6-month token in a daily-use CRM gets exercised thousands of times inside the refresh window,
so refreshing on use is sufficient. `POST /api/huggy/oauth/refresh` is the manual escape hatch.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.services.settings_service import get_settings, update_settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.huggy.app/v3"
AUTH_AUTHORIZE_URL = "https://auth.huggy.app/oauth/authorize"
AUTH_TOKEN_URL = "https://auth.huggy.app/oauth/access_token"
OAUTH_SCOPE = "install_app read_agent_profile"

SETTINGS_KEY = "huggy_integration"

# Refresh proactively once the token is this close to expiring.
REFRESH_WINDOW = timedelta(days=7)
# Huggy documents a 6-month lifetime; used only when the response omits expires_in.
DEFAULT_TOKEN_LIFETIME = timedelta(days=180)

_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
_RETRY_DELAYS = (0.5, 1.5)

# Serializes token refresh so N concurrent callers cause one refresh, not N.
# Safe as a module-level lock because backend/Dockerfile runs a single uvicorn worker (no
# --workers). If that ever changes, this stops protecting the read-modify-write in
# update_settings and the refresh needs a DB-level guard instead.
_refresh_lock = asyncio.Lock()


class HuggyError(Exception):
    """Base for Huggy failures."""


class HuggyNotConfigured(HuggyError):
    """Credentials were never filled in, or the integration is disabled."""


class HuggyAuthError(HuggyError):
    """Token missing, rejected or impossible to refresh — a human must reconnect."""


class HuggyForbidden(HuggyError):
    """
    Huggy accepted the token but refused this particular resource (403).

    Deliberately separate from HuggyAuthError: a 403 says the credentials are fine and something
    about the resource is not allowed, so telling the user to reconnect sends them to fix an
    integration that is not broken. The clearest real case is a chat still inside the bot flow
    (`situation: "auto"`), whose messages Huggy simply does not expose over the API.
    """


class HuggyUnavailable(HuggyError):
    """Transport failure or a persistent 5xx from Huggy."""


class HuggyRequestError(HuggyError):
    """Huggy rejected the request itself (4xx that is not auth)."""

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


async def get_config() -> dict:
    return await get_settings(SETTINGS_KEY) or {}


async def save_config(patch: dict) -> dict:
    """Merges a patch into the stored config. Read-modify-write, hence the refresh lock."""
    config = await get_config()
    config.update(patch)
    await update_settings(SETTINGS_KEY, config)
    return config


def _expires_at(expires_in) -> str:
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        seconds = int(DEFAULT_TOKEN_LIFETIME.total_seconds())
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="seconds")


def _parse_expiry(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def days_to_expiry(config: dict) -> int | None:
    expiry = _parse_expiry(config.get("token_expires_at"))
    if not expiry:
        return None
    return (expiry - datetime.now(timezone.utc)).days


def _needs_refresh(config: dict) -> bool:
    # Without a refresh token there is nothing to renew: proactively "refreshing" would only
    # raise and make an otherwise valid pasted token unusable. Let a real 401 surface instead.
    if not (config.get("refresh_token") or "").strip():
        return False
    expiry = _parse_expiry(config.get("token_expires_at"))
    if not expiry:
        return False  # unknown expiry: let a 401 drive the refresh instead of guessing
    return expiry - datetime.now(timezone.utc) <= REFRESH_WINDOW


def build_authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    from urllib.parse import quote, urlencode

    # quote_via=quote so spaces become %20, matching the URL shape in Huggy's docs
    # (urlencode's default quote_plus would emit '+', which some OAuth servers reject).
    return AUTH_AUTHORIZE_URL + "?" + urlencode({
        "scope": OAUTH_SCOPE,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "state": state,
    }, quote_via=quote)


async def _post_token(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            response = await client.post(
                AUTH_TOKEN_URL,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        except httpx.RequestError as exc:
            raise HuggyUnavailable(f"Erro de comunicação com a Huggy: {exc}") from exc

    if response.status_code >= 400:
        hint = _extract_hint(response)
        logger.warning(
            "Huggy token endpoint respondeu %s: %s", response.status_code, response.text[:300]
        )
        raise HuggyAuthError(
            f"A Huggy recusou a troca de token (HTTP {response.status_code})"
            + (f": {hint}" if hint else "")
            + ". Confira client_id, client_secret e a redirect URI cadastrada."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise HuggyAuthError("Resposta inválida do endpoint de token da Huggy.") from exc


async def exchange_code(code: str, redirect_uri: str) -> dict:
    """Completes the authorization_code flow and persists the tokens."""
    config = await get_config()
    client_id = (config.get("client_id") or "").strip()
    client_secret = (config.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise HuggyNotConfigured("Preencha client_id e client_secret antes de conectar.")

    data = await _post_token({
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    })

    access_token = data.get("access_token")
    if not access_token:
        raise HuggyAuthError("A Huggy não retornou access_token.")

    return await save_config({
        "access_token": access_token,
        "refresh_token": data.get("refresh_token") or config.get("refresh_token") or "",
        "token_obtained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "token_expires_at": _expires_at(data.get("expires_in")),
        "enabled": True,
        "last_error": None,
        "last_error_at": None,
        # Unproven until a real API call succeeds.
        "last_verified_at": None,
    })


async def refresh_token(force: bool = False) -> dict:
    """
    Refreshes the access token. Re-checks after acquiring the lock so concurrent callers
    collapse into a single refresh.
    """
    async with _refresh_lock:
        config = await get_config()
        if not force and not _needs_refresh(config):
            return config

        refresh = (config.get("refresh_token") or "").strip()
        client_id = (config.get("client_id") or "").strip()
        client_secret = (config.get("client_secret") or "").strip()
        if not refresh or not client_id or not client_secret:
            raise HuggyAuthError(
                "Integração Huggy desconectada: não há refresh token. Reconecte em Configurações."
            )

        data = await _post_token({
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": client_id,
            "client_secret": client_secret,
        })

        access_token = data.get("access_token")
        if not access_token:
            raise HuggyAuthError("A Huggy não retornou access_token na renovação.")

        logger.info("Token Huggy renovado com sucesso")
        return await save_config({
            "access_token": access_token,
            # Huggy may or may not rotate the refresh token; keep the old one if it doesn't.
            "refresh_token": data.get("refresh_token") or refresh,
            "token_obtained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "token_expires_at": _expires_at(data.get("expires_in")),
            "last_error": None,
            "last_error_at": None,
        })


def _api_url(config: dict, path: str) -> str:
    company_id = (config.get("company_id") or "").strip()
    path = path if path.startswith("/") else "/" + path
    if company_id:
        return f"{API_BASE}/companies/{company_id}{path}"
    return f"{API_BASE}{path}"


async def request(method: str, path: str, *, json: dict | None = None,
                  params: dict | None = None) -> dict | list | None:
    """
    Calls the Huggy API, refreshing the token when needed and retrying transient failures.

    Raises HuggyNotConfigured / HuggyAuthError / HuggyUnavailable / HuggyRequestError so callers
    can map them to 409 / 409 / 502 / 4xx with a message the user can act on.
    """
    config = await get_config()
    if not config.get("enabled"):
        raise HuggyNotConfigured("Integração Huggy não está habilitada.")
    if not (config.get("access_token") or "").strip():
        raise HuggyAuthError("Integração Huggy desconectada. Reconecte em Configurações.")

    if _needs_refresh(config):
        config = await refresh_token()

    attempted_refresh = False

    for attempt in range(len(_RETRY_DELAYS) + 1):
        headers = {
            "Authorization": f"Bearer {config.get('access_token')}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Language": "pt-br",
        }
        url = _api_url(config, path)

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            try:
                response = await client.request(
                    method.upper(), url, json=json, params=params, headers=headers
                )
            except httpx.RequestError as exc:
                if attempt < len(_RETRY_DELAYS):
                    await asyncio.sleep(_RETRY_DELAYS[attempt])
                    continue
                await _record_error(f"Comunicação: {exc}")
                raise HuggyUnavailable(f"Erro de comunicação com a Huggy: {exc}") from exc

        # A 401 usually means the token died early; try exactly one refresh, then give up.
        # Only worth attempting when there is something to renew with — otherwise the failure
        # would be reported as "no refresh token" when the real cause is a rejected token.
        if response.status_code == 401 and not attempted_refresh:
            if (config.get("refresh_token") or "").strip():
                attempted_refresh = True
                config = await refresh_token(force=True)
                continue
            hint = _extract_hint(response)
            await _record_error(f"Token rejeitado pela Huggy (401): {hint or '-'}")
            raise HuggyAuthError(
                "A Huggy recusou o token (401)"
                + (f": {hint}" if hint else "")
                + ". Gere um novo token ou reconecte em Configurações."
            )

        if response.status_code == 401:
            # Surface Huggy's own hint. It is genuinely diagnostic — e.g. "The JWT string must
            # have two dots" immediately tells you a non-JWT value was stored as the token.
            hint = _extract_hint(response)
            await _record_error(f"HTTP 401 na Huggy: {hint or '-'}")
            raise HuggyAuthError(
                "A Huggy recusou as credenciais"
                + (f" ({hint})" if hint else "")
                + ". Reconecte em Configurações."
            )

        if response.status_code == 403:
            hint = _extract_hint(response)
            await _record_error(f"HTTP 403 na Huggy: {hint or '-'}")
            raise HuggyForbidden(
                "A Huggy negou o acesso a este recurso"
                + (f" ({hint})" if hint else "")
                + "."
            )

        if response.status_code == 429 or response.status_code >= 500:
            if attempt < len(_RETRY_DELAYS):
                await asyncio.sleep(_RETRY_DELAYS[attempt])
                continue
            await _record_error(f"HTTP {response.status_code} na Huggy")
            raise HuggyUnavailable(
                f"A Huggy está indisponível no momento (HTTP {response.status_code})."
            )

        if response.status_code >= 400:
            # Carry Huggy's reason into the message, not just into the log. Dropping it here is
            # what turned a rejected upload into a bare "erro 400" on screen while the server
            # knew perfectly well it was "Arquivo inválido".
            hint = _extract_hint(response)
            logger.warning(
                "Huggy %s %s -> %s: %s", method, path, response.status_code, response.text[:300]
            )
            raise HuggyRequestError(
                f"A Huggy recusou a requisição (HTTP {response.status_code})"
                + (f": {hint}" if hint else "")
                + ".",
                response.status_code,
            )

        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    raise HuggyUnavailable("A Huggy está indisponível no momento.")


def _extract_hint(response) -> str:
    """
    Pulls the human-usable part out of a Huggy error body.

    Huggy answers auth failures with {"error", "message", "hint"}, and the hint is the piece
    that actually identifies the problem. Discarding it turned a one-line diagnosis into a
    guessing game.

    "reason" belongs in the list too: 403s come back as {"reason": "Desculpe, você não tem
    permissão"} and nothing else, so leaving it out produced a bare "recusou as credenciais"
    with no cause attached — which is exactly what sent an operator chasing a phantom auth bug.
    """
    try:
        data = response.json()
    except ValueError:
        return (response.text or "")[:160]
    if not isinstance(data, dict):
        return ""
    return str(
        data.get("hint") or data.get("message") or data.get("reason") or data.get("error") or ""
    )[:160]


async def _record_error(message: str) -> None:
    """Stores the last failure so Configurações can show it without digging through logs."""
    try:
        await save_config({
            "last_error": message[:300],
            "last_error_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
    except Exception:
        logger.exception("Não foi possível registrar o último erro da Huggy")
