"""
Huggy integration endpoints.

The webhook here is the first unauthenticated, state-changing endpoint in this project. Huggy
documents no HMAC signature, no IP allowlist and no retry policy — a shared token delivered
during a handshake is all the platform offers. Defense is therefore layered: size cap, rate
limit, an explicitly armed learning window for the handshake, and a constant-time token compare
on every event.
"""
import base64
import hmac
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

import app.services.huggy_client as huggy_client
import app.services.huggy_service as huggy_service
import app.services.leads_service as leads_service
from app.models.user import UserResponse
from app.routers.auth import get_current_user
from app.routers.settings import require_head_or_master
from app.services.database import query
from app.services.huggy_client import (
    HuggyAuthError,
    HuggyForbidden,
    HuggyNotConfigured,
    HuggyRequestError,
    HuggyUnavailable,
)

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Envelopes are small; anything larger is not a legitimate Huggy webhook.
MAX_WEBHOOK_BYTES = 256 * 1024
# Base64 inflates by about 4/3, so this lands near 8 MB of actual file — comfortably above a
# voice note and a photo, and well under anything that would stall the request.
MAX_UPLOAD_BASE64_CHARS = 11 * 1024 * 1024
WEBHOOK_ARM_MINUTES = 15
OAUTH_STATE_KEY = "huggy_oauth_state"
OAUTH_STATE_TTL_MINUTES = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _map_huggy_error(exc: Exception) -> HTTPException:
    """Maps client exceptions to status codes a caller can act on."""
    if isinstance(exc, HuggyNotConfigured):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, HuggyAuthError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, HuggyForbidden):
        # 403, not 409: the credentials are fine, so this must not route the user to reconnect.
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, HuggyUnavailable):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, HuggyRequestError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Erro interno na integração Huggy")


# --------------------------------------------------------------------------- config / status

class HuggyConfigPayload(BaseModel):
    client_id: str | None = None
    client_secret: str | None = None
    company_id: str | None = None
    enabled: bool | None = None
    # URL of the Huggy panel conversation, optionally with a "{chat_id}" placeholder.
    panel_chat_url: str | None = None
    # Lets an operator paste a token obtained from Huggy's "gerador rápido de token", which runs
    # the consent flow in the browser against Huggy's own redirect URI. This is the only way to
    # authenticate while the CRM is on localhost, since Huggy cannot reach a local callback.
    # The full backend OAuth flow remains the supported path for production.
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None


def _mask(secret: str | None) -> str:
    """Shows only the tail, so an operator can tell which secret is stored without leaking it."""
    if not secret:
        return ""
    return "••••" + secret[-4:] if len(secret) > 4 else "••••"


async def _build_status() -> dict:
    config = await huggy_client.get_config()
    agents_total = 0
    rows = await query("SELECT COUNT(*) as n FROM users WHERE active = 1")
    if rows:
        agents_total = rows[0]["n"]
    rows = await query(
        "SELECT COUNT(*) as n FROM users "
        "WHERE huggy_agent_id IS NOT NULL AND huggy_agent_id != ''"
    )
    agents_mapped = rows[0]["n"] if rows else 0

    return {
        "enabled": bool(config.get("enabled")),
        # Never echo a token. The Huggy token is valid 6 months and can read every conversation
        # in the company, so status reports presence and expiry only.
        # `has_token` is only "a token string exists"; `verified` means Huggy actually accepted
        # it. Reporting the first as "connected" made a rejected token look connected.
        "has_token": bool((config.get("access_token") or "").strip()),
        "verified": bool(config.get("last_verified_at")),
        "last_verified_at": config.get("last_verified_at"),
        "client_id": config.get("client_id") or "",
        "client_secret_masked": _mask(config.get("client_secret")),
        "company_id": config.get("company_id") or "",
        "panel_chat_url": config.get("panel_chat_url") or "",
        "token_expires_at": config.get("token_expires_at"),
        "days_to_expiry": huggy_client.days_to_expiry(config),
        "webhook_configured": bool((config.get("webhook_token") or "").strip()),
        "webhook_armed_until": config.get("webhook_learn_until"),
        "last_webhook_at": config.get("last_webhook_at"),
        "last_error": config.get("last_error"),
        "last_error_at": config.get("last_error_at"),
        "unmatched_contacts": await huggy_service.count_unmatched_contacts(),
        "agents_mapped": agents_mapped,
        "agents_total": agents_total,
    }


@router.get("/status")
async def huggy_status(current_user: UserResponse = Depends(require_head_or_master)):
    """Connection status. Secrets are masked, tokens are never returned."""
    try:
        return await _build_status()
    except Exception:
        logger.exception("Erro ao obter status da Huggy")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")


@router.put("/config")
async def huggy_update_config(
    payload: HuggyConfigPayload,
    current_user: UserResponse = Depends(require_head_or_master),
):
    """Stores credentials. An omitted client_secret keeps the stored one."""
    try:
        patch: dict = {}
        if payload.client_id is not None:
            patch["client_id"] = payload.client_id.strip()
        if payload.client_secret:
            patch["client_secret"] = payload.client_secret.strip()
        if payload.company_id is not None:
            patch["company_id"] = payload.company_id.strip()
        if payload.panel_chat_url is not None:
            patch["panel_chat_url"] = payload.panel_chat_url.strip()
        if payload.enabled is not None:
            patch["enabled"] = bool(payload.enabled)

        if payload.access_token:
            from datetime import datetime as _dt, timedelta as _td

            # Huggy access tokens are JWTs and it rejects anything else with
            # "The JWT string must have two dots". Catching that here turns a confusing 401 on
            # the next call into an immediate, actionable message — a 32-char hex value pasted
            # by mistake is almost always the authorization code, not the token.
            candidate = payload.access_token.strip()
            if candidate.count(".") != 2:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Isso não parece um access_token da Huggy. O token é um JWT: começa com "
                        "\"eyJ\", é longo e tem exatamente dois pontos separando três partes. "
                        "Um valor curto (ex: 32 caracteres) normalmente é o código de "
                        "autorização, não o token."
                    ),
                )

            # Default to Huggy's documented 6-month lifetime when the generator does not say.
            seconds = payload.expires_in or int(_td(days=180).total_seconds())
            patch["access_token"] = payload.access_token.strip()
            patch["token_obtained_at"] = _iso(_now())
            patch["token_expires_at"] = _iso(_now() + _td(seconds=seconds))
            patch["enabled"] = True
            patch["last_error"] = None
            patch["last_error_at"] = None
            # A new token is unproven until /test succeeds.
            patch["last_verified_at"] = None
            logger.info("Token Huggy definido manualmente (gerador rápido de token)")
        if payload.refresh_token:
            patch["refresh_token"] = payload.refresh_token.strip()

        await huggy_client.save_config(patch)
        return await _build_status()
    except HTTPException:
        # Validation errors above are deliberate; do not turn them into a 500.
        raise
    except Exception:
        logger.exception("Erro ao salvar configuração da Huggy")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")


@router.post("/test")
async def huggy_test(current_user: UserResponse = Depends(require_head_or_master)):
    """Calls GET /agents/profile to prove the credentials actually work."""
    try:
        profile = await huggy_client.request("GET", "/agents/profile")
        name = None
        if isinstance(profile, dict):
            name = profile.get("name") or profile.get("email")
        # Only a successful round-trip proves the credentials work, so this is the single place
        # allowed to mark the integration verified.
        await huggy_client.save_config({"last_verified_at": _iso(_now())})
        return {"ok": True, "agent_name": name}
    except Exception as exc:
        await huggy_client.save_config({"last_verified_at": None})
        raise _map_huggy_error(exc)


# --------------------------------------------------------------------------- OAuth

def _redirect_uri(request: Request) -> str:
    """
    Builds the public callback URL from the incoming request.

    X-Forwarded-Host is required and comes first: nginx forwards `Host $host`, which strips the
    port, so relying on `host` produced "http://localhost/..." instead of
    "http://localhost:3000/..." and the OAuth redirect landed on a dead port. Both nginx configs
    now also send `X-Forwarded-Host $http_host`, which preserves it.

    The result must match the redirect URI registered in the Huggy app exactly.
    """
    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = forwarded_proto.split(",")[0].strip() if forwarded_proto else request.url.scheme
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    return f"{scheme}://{host.split(',')[0].strip()}/api/huggy/oauth/callback"


@router.post("/oauth/start")
async def huggy_oauth_start(
    request: Request,
    current_user: UserResponse = Depends(require_head_or_master),
):
    """Returns the Huggy consent URL. The frontend navigates the full page to it."""
    config = await huggy_client.get_config()
    client_id = (config.get("client_id") or "").strip()
    if not client_id or not (config.get("client_secret") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Preencha client_id e client_secret antes de conectar.",
        )

    state = secrets.token_urlsafe(32)
    from app.services.settings_service import update_settings

    await update_settings(OAUTH_STATE_KEY, {
        "state": state,
        "user_email": current_user.email,
        "created_at": _iso(_now()),
        "redirect_uri": _redirect_uri(request),
    })

    return {
        "authorize_url": huggy_client.build_authorize_url(
            client_id, _redirect_uri(request), state
        )
    }


@router.get("/oauth/callback")
async def huggy_oauth_callback(request: Request, code: str = "", state: str = ""):
    """
    Completes the OAuth flow.

    Deliberately unauthenticated: a session expiring mid-flow would otherwise produce a
    baffling 401 after the user already consented at Huggy. Safety comes from `state` —
    single-use, TTL-bound, compared in constant time.
    """
    from app.services.settings_service import get_settings, update_settings

    stored = await get_settings(OAUTH_STATE_KEY) or {}
    expected = stored.get("state") or ""
    created = _parse_iso(stored.get("created_at"))

    def fail(reason: str):
        logger.warning("Callback OAuth Huggy recusado: %s", reason)
        return RedirectResponse(f"/configuracoes?huggy=erro&motivo={reason}")

    if not code or not state or not expected:
        return fail("parametros")
    if not hmac.compare_digest(state, expected):
        return fail("state")
    if not created or _now() - created > timedelta(minutes=OAUTH_STATE_TTL_MINUTES):
        return fail("expirado")

    # Single use: burn the state before doing anything else.
    await update_settings(OAUTH_STATE_KEY, {})

    try:
        await huggy_client.exchange_code(code, stored.get("redirect_uri") or _redirect_uri(request))
    except Exception as exc:
        logger.exception("Falha na troca de código OAuth da Huggy")
        await huggy_client.save_config({
            "last_error": str(exc)[:300],
            "last_error_at": _iso(_now()),
        })
        return fail("troca")

    return RedirectResponse("/configuracoes?huggy=ok")


@router.post("/oauth/refresh")
async def huggy_oauth_refresh(current_user: UserResponse = Depends(require_head_or_master)):
    """Manual escape hatch for token renewal."""
    try:
        await huggy_client.refresh_token(force=True)
        return await _build_status()
    except Exception as exc:
        raise _map_huggy_error(exc)


# --------------------------------------------------------------------------- webhook

@router.post("/webhook/arm")
async def huggy_webhook_arm(current_user: UserResponse = Depends(require_head_or_master)):
    """
    Opens a window during which the endpoint accepts a new webhook token.

    Huggy generates the token and delivers it when the URL is saved, so it cannot be
    pre-shared. Without this window an attacker could overwrite our shared secret at will.
    """
    until = _now() + timedelta(minutes=WEBHOOK_ARM_MINUTES)
    await huggy_client.save_config({"webhook_learn_until": _iso(until)})
    return {"armed_until": _iso(until), "minutes": WEBHOOK_ARM_MINUTES}


@router.post("/webhook/disarm")
async def huggy_webhook_disarm(current_user: UserResponse = Depends(require_head_or_master)):
    await huggy_client.save_config({"webhook_learn_until": None})
    return {"armed_until": None}


@router.post("/webhook")
@limiter.limit("300/minute")
async def huggy_webhook(request: Request):
    """
    Receives Huggy webhook envelopes. Unauthenticated by design — see the module docstring.

    Always answers 200 once the raw event is stored: Huggy documents no retry policy, so a 500
    buys nothing, while the stored raw row keeps every failure replayable.
    """
    # Size cap before reading the body. Chunked requests carry no Content-Length, so the
    # length is re-checked after reading too.
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload muito grande")

    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload muito grande")

    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="JSON inválido")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Envelope inválido")

    config = await huggy_client.get_config()
    stored_token = (config.get("webhook_token") or "").strip()
    incoming_token = str(payload.get("token") or "").strip()

    # --- handshake: Huggy posts {"token": ..., "validToken": true} and expects the echo
    if payload.get("validToken") is not None and "messages" not in payload:
        armed_until = _parse_iso(config.get("webhook_learn_until"))
        armed = bool(armed_until and _now() <= armed_until)

        # Logged once so ops can confirm the exact echo shape Huggy expects; the docs only say
        # "send the token back".
        logger.info("Handshake de webhook Huggy recebido: %s", raw[:300])

        if not incoming_token:
            raise HTTPException(status_code=400, detail="Handshake sem token")

        if stored_token and hmac.compare_digest(incoming_token, stored_token):
            return JSONResponse({"token": incoming_token})

        if not armed:
            logger.warning(
                "Handshake de webhook Huggy recusado (não armado) de %s",
                request.client.host if request.client else "?",
            )
            raise HTTPException(
                status_code=403,
                detail="Webhook não está armado. Arme em Configurações antes de salvar na Huggy.",
            )

        await huggy_client.save_config({
            "webhook_token": incoming_token,
            "webhook_learn_until": None,
            "last_webhook_at": _iso(_now()),
        })
        logger.info("Token de webhook Huggy registrado")
        return JSONResponse({"token": incoming_token})

    # --- regular event: constant-time token check
    if not stored_token:
        logger.warning("Evento de webhook Huggy recebido sem token registrado")
        raise HTTPException(status_code=401, detail="Não autorizado")
    if not incoming_token or not hmac.compare_digest(incoming_token, stored_token):
        logger.warning(
            "Token de webhook Huggy divergente de %s",
            request.client.host if request.client else "?",
        )
        raise HTTPException(status_code=401, detail="Não autorizado")

    try:
        summary = await huggy_service.handle_envelope(payload)
    except Exception:
        # The raw insert itself failed; a 500 gives a hypothetical Huggy retry a second chance.
        logger.exception("Falha ao persistir envelope da Huggy")
        raise HTTPException(status_code=500, detail="Erro ao processar envelope")

    await huggy_client.save_config({"last_webhook_at": _iso(_now())})
    return {"ok": True, **summary}


# --------------------------------------------------------------------------- agents

@router.get("/agents")
async def huggy_agents(current_user: UserResponse = Depends(require_head_or_master)):
    """Lists Huggy agents alongside CRM users, proposing matches by e-mail."""
    try:
        data = await huggy_client.request("GET", "/agents", params={"allPages": "true"})
    except Exception as exc:
        raise _map_huggy_error(exc)

    agents = data if isinstance(data, list) else (data or {}).get("data") or []
    users = await query(
        "SELECT id, email, name, role, huggy_agent_id FROM users WHERE active = 1 ORDER BY name"
    )

    by_email = {
        str(a.get("email", "")).strip().lower(): a
        for a in agents if isinstance(a, dict) and a.get("email")
    }

    result = []
    for user in users:
        email = str(user.get("email") or "").strip().lower()
        suggestion = by_email.get(email)
        result.append({
            "user_id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "huggy_agent_id": user.get("huggy_agent_id"),
            "suggested_agent_id": str(suggestion.get("id")) if suggestion else None,
            "suggested_agent_name": suggestion.get("name") if suggestion else None,
        })

    # The full list drives the selector in Configurações. E-mail auto-matching is a convenience
    # only: in practice the CRM and Huggy often use different domains, so most links are manual.
    all_agents = [
        {
            "id": str(a.get("id")),
            "name": (a.get("name") or "").strip() or f"Agente {a.get('id')}",
            "email": a.get("email") or "",
        }
        for a in agents
        if isinstance(a, dict) and a.get("id")
    ]
    all_agents.sort(key=lambda a: a["name"].lower())

    mapped_ids = {str(u.get("huggy_agent_id")) for u in users if u.get("huggy_agent_id")}
    crm_emails = {str(u.get("email") or "").strip().lower() for u in users}
    unmatched_agents = [
        a for a in all_agents
        if a["id"] not in mapped_ids and a["email"].strip().lower() not in crm_emails
    ]
    return {"users": result, "agents": all_agents, "unmatched_agents": unmatched_agents}


class AgentMapping(BaseModel):
    user_id: int
    huggy_agent_id: str | None = None


class AgentMappingPayload(BaseModel):
    mappings: list[AgentMapping] = []


@router.put("/agents/map")
async def huggy_map_agents(
    payload: AgentMappingPayload,
    current_user: UserResponse = Depends(require_head_or_master),
):
    """
    Links CRM users to Huggy agents. A null id clears the link.

    Counts rows actually changed, not mappings attempted: reporting success for a user_id that
    does not exist hides typos and made a no-op look like a save.
    """
    from app.services.database import get_db

    updated = 0
    missing: list[int] = []
    db = await get_db()
    try:
        for mapping in payload.mappings:
            value = (mapping.huggy_agent_id or "").strip() or None
            cursor = await db.execute(
                "UPDATE users SET huggy_agent_id = ? WHERE id = ?", (value, mapping.user_id)
            )
            if cursor.rowcount > 0:
                updated += 1
            else:
                missing.append(mapping.user_id)
        await db.commit()
    finally:
        await db.close()

    if missing:
        logger.warning("Vínculo Huggy ignorado para usuários inexistentes: %s", missing)
    return {"updated": updated, "not_found": missing}


# --------------------------------------------------------------------------- lead conversation

# Chat states that count as reusable, observed on the live account: `finishing` is the bulk of
# closed conversations, while these are still active. Anything unknown is treated as closed, so
# an unrecognised state creates a new chat rather than resurrecting a finished one.
OPEN_CHAT_SITUATIONS = {"wait_for_chat", "in_chat", "auto", "queue", "in_queue"}

# Chats still being handled by the bot. Huggy answers GET /chats/{id}/messages with 403 for
# these — verified against the live account: every chat in `auto` returned 403 while every
# `in_chat`/`finishing` one returned 200, with or without an agent assigned. So this is a state
# to report, not an error to raise: the messages become readable once the chat leaves the bot.
BOT_SITUATIONS = {"auto"}


def _message_direction(message: dict, contact: dict | None) -> str:
    """
    Decides which side of the conversation a synced message came from.

    The webhook does not need this — Huggy names the event (`receivedAllMessage` vs
    `sentAllMessage`). GET /chats/{id}/messages carries no such label, and `senderType` is not the
    substitute it looks like: on a real WhatsApp chat it holds the *channel* name
    ("whatsapp-enterprise") for both the customer's messages and the bot's internal events, so
    matching it against widget/customer/contact filed every single message as outbound.

    Comparing `sender.id` with the contact is the reliable signal, confirmed against the live
    account. The senderType checks stay as a fallback for channels that do use those values.
    """
    if str(message.get("type") or "").lower() in ("internalevent", "internal_event"):
        return "event"

    sender_type = str(message.get("senderType") or "").lower()
    if sender_type == "agent":
        return "out"

    sender_id = (message.get("sender") or {}).get("id")
    contact_id = (contact or {}).get("huggy_contact_id")
    if sender_id is not None and contact_id and str(sender_id) == str(contact_id):
        return "in"

    if sender_type in ("widget", "customer", "contact"):
        return "in"

    return "out"


_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg")
_AUDIO_EXTENSIONS = (".ogg", ".oga", ".opus", ".mp3", ".m4a", ".aac", ".wav", ".webm", ".amr")
_VIDEO_EXTENSIONS = (".mp4", ".mov", ".3gp", ".mkv")


def _attachment_type(url: str | None, huggy_type: str | None) -> str | None:
    """
    Classifies an attachment so the drawer knows whether to draw a picture, a player or a link.

    Huggy's own `type` is trusted first when it says something useful; the extension is the
    fallback, since on WhatsApp media the field has been seen carrying just "text".
    """
    kind = str(huggy_type or "").lower()
    for name in ("image", "audio", "video"):
        if name in kind:
            return name

    path = str(url or "").split("?")[0].lower()
    if not path:
        return None
    if path.endswith(_IMAGE_EXTENSIONS):
        return "image"
    if path.endswith(_AUDIO_EXTENSIONS):
        return "audio"
    if path.endswith(_VIDEO_EXTENSIONS):
        return "video"
    return "file"


def _media_fields(message: dict) -> dict:
    """Attachment URL, its kind, and the sender's avatar, as store_message wants them."""
    url = message.get("file") or message.get("fileUrl") or ""
    if not url:
        files = message.get("files") or []
        if isinstance(files, list) and files:
            first = files[0]
            url = (first.get("url") or first.get("file") or "") if isinstance(first, dict) else ""
    url = url or None
    return {
        "attachment_url": url,
        "attachment_type": _attachment_type(url, message.get("type")),
        "sender_photo": (message.get("sender") or {}).get("photo"),
    }


def _last_message_fields(chat: dict | None) -> dict:
    """
    Pulls the preview Huggy exposes even for chats whose messages it refuses to serve.

    GET /chats/{id} carries `lastMessage` and `unread` whatever the `situation` is — confirmed on
    every bot chat in the live account — so for a conversation still with the bot this preview is
    the only thing the CRM can show. Fields left as None are dropped by upsert_chat, so a chat
    that answers without them keeps whatever was recorded before.
    """
    chat = chat or {}
    last = chat.get("lastMessage") or {}

    try:
        unread = int(chat.get("unread"))
    except (TypeError, ValueError):
        unread = None

    fields = {"unread": unread}

    text = last.get("text") or last.get("body")
    if text:
        fields["last_message_text"] = str(text)[:500]
        fields["last_message_sender"] = str((last.get("sender") or {}).get("name") or "") or None
        sent_at = last.get("sendAt") or last.get("send_at")
        # to_iso falls back to "now" for an empty value, which would date the preview wrong.
        if sent_at:
            fields["last_message_at"] = huggy_service.to_iso(sent_at)

    return fields

# Default landing page when no per-chat URL is known. The v3 docs describe the API, not the
# panel's routes, so the exact per-chat URL has to be confirmed against a real account and is
# therefore configurable instead of hardcoded.
DEFAULT_PANEL_URL = "https://www.huggy.app/panel"


def _huggy_deep_link(panel_url_template: str | None, chat_id: str | None) -> str:
    """
    Builds the URL that opens this conversation in Huggy.

    `panel_chat_url` may contain a "{chat_id}" placeholder (e.g.
    "https://www.huggy.app/panel/chat/{chat_id}"). Without it — or without a chat id — the
    inbox is opened instead, which is still useful, just one click away from the conversation.
    """
    template = (panel_url_template or "").strip()
    if template and chat_id and "{chat_id}" in template:
        return template.replace("{chat_id}", str(chat_id))
    if template and "{chat_id}" not in template:
        return template
    return DEFAULT_PANEL_URL


def _huggy_phone_candidates(normalized: str) -> list[str]:
    """
    Phone shapes to try against Huggy, most specific first, digits only.

    Verified against the live API: `?phone=+5562984669973` returns nothing while
    `?phone=5562984669973` and `?phone=556284669973` both return the same contact. Huggy keeps
    the ninth-digit and legacy forms side by side, so both are worth trying before concluding a
    contact does not exist — concluding wrongly creates a duplicate.
    """
    import re as _re

    digits = _re.sub(r"\D", "", normalized or "")
    candidates = [digits] if digits else []
    for variant in huggy_service._phone_variants(normalized or ""):
        variant_digits = _re.sub(r"\D", "", variant)
        if variant_digits and variant_digits not in candidates:
            candidates.append(variant_digits)
    return candidates


async def _lead_for_phone(phone: str) -> dict:
    rows = await query(
        "SELECT id, full_name, phone, campaign_name FROM leads WHERE phone = ? LIMIT 1", (phone,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    return dict(rows[0])


async def _consultor_owns_lead(lead_id: str, email: str) -> bool:
    rows = await query(
        "SELECT lead_id FROM negocios WHERE lead_id = ? AND usuario_email = ? LIMIT 1",
        (lead_id, email),
    )
    return bool(rows)


@router.get("/leads/{phone}/messages")
async def huggy_lead_messages(
    phone: str,
    since: str | None = None,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Mirrored conversation for a lead, read from our own SQLite — never calls Huggy, so it keeps
    working while the integration is down.
    """
    normalized = leads_service.normalize_phone(phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Telefone inválido")

    lead = await _lead_for_phone(normalized)
    if current_user.role == "consultor" and not await _consultor_owns_lead(
        lead["id"], current_user.email
    ):
        # Consistent with get_leads/get_kpis, which already restrict consultores.
        return {"items": [], "restricted": True}

    items = await huggy_service.get_messages_for_phone(normalized, since=since)

    # The bot state travels with the messages so the drawer can show it on open, without the
    # user having to press Sincronizar to discover why the conversation looks empty.
    chat_rows = await query(
        "SELECT situation, last_message_text, last_message_sender, last_message_at, unread "
        "FROM huggy_chats WHERE lead_id = ? ORDER BY updated_at DESC LIMIT 1",
        (lead["id"],),
    )
    chat = dict(chat_rows[0]) if chat_rows else {}
    situation = str(chat.get("situation") or "").lower()
    in_bot = situation in BOT_SITUATIONS

    return {
        "items": items,
        "restricted": False,
        "chat_situation": situation or None,
        "in_bot": in_bot,
        # Only meaningful while the bot holds the chat: once it moves to an agent the mirrored
        # messages above are the real history, and a duplicated preview would just be noise.
        "last_message": {
            "text": chat.get("last_message_text"),
            "sender": chat.get("last_message_sender"),
            "created_at": chat.get("last_message_at"),
            "unread": chat.get("unread"),
        } if in_bot and chat.get("last_message_text") else None,
    }


@router.post("/leads/{phone}/chat")
async def huggy_open_chat(
    phone: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Guarantees a Huggy contact and an open chat for this lead, assigned to the caller's agent.

    Uses PUT /chats/{id}/agent with an explicit agentId — assignToMe would assign the app's
    own token identity, not the consultant.
    """
    normalized = leads_service.normalize_phone(phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    lead = await _lead_for_phone(normalized)

    config = await huggy_client.get_config()
    config_panel_url = config.get("panel_chat_url")

    try:
        # 1. find or create the contact.
        # Huggy stores phones as digits only — a "+5562..." filter returns 0 results while
        # "5562..." finds the contact. Sending the "+" made every click create a duplicate
        # contact in the real account. It also keeps the same number in two shapes (with and
        # without the ninth digit), so both are tried before giving up.
        contact_id = None
        for candidate in _huggy_phone_candidates(normalized):
            found = await huggy_client.request("GET", "/contacts", params={"phone": candidate})
            contacts = found if isinstance(found, list) else (found or {}).get("data") or []
            if contacts and isinstance(contacts[0], dict) and contacts[0].get("id"):
                contact_id = str(contacts[0]["id"])
                break

        if not contact_id:
            created = await huggy_client.request("POST", "/contacts", json={
                "name": lead.get("full_name") or "Lead",
                # Digits only, matching how Huggy stores and returns numbers.
                "phone": _huggy_phone_candidates(normalized)[0],
            })
            if not isinstance(created, dict) or not created.get("id"):
                raise HTTPException(status_code=502, detail="A Huggy não retornou o contato criado.")
            contact_id = str(created["id"])

        # 2. reuse an open chat instead of creating another one.
        # Asking Huggy is what matters here: our own huggy_chats table is only populated by
        # webhooks and previous clicks, so trusting it alone meant the first click on any
        # contact opened a second chat even when one was already open in Huggy — visible
        # duplication in the team's real inbox.
        chat_id = None
        chat_situation = None
        existing = await huggy_client.request(
            "GET", "/chats", params={"customer": contact_id}
        )
        chats = existing if isinstance(existing, list) else (existing or {}).get("data") or []
        for chat in chats:
            if isinstance(chat, dict) and chat.get("id") \
                    and str(chat.get("situation") or "").lower() in OPEN_CHAT_SITUATIONS:
                chat_id = str(chat["id"])
                chat_situation = str(chat.get("situation") or "").lower() or None
                break

        # Fall back to what we recorded before, then finally create a new chat.
        if not chat_id:
            rows = await query(
                "SELECT huggy_chat_id FROM huggy_chats "
                "WHERE huggy_contact_id = ? AND (closed_at IS NULL OR closed_at = '') "
                "ORDER BY updated_at DESC LIMIT 1",
                (contact_id,),
            )
            if rows:
                chat_id = rows[0]["huggy_chat_id"]

        if not chat_id:
            chat = await huggy_client.request("POST", f"/contacts/{contact_id}/chats", json={})
            if isinstance(chat, dict) and chat.get("id"):
                chat_id = str(chat["id"])
                chat_situation = str(chat.get("situation") or "").lower() or None

        # 3. assign to the caller's agent, when mapped
        agent_rows = await query(
            "SELECT huggy_agent_id FROM users WHERE email = ? LIMIT 1", (current_user.email,)
        )
        agent_id = (agent_rows[0].get("huggy_agent_id") if agent_rows else None) or None
        assigned = False
        if chat_id and agent_id:
            try:
                await huggy_client.request(
                    "PUT", f"/chats/{chat_id}/agent", json={"agentId": agent_id}
                )
                assigned = True
            except HuggyRequestError as exc:
                # Assignment failing must not lose the chat we just created.
                logger.warning("Não foi possível atribuir o chat %s: %s", chat_id, exc)

    except HTTPException:
        raise
    except Exception as exc:
        raise _map_huggy_error(exc)

    contact = await huggy_service.upsert_contact(
        contact_id,
        phone_raw=normalized,
        full_name=lead.get("full_name"),
        last_chat_id=chat_id,
    )
    if chat_id:
        await huggy_service.upsert_chat(
            chat_id,
            huggy_contact_id=contact_id,
            lead_id=contact.get("lead_id") or lead["id"],
            huggy_agent_id=agent_id,
            usuario_email=current_user.email if agent_id else None,
            # A successful assignment takes the chat out of the bot, so the value read a moment
            # ago is already stale — recording it would light up the "no bot" tag on a chat that
            # just left it. Leave the column alone and let the next sync/webhook set the truth.
            situation=None if assigned else chat_situation,
        )

    return {
        "contact_id": contact_id,
        "chat_id": chat_id,
        "assigned": assigned,
        "agent_mapped": bool(agent_id),
        "deep_link": _huggy_deep_link(config_panel_url, chat_id),
    }


@router.post("/leads/{phone}/sync")
async def huggy_sync_lead(
    phone: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Pulls the conversation from Huggy and upserts it.

    This is the recovery path for webhooks that never arrived — idempotent by construction
    (huggy_message_id UNIQUE), user-triggered, no scheduler involved.
    """
    normalized = leads_service.normalize_phone(phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    lead = await _lead_for_phone(normalized)

    if current_user.role == "consultor" and not await _consultor_owns_lead(
        lead["id"], current_user.email
    ):
        raise HTTPException(status_code=403, detail="Este lead não está atribuído a você.")

    rows = await query(
        "SELECT huggy_chat_id, huggy_contact_id FROM huggy_chats WHERE lead_id = ? "
        "ORDER BY updated_at DESC LIMIT 5",
        (lead["id"],),
    )
    if not rows:
        return {"synced": 0, "chats": 0, "message": "Nenhuma conversa Huggy conhecida para este lead."}

    imported = 0
    in_bot = 0
    try:
        for row in rows:
            chat_id = row["huggy_chat_id"]

            # Ask Huggy for the current state before the messages. Skipping a bot chat costs one
            # extra GET, but attempting the messages instead would return a bare 403 that cannot
            # be told apart from a genuine permission problem.
            chat = await huggy_client.request("GET", f"/chats/{chat_id}")
            situation = str((chat or {}).get("situation") or "").lower()
            await huggy_service.upsert_chat(chat_id, situation=situation or None,
                                            **_last_message_fields(chat))
            if situation in BOT_SITUATIONS:
                in_bot += 1
                continue

            data = await huggy_client.request(
                "GET", f"/chats/{chat_id}/messages", params={"showEvents": "true"}
            )
            messages = data if isinstance(data, list) else (data or {}).get("data") or []
            contact = None
            if row.get("huggy_contact_id"):
                contact_rows = await query(
                    "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1",
                    (row["huggy_contact_id"],),
                )
                contact = dict(contact_rows[0]) if contact_rows else None

            for message in messages:
                if not isinstance(message, dict) or not message.get("id"):
                    continue
                sender = message.get("sender") or {}
                direction = _message_direction(message, contact)
                if await huggy_service.store_message(
                    huggy_message_id=message.get("id"),
                    huggy_chat_id=chat_id,
                    contact=contact,
                    direction=direction,
                    sender_type=message.get("senderType"),
                    sender_name=sender.get("name"),
                    huggy_agent_id=sender.get("id") if direction == "out" else None,
                    body=message.get("body") or message.get("text"),
                    created_at=message.get("send_at") or message.get("sendAt"),
                    raw=message,
                    **_media_fields(message),
                ):
                    imported += 1
    except Exception as exc:
        raise _map_huggy_error(exc)

    if in_bot and not imported:
        message = (
            "A conversa ainda está no atendimento automático da Huggy. As mensagens ficam "
            "disponíveis assim que ela for transferida para um agente."
        )
    elif in_bot:
        message = (
            f"{imported} mensagem(ns) importada(s). Outra conversa continua no atendimento "
            "automático e só poderá ser lida após a transferência para um agente."
        )
    else:
        message = None

    return {"synced": imported, "chats": len(rows), "in_bot": in_bot, "message": message}


class SendMessagePayload(BaseModel):
    # Huggy delivers over WhatsApp, whose own body limit is far below this; the cap is here to
    # stop an accidental paste from becoming an outbound message to a customer.
    text: str = Field(default="", max_length=4000)
    # Data URI or bare base64. Huggy's POST /chats/{id}/messages takes `fileBase64`, which is how
    # a browser-recorded voice note gets out without us hosting the file anywhere.
    file_base64: str | None = None
    file_name: str | None = Field(default=None, max_length=200)


@router.post("/leads/{phone}/messages")
@limiter.limit("30/minute")
async def huggy_send_message(
    request: Request,
    phone: str,
    payload: SendMessagePayload,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Sends a WhatsApp message to the lead through Huggy.

    Rate limited because, unlike every other endpoint here, a call reaches a real customer.
    """
    text = payload.text.strip()
    file_base64 = (payload.file_base64 or "").strip()
    if not text and not file_base64:
        raise HTTPException(status_code=422, detail="A mensagem não pode ser vazia.")

    # A data URI is what a browser produces; Huggy wants the payload on its own.
    if file_base64.startswith("data:"):
        _, _, file_base64 = file_base64.partition(",")
    if file_base64 and len(file_base64) > MAX_UPLOAD_BASE64_CHARS:
        raise HTTPException(
            status_code=413,
            detail="Arquivo muito grande. O limite é de cerca de 8 MB.",
        )

    normalized = leads_service.normalize_phone(phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    lead = await _lead_for_phone(normalized)

    if current_user.role == "consultor" and not await _consultor_owns_lead(
        lead["id"], current_user.email
    ):
        raise HTTPException(status_code=403, detail="Este lead não está atribuído a você.")

    rows = await query(
        "SELECT huggy_chat_id, huggy_contact_id FROM huggy_chats WHERE lead_id = ? "
        "ORDER BY updated_at DESC LIMIT 1",
        (lead["id"],),
    )
    if not rows:
        raise HTTPException(
            status_code=409,
            detail="Nenhuma conversa Huggy para este lead. Use \"Abrir conversa\" primeiro.",
        )
    chat_id = rows[0]["huggy_chat_id"]

    body: dict = {"text": text}
    if file_base64:
        body["fileBase64"] = file_base64
        if payload.file_name:
            body["fileName"] = payload.file_name
        # Huggy validates uploads by content and answers a flat "Arquivo inválido", naming
        # neither the format it got nor the ones it wants. Logging the magic bytes turns that
        # into a one-line diagnosis: 494433/fffb is mp3, 1a45dfa3 is webm, 52494646 is wav.
        try:
            head = base64.b64decode(file_base64[:32], validate=False)[:4].hex()
        except Exception:
            head = "?"
        logger.info(
            "Enviando arquivo para a Huggy: nome=%r assinatura=%s base64_chars=%d",
            payload.file_name, head, len(file_base64),
        )

    try:
        sent = await huggy_client.request(
            "POST", f"/chats/{chat_id}/messages", json=body
        )
    except Exception as exc:
        # A bot chat may well be refused here. That surfaces as HuggyForbidden carrying Huggy's
        # own reason, which beats guessing at a restriction of our own.
        raise _map_huggy_error(exc)

    contact = None
    if rows[0]["huggy_contact_id"]:
        contact_rows = await query(
            "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1",
            (rows[0]["huggy_contact_id"],),
        )
        contact = dict(contact_rows[0]) if contact_rows else None

    sent = sent if isinstance(sent, dict) else {}
    agent_rows = await query(
        "SELECT huggy_agent_id FROM users WHERE email = ? LIMIT 1", (current_user.email,)
    )
    agent_id = (agent_rows[0].get("huggy_agent_id") if agent_rows else None) or None

    # Mirror it now so the panel shows the message without waiting for a webhook. Huggy's own id
    # is what makes that echo land on the UNIQUE constraint instead of creating a twin.
    message_id = sent.get("id") or f"local:{chat_id}:{_iso(_now())}"
    created_at = sent.get("sendAt") or sent.get("send_at") or _iso(_now())
    media = _media_fields(sent)
    await huggy_service.store_message(
        huggy_message_id=message_id,
        huggy_chat_id=chat_id,
        contact=contact,
        direction="out",
        sender_type=sent.get("senderType") or "agent",
        sender_name=(sent.get("sender") or {}).get("name") or current_user.name,
        huggy_agent_id=agent_id,
        body=sent.get("text") or sent.get("body") or text,
        created_at=created_at,
        raw=sent or {"text": text},
        **media,
    )

    return {
        "huggy_message_id": str(message_id),
        "huggy_chat_id": str(chat_id),
        "direction": "out",
        "sender_name": (sent.get("sender") or {}).get("name") or current_user.name,
        "sender_photo": media["sender_photo"],
        "body": sent.get("text") or text,
        "created_at": huggy_service.to_iso(created_at),
        "has_attachment": 1 if media["attachment_url"] else 0,
        "attachment_url": media["attachment_url"],
        "attachment_type": media["attachment_type"],
    }


# --------------------------------------------------------------------------- media proxy

async def _fetch_media(url: str, headers: dict) -> httpx.Response:
    """
    Single outbound call of the media proxy, kept separate so a test can replace it.

    Patching httpx.AsyncClient.get instead would also intercept the test client's own request to
    this very endpoint, since that client is an httpx.AsyncClient too.
    """
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        return await client.get(url, headers=headers)


@router.get("/media")
async def huggy_media(url: str, current_user: UserResponse = Depends(get_current_user)):
    """
    Serves a Huggy image, avatar or audio through our own origin.

    Two reasons not to point <img> straight at Huggy's CDN. The project's CSP declares
    `img-src 'self' data:` (main.py), so a hotlink only works until that policy is applied to the
    HTML as well; and an attachment behind Huggy's API needs the bearer token, which must never
    reach the browser.

    The `url` parameter cannot be used to make the server fetch an arbitrary address: it is only
    accepted when it matches a URL Huggy itself gave us and we already stored. That is what keeps
    this from being an SSRF hole.
    """
    rows = await query(
        "SELECT 1 FROM huggy_messages WHERE attachment_url = ? OR sender_photo = ? LIMIT 1",
        (url, url),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Mídia desconhecida.")

    # The token authenticates us to Huggy's API only. Attaching it to a CDN request would hand
    # our credential to a host that never needed it.
    headers = {}
    host = urlparse(url).hostname or ""
    if host.endswith("huggy.app"):
        config = await huggy_client.get_config()
        token = (config.get("access_token") or "").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"

    try:
        upstream = await _fetch_media(url, headers)
    except httpx.RequestError as exc:
        logger.warning("Falha ao buscar mídia da Huggy: %s", exc)
        raise HTTPException(status_code=502, detail="Não foi possível carregar a mídia.")

    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="Não foi possível carregar a mídia.")

    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type") or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=3600"},
    )


# --------------------------------------------------------------------------- unmatched contacts

@router.get("/contacts/unmatched")
async def huggy_unmatched_contacts(
    current_user: UserResponse = Depends(require_head_or_master),
):
    """Huggy contacts we could not attach to a lead — the queue an admin resolves by hand."""
    rows = await query(
        "SELECT huggy_contact_id, phone_raw, phone_normalized, full_name, email, "
        "match_method, last_chat_id, created_at FROM huggy_contacts "
        "WHERE lead_id IS NULL OR lead_id = '' ORDER BY created_at DESC LIMIT 200"
    )
    return {"items": [dict(r) for r in rows]}


class LinkContactPayload(BaseModel):
    lead_id: str


@router.post("/contacts/{contact_id}/link")
async def huggy_link_contact(
    contact_id: str,
    payload: LinkContactPayload,
    current_user: UserResponse = Depends(require_head_or_master),
):
    """Attaches a Huggy contact to an existing lead, backfilling its messages."""
    lead_rows = await query(
        "SELECT id, phone FROM leads WHERE id = ? LIMIT 1", (payload.lead_id,)
    )
    if not lead_rows:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    lead = dict(lead_rows[0])

    contact_rows = await query(
        "SELECT huggy_contact_id FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1",
        (contact_id,),
    )
    if not contact_rows:
        raise HTTPException(status_code=404, detail="Contato Huggy não encontrado")

    await query(
        "UPDATE huggy_contacts SET lead_id = ?, phone_normalized = ?, match_method = 'manual', "
        "updated_at = ? WHERE huggy_contact_id = ?",
        (lead["id"], lead["phone"], _iso(_now()), contact_id),
    )
    # Backfill so already-stored messages show up on the lead's timeline.
    await query(
        "UPDATE huggy_messages SET lead_id = ?, phone_normalized = ? WHERE huggy_contact_id = ?",
        (lead["id"], lead["phone"], contact_id),
    )
    await query(
        "UPDATE huggy_chats SET lead_id = ? WHERE huggy_contact_id = ?",
        (lead["id"], contact_id),
    )
    return {"ok": True, "lead_id": lead["id"]}


@router.post("/contacts/{contact_id}/create-lead")
async def huggy_create_lead_from_contact(
    contact_id: str,
    current_user: UserResponse = Depends(require_head_or_master),
):
    """
    Creates a lead from an unmatched Huggy contact, on explicit request only.

    Automatic creation is deliberately not offered: leads with no campaign attribution would
    silently distort Leads Totais, taxa de contato and the Campanhas page.
    """
    rows = await query(
        "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1", (contact_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Contato Huggy não encontrado")
    contact = dict(rows[0])

    phone = contact.get("phone_normalized") or contact.get("phone_raw")
    if not phone:
        raise HTTPException(status_code=400, detail="Contato sem telefone; não é possível criar lead.")

    try:
        lead = await leads_service.create_lead({
            "full_name": contact.get("full_name") or f"Contato Huggy {contact_id}",
            "phone": phone,
            "email": contact.get("email"),
            "platform": "huggy",
        })
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await query(
        "UPDATE huggy_contacts SET lead_id = ?, match_method = 'manual', updated_at = ? "
        "WHERE huggy_contact_id = ?",
        (lead["id"], _iso(_now()), contact_id),
    )
    await query(
        "UPDATE huggy_messages SET lead_id = ?, phone_normalized = ? WHERE huggy_contact_id = ?",
        (lead["id"], lead["phone"], contact_id),
    )
    await query(
        "UPDATE huggy_chats SET lead_id = ? WHERE huggy_contact_id = ?", (lead["id"], contact_id)
    )
    return {"ok": True, "lead": lead}
