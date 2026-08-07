"""
Tests for chats Huggy still keeps inside the bot flow.

Huggy answers GET /chats/{id}/messages with 403 while a chat's `situation` is "auto", and this
was verified against the live account: every `auto` chat returned 403, every `in_chat` and
`finishing` one returned 200, with or without an agent assigned. The state is normal, not a
failure — but the first version reported it as "A Huggy recusou as credenciais. Reconecte em
Configurações.", which sent an operator to re-authenticate a working integration while the real
cause (a conversation still with the bot) went unmentioned. These tests pin the three pieces
that made that message wrong.
"""
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.database import query

PHONE = "+5564992550595"


@pytest_asyncio.fixture
async def token():
    from app.services.auth_service import create_access_token
    return create_access_token({"sub": "admin@example.com", "role": "admin"})


async def _lead_with_chat(situation: str | None, chat_id: str = "505801194"):
    """A lead whose Huggy chat we already know about — the precondition sync requires."""
    await query(
        "INSERT INTO leads (id, phone, full_name, created_time) VALUES (?, ?, ?, ?)",
        ("l:1", PHONE, "Bruno Melo", "2026-08-01T10:00:00-03:00"),
    )
    await query(
        "INSERT INTO huggy_chats (huggy_chat_id, huggy_contact_id, lead_id, situation, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (chat_id, "153733083", "l:1", situation, "2026-08-05T18:06:13-03:00"),
    )


# --------------------------------------------------------------------------- client layer

def test_extract_hint_reads_reasons():
    """
    Huggy sends 403s as {"reason": ...} and nothing else.

    Omitting that key is what produced a bare "recusou as credenciais" with no cause attached.
    """
    from app.services.huggy_client import _extract_hint

    class _Response:
        def __init__(self, payload):
            self._payload = payload
            self.text = ""

        def json(self):
            return self._payload

    assert _extract_hint(_Response({"reason": "Desculpe, você não tem permissão"})) == \
        "Desculpe, você não tem permissão"
    # The previously handled keys must keep working.
    assert _extract_hint(_Response({"hint": "The JWT string must have two dots"})) == \
        "The JWT string must have two dots"
    assert _extract_hint(_Response({"message": "algo"})) == "algo"


@pytest.mark.asyncio
async def test_403_raises_forbidden_not_auth_error(app_setup):
    """
    A 403 must not be reported as an authentication failure.

    HuggyAuthError tells the user to reconnect; doing that for a 403 means re-running OAuth on
    credentials that Huggy just accepted.
    """
    import httpx

    from app.services.huggy_client import (
        HuggyAuthError, HuggyForbidden, SETTINGS_KEY, request,
    )
    from app.services.settings_service import update_settings

    await update_settings(SETTINGS_KEY, {"enabled": True, "access_token": "t", "company_id": "1"})

    forbidden = httpx.Response(
        403, json={"reason": "Desculpe, você não tem permissão"},
        request=httpx.Request("GET", "https://api.huggy.app/v3/chats/1/messages"),
    )
    with patch("httpx.AsyncClient.request", AsyncMock(return_value=forbidden)):
        with pytest.raises(HuggyForbidden) as excinfo:
            await request("GET", "/chats/1/messages")

    assert not isinstance(excinfo.value, HuggyAuthError)
    # The reason has to reach the user; its absence is what made the original report unusable.
    assert "não tem permissão" in str(excinfo.value)
    assert "Reconecte" not in str(excinfo.value)


# --------------------------------------------------------------------------- sync

@pytest.mark.asyncio
async def test_sync_skips_bot_chat_without_calling_messages(client: AsyncClient, token: str):
    """A chat in `auto` is reported, not fetched — asking would only earn a 403."""
    await _lead_with_chat("auto")
    calls = []

    async def fake_request(method, path, **kwargs):
        calls.append(path)
        return {"id": 505801194, "situation": "auto"}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/sync", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["in_bot"] == 1
    assert body["synced"] == 0
    assert "atendimento automático" in body["message"]
    assert not any("/messages" in path for path in calls), calls


@pytest.mark.asyncio
async def test_sync_imports_when_chat_left_the_bot(client: AsyncClient, token: str):
    """The same lead syncs normally once the chat is with an agent."""
    await _lead_with_chat("auto")  # stale local value; Huggy is the source of truth

    async def fake_request(method, path, **kwargs):
        if path.endswith("/messages"):
            return [{
                "id": "real-1", "body": "Oi, tenho interesse", "senderType": "widget",
                "send_at": "2026-08-05 18:05:30", "sender": {"id": "153733083", "name": "Bruno"},
            }]
        return {"id": 505801194, "situation": "in_chat"}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/sync", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["synced"] == 1
    assert body["in_bot"] == 0
    assert body["message"] is None
    # The refreshed situation must be persisted, otherwise the tag would stay on after the
    # conversation has already moved to an agent.
    rows = await query("SELECT situation FROM huggy_chats WHERE huggy_chat_id = '505801194'")
    assert rows[0]["situation"] == "in_chat"


@pytest.mark.asyncio
async def test_sync_reports_403_without_telling_the_user_to_reconnect(
    client: AsyncClient, token: str
):
    """A genuine 403 surfaces as 403 with Huggy's reason, not as a credentials problem."""
    await _lead_with_chat("in_chat")

    from app.services.huggy_client import HuggyForbidden

    with patch(
        "app.services.huggy_client.request",
        side_effect=HuggyForbidden("A Huggy negou o acesso a este recurso (sem permissão)."),
    ):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/sync", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 403
    assert "Reconecte" not in response.json()["detail"]


# --------------------------------------------------------------------------- messages endpoint

@pytest.mark.asyncio
async def test_messages_endpoint_flags_bot_chat(client: AsyncClient, token: str):
    """The drawer needs the state on open, so an empty conversation explains itself."""
    await _lead_with_chat("auto")

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["in_bot"] is True
    assert body["chat_situation"] == "auto"


@pytest.mark.asyncio
async def test_messages_endpoint_does_not_flag_agent_chat(client: AsyncClient, token: str):
    await _lead_with_chat("in_chat")

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )

    body = response.json()
    assert body["in_bot"] is False
    assert body["chat_situation"] == "in_chat"


@pytest.mark.asyncio
async def test_sync_stores_the_preview_of_a_bot_chat(client: AsyncClient, token: str):
    """
    The last message and unread count are all Huggy gives away about a bot chat.

    They arrive on the same GET /chats/{id} the sync already makes, and without them the drawer
    can only say "there is a conversation" without a shred of what is in it.
    """
    await _lead_with_chat("auto")

    async def fake_request(method, path, **kwargs):
        return {
            "id": 505801194,
            "situation": "auto",
            "unread": 3,
            "lastMessage": {
                "text": "Escolha uma opção",
                "sendAt": "2026-08-05 18:05:28",
                "sender": {"id": 1, "name": "Auto"},
            },
        }

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        await client.post(
            f"/api/huggy/leads/{PHONE}/sync", headers={"Authorization": f"Bearer {token}"}
        )

    rows = await query(
        "SELECT last_message_text, last_message_sender, last_message_at, unread "
        "FROM huggy_chats WHERE huggy_chat_id = '505801194'"
    )
    assert rows[0]["last_message_text"] == "Escolha uma opção"
    assert rows[0]["last_message_sender"] == "Auto"
    assert rows[0]["unread"] == 3
    # Huggy's space-separated shape must reach the frontend parseable, or the drawer blanks.
    assert "T" in rows[0]["last_message_at"]

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )
    preview = response.json()["last_message"]
    assert preview["text"] == "Escolha uma opção"
    assert preview["sender"] == "Auto"
    assert preview["unread"] == 3


@pytest.mark.asyncio
async def test_preview_is_dropped_once_an_agent_takes_over(client: AsyncClient, token: str):
    """
    With the chat on an agent the mirrored messages are the real history.

    Still serving the preview would duplicate the newest message right above the timeline that
    already contains it.
    """
    await _lead_with_chat("in_chat")
    await query(
        "UPDATE huggy_chats SET last_message_text = ?, unread = ? WHERE huggy_chat_id = ?",
        ("Escolha uma opção", 3, "505801194"),
    )

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )

    body = response.json()
    assert body["in_bot"] is False
    assert body["last_message"] is None


@pytest.mark.asyncio
async def test_bot_chat_without_preview_still_reports_the_state(client: AsyncClient, token: str):
    """A chat recorded before the preview columns existed must still raise the tag."""
    await _lead_with_chat("auto")

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )

    body = response.json()
    assert body["in_bot"] is True
    assert body["last_message"] is None


@pytest.mark.asyncio
async def test_messages_endpoint_handles_unknown_situation(client: AsyncClient, token: str):
    """A chat recorded before we tracked `situation` must not be reported as a bot chat."""
    await _lead_with_chat(None)

    response = await client.get(
        f"/api/huggy/leads/{PHONE}/messages", headers={"Authorization": f"Bearer {token}"}
    )

    body = response.json()
    assert body["in_bot"] is False
    assert body["chat_situation"] is None
