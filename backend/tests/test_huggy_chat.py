"""
Tests for reading and sending the Huggy conversation.

The direction of a synced message is the load-bearing detail: the drawer draws inbound on the
left and outbound on the right, so getting it wrong does not degrade the chat, it makes it lie
about who said what. The webhook is safe (Huggy names the event), but GET /chats/{id}/messages
carries no such label and the obvious substitute — `senderType` — turned out to hold the channel
name on a real WhatsApp chat. The payloads below are copied from the live account.
"""
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.database import query

# app.routers.huggy is imported inside each test on purpose. Importing a router at module scope
# pulls in app.routers.auth during collection, and that module reads COOKIE_SECURE at import time
# (auth.py:8, default "true") — before conftest can set it to false. The cookie would then be
# issued Secure, httpx would refuse to send it back over http, and test_auth's cookie test would
# fail 401 with nothing to do with this file.

PHONE = "+5562993371323"
CHAT_ID = "506225441"
CONTACT_ID = "153846965"

# Verbatim from GET /chats/506225441/messages on the live account.
CUSTOMER_MESSAGE = {
    "id": "real-1", "body": "Bom dia", "type": "text",
    "senderType": "whatsapp-enterprise", "send_at": "2026-08-06 10:53:30",
    "sender": {"id": 153846965, "name": "Liah Lobo", "phone": "556293371323"},
}
AGENT_MESSAGE = {
    "id": "real-3", "body": "Olá bom dia!", "type": "text",
    "senderType": "agent", "send_at": "2026-08-06 10:53:31",
    "sender": {"id": 1, "name": "Auto"},
}
INTERNAL_EVENT = {
    "id": "real-2", "body": "Agente Auto colocou o atendimento na fila",
    "type": "internalEvent", "senderType": "whatsapp-enterprise",
    "send_at": "2026-08-06 10:53:31", "sender": None,
}

CONTACT = {"huggy_contact_id": CONTACT_ID, "lead_id": "l:1", "phone_normalized": PHONE}


@pytest_asyncio.fixture
async def token():
    from app.services.auth_service import create_access_token
    return create_access_token({"sub": "admin@example.com", "role": "admin"})


async def _lead_with_chat():
    await query(
        "INSERT INTO leads (id, phone, full_name, created_time) VALUES (?, ?, ?, ?)",
        ("l:1", PHONE, "Liah Lobo", "2026-08-01T10:00:00-03:00"),
    )
    await query(
        "INSERT INTO huggy_contacts (huggy_contact_id, phone_normalized, lead_id, full_name, "
        "created_at) VALUES (?, ?, ?, ?, ?)",
        (CONTACT_ID, PHONE, "l:1", "Liah Lobo", "2026-08-06T10:53:00-03:00"),
    )
    await query(
        "INSERT INTO huggy_chats (huggy_chat_id, huggy_contact_id, lead_id, situation, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (CHAT_ID, CONTACT_ID, "l:1", "in_chat", "2026-08-06T10:54:00-03:00"),
    )


# --------------------------------------------------------------------------- direction

def test_customer_message_is_inbound():
    """
    The regression that started this: senderType is the CHANNEL, not the side.

    "whatsapp-enterprise" matches nothing in the widget/customer/contact list, so the old rule
    filed the lead's own "Bom dia" as outbound — and every bubble would have drawn on the right.
    """
    from app.routers.huggy import _message_direction

    assert _message_direction(CUSTOMER_MESSAGE, CONTACT) == "in"


def test_agent_message_is_outbound():
    from app.routers.huggy import _message_direction

    assert _message_direction(AGENT_MESSAGE, CONTACT) == "out"


def test_internal_event_is_neither_side():
    from app.routers.huggy import _message_direction

    assert _message_direction(INTERNAL_EVENT, CONTACT) == "event"


def test_widget_sender_still_inbound_without_a_contact():
    """The legacy channels keep working, including when we never matched a contact."""
    from app.routers.huggy import _message_direction

    assert _message_direction({"senderType": "widget", "sender": {"id": "c-1"}}, None) == "in"


def test_unknown_sender_defaults_to_outbound_not_inbound():
    """
    Defaulting the other way would attribute one of our messages to the customer.

    An unattributable message shown as ours is a cosmetic error; shown as theirs it invents a
    customer statement that never happened.
    """
    from app.routers.huggy import _message_direction

    assert _message_direction({"senderType": "algo-novo", "sender": {"id": 99}}, CONTACT) == "out"


# --------------------------------------------------------------------------- sync + repair

@pytest.mark.asyncio
async def test_sync_classifies_each_side_and_repairs_old_rows(client: AsyncClient, token: str):
    """
    A re-sync must fix rows stored with the wrong side.

    store_message is INSERT OR IGNORE, so without the repair the four messages already mirrored
    from the live account would keep their wrong direction forever.
    """
    await _lead_with_chat()
    from app.services.huggy_service import store_message

    # The state the bug left behind: the customer's message filed as ours.
    await store_message(
        huggy_message_id="real-1", huggy_chat_id=CHAT_ID, contact=CONTACT,
        direction="out", sender_type="whatsapp-enterprise", sender_name="Liah Lobo",
        huggy_agent_id=None, body="Bom dia", attachment_url=None,
        created_at="2026-08-06 10:53:30", raw=CUSTOMER_MESSAGE,
    )

    async def fake_request(method, path, **kwargs):
        if path.endswith("/messages"):
            return [CUSTOMER_MESSAGE, INTERNAL_EVENT, AGENT_MESSAGE]
        return {"id": int(CHAT_ID), "situation": "in_chat"}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/sync", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    # The pre-existing row is repaired, not duplicated.
    assert response.json()["synced"] == 2

    rows = await query(
        "SELECT huggy_message_id, direction FROM huggy_messages WHERE huggy_chat_id = ?",
        (CHAT_ID,),
    )
    directions = {r["huggy_message_id"]: r["direction"] for r in rows}
    assert directions == {"real-1": "in", "real-2": "event", "real-3": "out"}


# --------------------------------------------------------------------------- sending

@pytest.mark.asyncio
async def test_send_message_persists_it_with_huggys_id(client: AsyncClient, token: str):
    """
    The mirrored copy must carry the id Huggy assigned.

    That id is what makes the webhook echo of the same message collide with the UNIQUE
    constraint instead of showing up a second time.
    """
    await _lead_with_chat()
    sent_payloads = []

    async def fake_request(method, path, **kwargs):
        sent_payloads.append((method, path, kwargs.get("json")))
        return {"id": "huggy-987", "text": "Boa tarde!", "senderType": "agent",
                "sendAt": "2026-08-06 14:00:00", "sender": {"id": 190991, "name": "Bruno"}}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": "Boa tarde!"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert sent_payloads == [("POST", f"/chats/{CHAT_ID}/messages", {"text": "Boa tarde!"})]

    rows = await query(
        "SELECT huggy_message_id, direction, body FROM huggy_messages WHERE huggy_chat_id = ?",
        (CHAT_ID,),
    )
    assert len(rows) == 1
    assert rows[0]["huggy_message_id"] == "huggy-987"
    assert rows[0]["direction"] == "out"
    assert rows[0]["body"] == "Boa tarde!"


@pytest.mark.asyncio
async def test_send_without_a_known_chat_is_refused(client: AsyncClient, token: str):
    """Nothing to send into: the user is pointed at the button that creates the chat."""
    await query(
        "INSERT INTO leads (id, phone, full_name, created_time) VALUES (?, ?, ?, ?)",
        ("l:1", PHONE, "Liah Lobo", "2026-08-01T10:00:00-03:00"),
    )

    response = await client.post(
        f"/api/huggy/leads/{PHONE}/messages",
        json={"text": "Oi"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert "Abrir conversa" in response.json()["detail"]


@pytest.mark.asyncio
async def test_send_rejects_empty_text(client: AsyncClient, token: str):
    await _lead_with_chat()

    for text in ("", "   "):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": text},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 422, text


@pytest.mark.asyncio
async def test_consultor_cannot_send_to_someone_elses_lead(client: AsyncClient):
    """Same restriction the rest of the integration applies to reading."""
    from app.services.auth_service import create_access_token

    await _lead_with_chat()
    await query(
        "INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)",
        ("outro@example.com", "Outro Consultor", "dummyhash", "consultor", 1),
    )
    # No row in `negocios` links this lead to them, which is what _consultor_owns_lead checks.
    consultor = create_access_token({"sub": "outro@example.com", "role": "consultor"})

    with patch("app.services.huggy_client.request") as request_mock:
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": "Oi"},
            headers={"Authorization": f"Bearer {consultor}"},
        )

    assert response.status_code == 403
    # Nothing may reach a customer before the check passes.
    request_mock.assert_not_called()


# --------------------------------------------------------------------------- media proxy

@pytest.mark.asyncio
async def test_media_proxy_refuses_a_url_we_never_stored(client: AsyncClient, token: str):
    """
    The SSRF guard, and the reason this endpoint can take a URL at all.

    `url` is attacker-controllable, so without the "must already be in our tables" check it would
    let anyone point the server at an internal address and read the response back.
    """
    await _lead_with_chat()

    with patch("app.routers.huggy._fetch_media") as fetch:
        response = await client.get(
            "/api/huggy/media",
            params={"url": "http://169.254.169.254/latest/meta-data/"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 404
    fetch.assert_not_called()


@pytest.mark.asyncio
async def test_media_proxy_serves_a_stored_attachment(client: AsyncClient, token: str):
    import httpx as httpx_module

    await _lead_with_chat()
    from app.services.huggy_service import store_message

    url = "https://c.pzw.io/img/foto.png"
    await store_message(
        huggy_message_id="img-1", huggy_chat_id=CHAT_ID, contact=CONTACT,
        direction="in", sender_type="whatsapp-enterprise", sender_name="Liah Lobo",
        huggy_agent_id=None, body=None, attachment_url=url, attachment_type="image",
        created_at="2026-08-06 12:00:00", raw={},
    )

    upstream = httpx_module.Response(
        200, content=b"\x89PNG-bytes", headers={"content-type": "image/png"},
        request=httpx_module.Request("GET", url),
    )
    with patch("app.routers.huggy._fetch_media", AsyncMock(return_value=upstream)) as fetch:
        response = await client.get(
            "/api/huggy/media", params={"url": url},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.content == b"\x89PNG-bytes"
    assert response.headers["content-type"] == "image/png"
    # The Huggy token must not be handed to a CDN that never asked for it.
    assert "Authorization" not in fetch.await_args.args[1]


@pytest.mark.asyncio
async def test_media_proxy_requires_login(client: AsyncClient):
    response = await client.get("/api/huggy/media", params={"url": "https://c.pzw.io/x.png"})
    assert response.status_code == 401


# --------------------------------------------------------------------------- sending media

@pytest.mark.asyncio
async def test_send_strips_the_data_uri_prefix(client: AsyncClient, token: str):
    """Huggy wants the base64 payload alone; a browser hands over a full data: URI."""
    await _lead_with_chat()
    captured = []

    async def fake_request(method, path, **kwargs):
        captured.append(kwargs.get("json"))
        return {"id": "huggy-audio-1", "text": "", "senderType": "agent",
                "type": "audio", "file": "https://c.pzw.io/a/audio.ogg",
                "sendAt": "2026-08-06 15:00:00", "sender": {"id": 190991, "name": "Bruno"}}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": "", "file_base64": "data:audio/ogg;base64,T2dnUwAB", "file_name": "audio.ogg"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert captured[0]["fileBase64"] == "T2dnUwAB"
    assert captured[0]["fileName"] == "audio.ogg"
    # The reply Huggy sent back describes an audio, and that has to survive into our mirror.
    assert response.json()["attachment_type"] == "audio"

    rows = await query(
        "SELECT attachment_type, attachment_url FROM huggy_messages WHERE huggy_message_id = ?",
        ("huggy-audio-1",),
    )
    assert rows[0]["attachment_type"] == "audio"
    assert rows[0]["attachment_url"] == "https://c.pzw.io/a/audio.ogg"


@pytest.mark.asyncio
async def test_send_accepts_a_file_with_no_text(client: AsyncClient, token: str):
    """A voice note travels on its own — requiring text would block the mic button."""
    await _lead_with_chat()

    async def fake_request(method, path, **kwargs):
        return {"id": "huggy-audio-2", "senderType": "agent", "sendAt": "2026-08-06 15:05:00"}

    with patch("app.services.huggy_client.request", side_effect=fake_request):
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": "", "file_base64": "T2dnUwAB"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_send_rejects_an_oversized_file(client: AsyncClient, token: str):
    await _lead_with_chat()

    with patch("app.services.huggy_client.request") as request_mock:
        response = await client.post(
            f"/api/huggy/leads/{PHONE}/messages",
            json={"text": "", "file_base64": "A" * (11 * 1024 * 1024 + 1)},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 413
    request_mock.assert_not_called()


@pytest.mark.asyncio
async def test_a_rejected_upload_says_why(app_setup):
    """
    Huggy's reason has to reach the message, not just the log.

    This is the same defect the 403 path had: the upload of a browser recording came back
    {"reason": "Arquivo inválido"} and the user was shown a bare "erro 400", with the actual
    cause visible only to whoever went digging through container logs.
    """
    import httpx

    from app.services.huggy_client import HuggyRequestError, SETTINGS_KEY, request
    from app.services.settings_service import update_settings

    await update_settings(SETTINGS_KEY, {"enabled": True, "access_token": "t", "company_id": "1"})

    refused = httpx.Response(
        400, json={"reason": "Arquivo inválido"},
        request=httpx.Request("POST", "https://api.huggy.app/v3/chats/1/messages"),
    )
    with patch("httpx.AsyncClient.request", AsyncMock(return_value=refused)):
        with pytest.raises(HuggyRequestError) as excinfo:
            await request("POST", "/chats/1/messages", json={"fileBase64": "x"})

    assert "Arquivo inválido" in str(excinfo.value)
    assert excinfo.value.status_code == 400
