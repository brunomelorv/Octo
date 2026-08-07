"""
Tests for the Huggy webhook receiver.

This is the project's first unauthenticated, state-changing endpoint, and Huggy offers no HMAC
signature — only a shared token learned during a handshake. These tests pin the layered defense
so a future refactor cannot quietly remove it.
"""
import json

import pytest

from app.services.database import query
from app.services.huggy_client import SETTINGS_KEY
from app.services.settings_service import get_settings, update_settings

WEBHOOK = "/api/huggy/webhook"


async def _arm(minutes: int = 15):
    from datetime import datetime, timedelta, timezone
    until = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(timespec="seconds")
    config = await get_settings(SETTINGS_KEY) or {}
    config["webhook_learn_until"] = until
    await update_settings(SETTINGS_KEY, config)


async def _set_token(token: str):
    config = await get_settings(SETTINGS_KEY) or {}
    config["webhook_token"] = token
    config["webhook_learn_until"] = None
    await update_settings(SETTINGS_KEY, config)


def _envelope(token: str, message_id: str = "m-1", phone: str = "+5511987654321") -> dict:
    return {
        "time": 1785950000,
        "token": token,
        "messages": {
            "receivedAllMessage": [{
                "id": message_id,
                "body": "olá",
                "senderType": "widget",
                "send_at": "2026-08-05 09:15:00",
                "sender": {"id": "c-1", "name": "Lead Teste", "phone": phone},
                "chat": {"id": 55501, "channel": "whatsapp",
                         "customer": {"id": "c-1", "phone": phone}},
            }]
        },
    }


@pytest.mark.asyncio
async def test_handshake_rejected_when_not_armed(client):
    """An attacker must not be able to install their own webhook token at will."""
    response = await client.post(WEBHOOK, json={"token": "tok-atacante", "validToken": True})
    assert response.status_code == 403
    config = await get_settings(SETTINGS_KEY) or {}
    assert not config.get("webhook_token")


@pytest.mark.asyncio
async def test_handshake_echoes_token_when_armed(client):
    """Huggy generates the token and expects it echoed back to finish the handshake."""
    await _arm()
    response = await client.post(WEBHOOK, json={"token": "tok-abc", "validToken": True})
    assert response.status_code == 200
    assert response.json()["token"] == "tok-abc"

    config = await get_settings(SETTINGS_KEY) or {}
    assert config["webhook_token"] == "tok-abc"
    # Arming is single-use: the window closes as soon as it is consumed.
    assert not config.get("webhook_learn_until")


@pytest.mark.asyncio
async def test_handshake_with_known_token_is_idempotent(client):
    """Re-saving the URL in Huggy replays the handshake; it must not fail."""
    await _set_token("tok-abc")
    response = await client.post(WEBHOOK, json={"token": "tok-abc", "validToken": True})
    assert response.status_code == 200
    assert response.json()["token"] == "tok-abc"


@pytest.mark.asyncio
async def test_handshake_with_different_token_when_disarmed_is_forbidden(client):
    await _set_token("tok-abc")
    response = await client.post(WEBHOOK, json={"token": "tok-outro", "validToken": True})
    assert response.status_code == 403
    config = await get_settings(SETTINGS_KEY) or {}
    assert config["webhook_token"] == "tok-abc"


@pytest.mark.asyncio
async def test_event_without_registered_token_is_unauthorized(client):
    response = await client.post(WEBHOOK, json=_envelope("qualquer"))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_event_with_wrong_token_is_unauthorized(client):
    await _set_token("tok-abc")
    response = await client.post(WEBHOOK, json=_envelope("tok-errado"))
    assert response.status_code == 401
    rows = await query("SELECT COUNT(*) as n FROM huggy_webhook_events")
    assert rows[0]["n"] == 0


@pytest.mark.asyncio
async def test_event_is_stored_and_processed(client):
    await _set_token("tok-abc")
    response = await client.post(WEBHOOK, json=_envelope("tok-abc"))
    assert response.status_code == 200
    body = response.json()
    assert body["seen"] == 1 and body["new"] == 1 and body["failed"] == 0

    rows = await query("SELECT event_type, processed FROM huggy_webhook_events")
    assert len(rows) == 1
    assert rows[0]["event_type"] == "receivedAllMessage"
    assert rows[0]["processed"] == 1

    messages = await query("SELECT huggy_message_id, direction, created_at FROM huggy_messages")
    assert len(messages) == 1
    assert messages[0]["direction"] == "in"
    # The renderer calls new Date(created_at).toISOString(); a space-separated value would
    # produce an invalid date in some browsers and blank the whole drawer.
    assert "T" in messages[0]["created_at"]


@pytest.mark.asyncio
async def test_duplicate_envelope_is_ignored(client):
    await _set_token("tok-abc")
    payload = _envelope("tok-abc")

    first = await client.post(WEBHOOK, json=payload)
    second = await client.post(WEBHOOK, json=payload)

    assert first.json()["new"] == 1
    assert second.json()["new"] == 0
    rows = await query("SELECT COUNT(*) as n FROM huggy_webhook_events")
    assert rows[0]["n"] == 1
    messages = await query("SELECT COUNT(*) as n FROM huggy_messages")
    assert messages[0]["n"] == 1


@pytest.mark.asyncio
async def test_batched_envelope_processes_every_event(client):
    """A single envelope carries several event types, each an array."""
    await _set_token("tok-abc")
    payload = {
        "time": 1785950000,
        "token": "tok-abc",
        "messages": {
            "receivedAllMessage": [
                {"id": "b-1", "body": "um", "senderType": "widget",
                 "send_at": "2026-08-05 09:00:00",
                 "sender": {"id": "c-9", "phone": "+5511900000001"},
                 "chat": {"id": 1, "customer": {"id": "c-9", "phone": "+5511900000001"}}},
                {"id": "b-2", "body": "dois", "senderType": "widget",
                 "send_at": "2026-08-05 09:01:00",
                 "sender": {"id": "c-9", "phone": "+5511900000001"},
                 "chat": {"id": 1, "customer": {"id": "c-9", "phone": "+5511900000001"}}},
            ],
            "startedChat": [
                {"id": 1, "chat": {"id": 1, "situation": "in_chat",
                                   "customer": {"id": "c-9", "phone": "+5511900000001"}}}
            ],
        },
    }
    response = await client.post(WEBHOOK, json=payload)
    assert response.status_code == 200
    assert response.json()["new"] == 3

    rows = await query("SELECT COUNT(*) as n FROM huggy_webhook_events")
    assert rows[0]["n"] == 3
    messages = await query("SELECT COUNT(*) as n FROM huggy_messages")
    assert messages[0]["n"] == 2


@pytest.mark.asyncio
async def test_unknown_event_type_is_stored_not_rejected(client):
    """Huggy may add event types; an unknown one must never break ingestion."""
    await _set_token("tok-abc")
    response = await client.post(WEBHOOK, json={
        "time": 1, "token": "tok-abc",
        "messages": {"eventoInexistente": [{"id": "u-1", "algo": "x"}]},
    })
    assert response.status_code == 200
    assert response.json()["failed"] == 0
    rows = await query("SELECT event_type, processed FROM huggy_webhook_events")
    assert rows[0]["event_type"] == "eventoInexistente"
    assert rows[0]["processed"] == 1


@pytest.mark.asyncio
async def test_oversize_payload_is_rejected(client):
    await _set_token("tok-abc")
    payload = {"token": "tok-abc", "messages": {"x": [{"id": "big", "body": "A" * 300000}]}}
    response = await client.post(WEBHOOK, json=payload)
    assert response.status_code == 413
    rows = await query("SELECT COUNT(*) as n FROM huggy_webhook_events")
    assert rows[0]["n"] == 0


@pytest.mark.asyncio
async def test_invalid_json_is_rejected(client):
    await _set_token("tok-abc")
    response = await client.post(
        WEBHOOK, content=b"nao e json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_message_for_unknown_phone_is_kept_unmatched(client):
    """No lead must be auto-created: that would distort campaign attribution."""
    await _set_token("tok-abc")
    await client.post(WEBHOOK, json=_envelope("tok-abc", phone="+5511999998888"))

    contacts = await query("SELECT lead_id, match_method FROM huggy_contacts")
    assert len(contacts) == 1
    assert contacts[0]["lead_id"] is None
    assert contacts[0]["match_method"] == "none"

    leads = await query("SELECT COUNT(*) as n FROM leads")
    assert leads[0]["n"] == 0
