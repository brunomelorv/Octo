"""
Huggy integration — persistence, lead matching and webhook event processing.

Design notes that are load-bearing:
- The e-mail/phone is the identity. `normalize_phone` is IMPORTED from leads_service, never
  copied: it already exists verbatim in Database/build_database.py, and a third copy would
  guarantee the three drift apart.
- Every timestamp written here is ISO-8601 WITH a 'T'. The lead drawer renders timeline items
  through `new Date(created_at).toISOString()`, which raises RangeError on an invalid date and
  blanks the whole panel. Huggy sends "YYYY-MM-DD HH:MM:SS", which not every browser parses.
- Huggy ids are stored as TEXT everywhere. The API returns them as both 419689 and "51917884".
"""
import hashlib
import json
import logging
import re
from datetime import datetime, timezone

from app.services.database import get_db, query
from app.services.leads_service import LEADS_TZ, normalize_phone

logger = logging.getLogger(__name__)

SETTINGS_KEY = "huggy_integration"

# Events we act on. Anything else is stored and ignored so Huggy can add events without
# breaking us. `receivedMessage` is deliberately absent: it only fires for chats in queue or
# automatic mode, so `receivedAllMessage` is the one that sees everything.
INBOUND_MESSAGE_EVENTS = ("receivedAllMessage",)
OUTBOUND_MESSAGE_EVENTS = ("sentAllMessage",)
MESSAGE_EVENTS = INBOUND_MESSAGE_EVENTS + OUTBOUND_MESSAGE_EVENTS
CHAT_EVENTS = ("startedChat", "closedChat", "agentEntered")
CONTACT_EVENTS = ("createdCustomer", "updatedCustomer")

# Cap on how many messages a single lead contributes to the drawer payload.
TIMELINE_MESSAGE_LIMIT = 200


async def init_huggy_tables() -> None:
    """Creates the Huggy tables. Called from the lifespan in main.py."""
    db = await get_db()
    try:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS huggy_webhook_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uid TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            envelope_time INTEGER,
            received_at TEXT NOT NULL,
            payload TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0,
            process_error TEXT
        );
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_huggy_events_type "
            "ON huggy_webhook_events(event_type, received_at);"
        )

        await db.execute("""
        CREATE TABLE IF NOT EXISTS huggy_contacts (
            huggy_contact_id TEXT PRIMARY KEY,
            phone_raw TEXT,
            phone_normalized TEXT,
            full_name TEXT,
            email TEXT,
            lead_id TEXT,
            match_method TEXT,
            last_chat_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_huggy_contacts_phone "
            "ON huggy_contacts(phone_normalized);"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_huggy_contacts_lead ON huggy_contacts(lead_id);"
        )

        await db.execute("""
        CREATE TABLE IF NOT EXISTS huggy_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            huggy_message_id TEXT NOT NULL UNIQUE,
            huggy_chat_id TEXT,
            huggy_contact_id TEXT,
            lead_id TEXT,
            phone_normalized TEXT,
            direction TEXT NOT NULL,
            sender_type TEXT,
            sender_name TEXT,
            huggy_agent_id TEXT,
            usuario_email TEXT,
            body TEXT,
            has_attachment INTEGER DEFAULT 0,
            attachment_url TEXT,
            created_at TEXT NOT NULL,
            raw TEXT
        );
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_huggy_msg_phone "
            "ON huggy_messages(phone_normalized, created_at);"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_huggy_msg_chat "
            "ON huggy_messages(huggy_chat_id, created_at);"
        )

        # `attachment_type` drives whether the drawer draws a picture, an audio player or a plain
        # link. `sender_photo` is the avatar Huggy hands us — stored rather than fetched on demand
        # because the media proxy will only serve a URL it can find in our own tables.
        for column in ("attachment_type TEXT", "sender_photo TEXT"):
            try:
                await db.execute(f"ALTER TABLE huggy_messages ADD COLUMN {column};")
            except Exception:
                pass

        await db.execute("""
        CREATE TABLE IF NOT EXISTS huggy_chats (
            huggy_chat_id TEXT PRIMARY KEY,
            huggy_contact_id TEXT,
            lead_id TEXT,
            situation TEXT,
            status TEXT,
            channel TEXT,
            huggy_agent_id TEXT,
            usuario_email TEXT,
            started_at TEXT,
            closed_at TEXT,
            last_message_at TEXT,
            updated_at TEXT
        );
        """)

        # A chat the bot still owns will not serve its messages (403 on /chats/{id}/messages),
        # but GET /chats/{id} does expose the last one plus an unread count. Mirroring them is
        # the only way to show anything at all about those conversations inside the CRM.
        for column in ("last_message_text TEXT", "last_message_sender TEXT", "unread INTEGER"):
            try:
                await db.execute(f"ALTER TABLE huggy_chats ADD COLUMN {column};")
            except Exception:
                pass

        await db.commit()
    finally:
        await db.close()


# --------------------------------------------------------------------------- timestamps

def to_iso(value) -> str:
    """
    Normalizes a Huggy timestamp to ISO-8601 with a 'T'.

    Accepts "YYYY-MM-DD HH:MM:SS" (what Huggy sends), already-ISO strings, and unix epochs.
    Falls back to "now" rather than returning something unparseable, because an invalid date
    reaching the drawer raises RangeError in the renderer and blanks the panel.
    """
    if value is None or value == "":
        return datetime.now(LEADS_TZ).isoformat(timespec="seconds")

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat(timespec="seconds")

    text = str(value).strip()
    if text.isdigit() and len(text) >= 10:
        return datetime.fromtimestamp(int(text), tz=timezone.utc).isoformat(timespec="seconds")

    # Space-separated is what Huggy sends; swapping in a 'T' makes it ISO and also makes
    # fromisoformat accept it, which covers offsets and microseconds for free.
    candidate = text.replace(" ", "T", 1)
    try:
        return datetime.fromisoformat(candidate.replace("Z", "+00:00")).isoformat(
            timespec="seconds"
        )
    except ValueError:
        pass

    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(candidate, fmt).isoformat(timespec="seconds")
        except ValueError:
            continue

    logger.warning("Timestamp Huggy não reconhecido (%r), usando agora", value)
    return datetime.now(LEADS_TZ).isoformat(timespec="seconds")


def _now_iso() -> str:
    return datetime.now(LEADS_TZ).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- lead matching

def _phone_variants(normalized: str) -> list[str]:
    """
    Returns the ninth-digit sibling of a Brazilian mobile number.

    A legacy 10-digit mobile and its 11-digit form normalize to two different, non-matching
    keys, so exact match alone silently misses real leads.
    """
    variants: list[str] = []
    if not normalized or not normalized.startswith("+55"):
        return variants

    digits = normalized[3:]  # DD + subscriber
    if len(digits) == 11 and digits[2] == "9":
        variants.append("+55" + digits[:2] + digits[3:])       # drop the 9
    elif len(digits) == 10 and digits[2] in "6789":
        variants.append("+55" + digits[:2] + "9" + digits[2:])  # insert the 9
    return variants


async def resolve_lead(raw_phone: str) -> tuple[str | None, str, str | None]:
    """
    Matches a Huggy phone number to a CRM lead.

    Returns (lead_id, match_method, phone_normalized). match_method is one of
    exact | nine_digit | suffix | none. An ambiguous suffix match deliberately does NOT link:
    attaching a customer conversation to the wrong lead is worse than leaving it unlinked.
    """
    normalized = normalize_phone(raw_phone)
    if not normalized:
        return None, "none", None

    rows = await query("SELECT id FROM leads WHERE phone = ? LIMIT 1", (normalized,))
    if rows:
        return rows[0]["id"], "exact", normalized

    for variant in _phone_variants(normalized):
        rows = await query("SELECT id FROM leads WHERE phone = ? LIMIT 1", (variant,))
        if rows:
            return rows[0]["id"], "nine_digit", normalized

    # Suffix net: same DDD + last 8 digits. Only accepted when unambiguous.
    digits = re.sub(r"\D", "", normalized)
    if len(digits) >= 10:
        suffix = digits[-8:]
        ddd = digits[2:4] if digits.startswith("55") else digits[:2]
        rows = await query(
            "SELECT id FROM leads WHERE phone LIKE ? AND phone LIKE ? LIMIT 3",
            (f"%{suffix}", f"%{ddd}%{suffix}"),
        )
        if len(rows) == 1:
            return rows[0]["id"], "suffix", normalized
        if len(rows) > 1:
            logger.info(
                "Telefone Huggy %s casou com %d leads pelo sufixo; não vinculado (ambíguo)",
                normalized, len(rows)
            )

    return None, "none", normalized


# --------------------------------------------------------------------------- contacts / chats

async def upsert_contact(
    huggy_contact_id: str,
    *,
    phone_raw: str | None = None,
    full_name: str | None = None,
    email: str | None = None,
    last_chat_id: str | None = None,
    force_rematch: bool = False,
) -> dict:
    """
    Creates or updates a Huggy contact row, resolving the lead once per contact.

    The suffix step of resolve_lead is a table scan, so matching is done on insert (or when
    explicitly asked to redo it) and cached on the row, never recomputed per message.
    """
    huggy_contact_id = str(huggy_contact_id)
    existing = await query(
        "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1", (huggy_contact_id,)
    )

    if existing and not force_rematch:
        row = existing[0]
        updates, params = [], []
        for column, value in (
            ("phone_raw", phone_raw),
            ("full_name", full_name),
            ("email", email),
            ("last_chat_id", last_chat_id),
        ):
            if value and not row.get(column):
                updates.append(f"{column} = ?")
                params.append(value)
        if last_chat_id and row.get("last_chat_id") != last_chat_id:
            if "last_chat_id = ?" not in updates:
                updates.append("last_chat_id = ?")
                params.append(last_chat_id)
        if updates:
            updates.append("updated_at = ?")
            params.extend([_now_iso(), huggy_contact_id])
            await query(
                f"UPDATE huggy_contacts SET {', '.join(updates)} WHERE huggy_contact_id = ?",
                tuple(params),
            )
            existing = await query(
                "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1",
                (huggy_contact_id,),
            )
        return existing[0]

    lead_id, match_method, normalized = await resolve_lead(phone_raw)
    now = _now_iso()

    if existing:
        await query(
            "UPDATE huggy_contacts SET phone_raw = ?, phone_normalized = ?, full_name = ?, "
            "email = ?, lead_id = ?, match_method = ?, last_chat_id = COALESCE(?, last_chat_id), "
            "updated_at = ? WHERE huggy_contact_id = ?",
            (phone_raw, normalized, full_name, email, lead_id, match_method,
             last_chat_id, now, huggy_contact_id),
        )
    else:
        await query(
            "INSERT INTO huggy_contacts (huggy_contact_id, phone_raw, phone_normalized, "
            "full_name, email, lead_id, match_method, last_chat_id, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (huggy_contact_id, phone_raw, normalized, full_name, email, lead_id,
             match_method, last_chat_id, now, now),
        )

    rows = await query(
        "SELECT * FROM huggy_contacts WHERE huggy_contact_id = ? LIMIT 1", (huggy_contact_id,)
    )
    return rows[0] if rows else {}


async def upsert_chat(huggy_chat_id: str, **fields) -> None:
    """Creates or updates a chat row. Only non-None fields overwrite existing values."""
    huggy_chat_id = str(huggy_chat_id)
    allowed = (
        "huggy_contact_id", "lead_id", "situation", "status", "channel",
        "huggy_agent_id", "usuario_email", "started_at", "closed_at", "last_message_at",
        "last_message_text", "last_message_sender", "unread",
    )
    data = {k: v for k, v in fields.items() if k in allowed and v is not None}

    existing = await query(
        "SELECT huggy_chat_id FROM huggy_chats WHERE huggy_chat_id = ? LIMIT 1", (huggy_chat_id,)
    )
    if existing:
        if not data:
            return
        sets = ", ".join(f"{k} = ?" for k in data)
        await query(
            f"UPDATE huggy_chats SET {sets}, updated_at = ? WHERE huggy_chat_id = ?",
            tuple(list(data.values()) + [_now_iso(), huggy_chat_id]),
        )
    else:
        columns = ["huggy_chat_id", *data.keys(), "updated_at"]
        values = [huggy_chat_id, *data.values(), _now_iso()]
        await query(
            f"INSERT INTO huggy_chats ({', '.join(columns)}) "
            f"VALUES ({', '.join('?' * len(columns))})",
            tuple(values),
        )


# --------------------------------------------------------------------------- messages

async def store_message(
    *,
    huggy_message_id: str,
    huggy_chat_id: str | None,
    contact: dict | None,
    direction: str,
    sender_type: str | None,
    sender_name: str | None,
    huggy_agent_id: str | None,
    body: str | None,
    attachment_url: str | None,
    created_at,
    raw: dict,
    attachment_type: str | None = None,
    sender_photo: str | None = None,
) -> bool:
    """
    Inserts a message, ignoring duplicates. Returns True when a row was actually written.

    Dedup is at the DB level (huggy_message_id UNIQUE) because the same message can arrive via
    two subscribed events and again through a manual sync. `database.query()` discards
    rowcount, so this uses an explicit cursor — same reason bug_report_service does.

    On a duplicate, `direction` and `sender_type` are corrected in place. INSERT OR IGNORE alone
    meant a row stored with the wrong side stayed wrong forever, and re-running the sync — the
    documented recovery path — could not repair it. Only these two columns are touched: the body
    and timestamp of a delivered message do not change, but our reading of who sent it can.
    """
    usuario_email = None
    if huggy_agent_id:
        rows = await query(
            "SELECT email FROM users WHERE huggy_agent_id = ? LIMIT 1", (str(huggy_agent_id),)
        )
        if rows:
            usuario_email = rows[0]["email"]

    db = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT OR IGNORE INTO huggy_messages (
                huggy_message_id, huggy_chat_id, huggy_contact_id, lead_id, phone_normalized,
                direction, sender_type, sender_name, huggy_agent_id, usuario_email,
                body, has_attachment, attachment_url, created_at, raw,
                attachment_type, sender_photo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(huggy_message_id),
                str(huggy_chat_id) if huggy_chat_id else None,
                (contact or {}).get("huggy_contact_id"),
                (contact or {}).get("lead_id"),
                (contact or {}).get("phone_normalized"),
                direction,
                sender_type,
                sender_name,
                str(huggy_agent_id) if huggy_agent_id else None,
                usuario_email,
                body,
                1 if attachment_url else 0,
                attachment_url,
                to_iso(created_at),
                json.dumps(raw, ensure_ascii=False)[:20000],
                attachment_type,
                sender_photo,
            ),
        )
        inserted = cursor.rowcount > 0
        if not inserted:
            # COALESCE on the media columns backfills rows written before they existed, without
            # overwriting anything already there. direction and sender_type are set outright:
            # those are the ones a re-sync exists to correct.
            await db.execute(
                "UPDATE huggy_messages SET direction = ?, sender_type = ?, "
                "attachment_type = COALESCE(attachment_type, ?), "
                "sender_photo = COALESCE(sender_photo, ?), "
                "attachment_url = COALESCE(attachment_url, ?), "
                "has_attachment = CASE WHEN COALESCE(attachment_url, ?) IS NOT NULL THEN 1 "
                "ELSE has_attachment END "
                "WHERE huggy_message_id = ?",
                (direction, sender_type, attachment_type, sender_photo, attachment_url,
                 attachment_url, str(huggy_message_id)),
            )
        await db.commit()
        return inserted
    finally:
        await db.close()


async def get_messages_for_phone(
    phone_normalized: str, since: str | None = None, limit: int = TIMELINE_MESSAGE_LIMIT
) -> list[dict]:
    """Messages for a lead, newest first, read from our own SQLite (never calls Huggy)."""
    if not phone_normalized:
        return []
    sql = (
        "SELECT huggy_message_id, huggy_chat_id, direction, sender_type, sender_name, "
        "usuario_email, body, has_attachment, attachment_url, attachment_type, sender_photo, "
        "created_at FROM huggy_messages WHERE phone_normalized = ?"
    )
    params: list = [phone_normalized]
    if since:
        sql += " AND created_at > ?"
        params.append(since)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    return [dict(r) for r in await query(sql, tuple(params))]


# --------------------------------------------------------------------------- event processing

def event_uid(event_type: str, item: dict, envelope_time) -> str:
    """
    Stable identity for a webhook event, so a replayed envelope is a no-op.

    Falls back to a hash of the canonical payload when the item carries no id.
    """
    raw_id = None
    if isinstance(item, dict):
        chat = item.get("chat")
        raw_id = item.get("id") or (chat.get("id") if isinstance(chat, dict) else None)
    if raw_id:
        return f"{event_type}:{raw_id}"
    digest = hashlib.sha256(
        (json.dumps(item, sort_keys=True, ensure_ascii=False) + str(envelope_time)).encode()
    ).hexdigest()
    return f"{event_type}:sha:{digest}"


async def record_event(uid: str, event_type: str, envelope_time, item: dict) -> bool:
    """Stores the raw event. Returns True if it is new (i.e. should be processed)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT OR IGNORE INTO huggy_webhook_events "
            "(event_uid, event_type, envelope_time, received_at, payload) VALUES (?, ?, ?, ?, ?)",
            (
                uid,
                event_type,
                int(envelope_time) if str(envelope_time or "").isdigit() else None,
                _now_iso(),
                json.dumps(item, ensure_ascii=False)[:200000],
            ),
        )
        inserted = cursor.rowcount > 0
        await db.commit()
        return inserted
    finally:
        await db.close()


async def mark_event_processed(uid: str, error: str | None = None) -> None:
    await query(
        "UPDATE huggy_webhook_events SET processed = ?, process_error = ? WHERE event_uid = ?",
        (0 if error else 1, error, uid),
    )


def _extract_phone(item: dict) -> str | None:
    """Digs the customer phone out of the several shapes Huggy uses across events."""
    for path in (
        ("sender", "phone"), ("sender", "mobile"),
        ("customer", "phone"), ("customer", "mobile"),
        ("chat", "customer", "phone"), ("chat", "customer", "mobile"),
        ("phone",), ("mobile",),
    ):
        node = item
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if node:
            return str(node)
    return None


def _extract_contact_id(item: dict) -> str | None:
    for path in (
        ("customer", "id"), ("chat", "customer", "id"), ("sender", "id"), ("id",),
    ):
        node = item
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if node:
            return str(node)
    return None


async def process_event(event_type: str, item: dict) -> None:
    """
    Applies one webhook event. Raises on failure so the caller records process_error;
    the raw row is already persisted, so anything that fails here stays replayable.
    """
    if event_type in MESSAGE_EVENTS:
        chat = item.get("chat") or {}
        chat_id = chat.get("id") or item.get("chatId")
        phone = _extract_phone(item)
        contact_id = _extract_contact_id(item)

        contact = None
        if contact_id:
            contact = await upsert_contact(
                contact_id,
                phone_raw=phone,
                full_name=(item.get("sender") or {}).get("name"),
                email=(item.get("sender") or {}).get("email"),
                last_chat_id=str(chat_id) if chat_id else None,
            )

        sender_type = item.get("senderType")
        # Huggy calls the customer side 'widget'/'customer'; anything else is our side.
        direction = "in" if event_type in INBOUND_MESSAGE_EVENTS else "out"
        agent_id = None
        if direction == "out":
            agent_id = (item.get("sender") or {}).get("id")

        await store_message(
            huggy_message_id=item.get("id"),
            huggy_chat_id=chat_id,
            contact=contact,
            direction=direction,
            sender_type=sender_type,
            sender_name=(item.get("sender") or {}).get("name"),
            huggy_agent_id=agent_id,
            body=item.get("body") or item.get("text"),
            attachment_url=item.get("file") or item.get("fileUrl"),
            created_at=item.get("send_at") or item.get("sendAt") or item.get("created_at"),
            raw=item,
        )

        if chat_id:
            await upsert_chat(
                chat_id,
                huggy_contact_id=(contact or {}).get("huggy_contact_id"),
                lead_id=(contact or {}).get("lead_id"),
                situation=chat.get("situation"),
                channel=chat.get("channel"),
                last_message_at=to_iso(item.get("send_at") or item.get("sendAt")),
            )
        return

    if event_type in CHAT_EVENTS:
        chat = item.get("chat") or item
        chat_id = chat.get("id")
        if not chat_id:
            return
        contact_id = _extract_contact_id(item)
        contact = None
        if contact_id:
            contact = await upsert_contact(
                contact_id,
                phone_raw=_extract_phone(item),
                last_chat_id=str(chat_id),
            )
        agent = item.get("agent") or {}
        await upsert_chat(
            chat_id,
            huggy_contact_id=(contact or {}).get("huggy_contact_id"),
            lead_id=(contact or {}).get("lead_id"),
            situation=chat.get("situation"),
            status=chat.get("status"),
            channel=chat.get("channel"),
            huggy_agent_id=str(agent.get("id")) if agent.get("id") else None,
            started_at=to_iso(chat.get("created_at")) if event_type == "startedChat" else None,
            closed_at=_now_iso() if event_type == "closedChat" else None,
        )
        return

    if event_type in CONTACT_EVENTS:
        contact_id = _extract_contact_id(item)
        if contact_id:
            await upsert_contact(
                contact_id,
                phone_raw=_extract_phone(item),
                full_name=item.get("name"),
                email=item.get("email"),
                force_rematch=True,
            )
        return

    # Unknown event: already stored, nothing to do. Never reject — Huggy may add events.
    logger.info("Evento Huggy sem tratamento: %s", event_type)


async def handle_envelope(payload: dict) -> dict:
    """
    Processes one webhook envelope. A single envelope carries several event types, each an
    array, so this walks both levels. Returns a small summary for logging/tests.
    """
    envelope_time = payload.get("time")
    messages = payload.get("messages") or {}
    seen = new = failed = 0

    for event_type, items in messages.items():
        if not isinstance(items, list):
            items = [items]
        for item in items:
            if not isinstance(item, dict):
                continue
            seen += 1
            uid = event_uid(event_type, item, envelope_time)
            if not await record_event(uid, event_type, envelope_time, item):
                continue  # duplicate envelope, already handled
            new += 1
            try:
                await process_event(event_type, item)
                await mark_event_processed(uid)
            except Exception as exc:  # keep the raw row; it stays replayable
                failed += 1
                logger.exception("Falha ao processar evento Huggy %s", uid)
                await mark_event_processed(uid, str(exc)[:500])

    return {"seen": seen, "new": new, "failed": failed}


async def count_unmatched_contacts() -> int:
    rows = await query(
        "SELECT COUNT(*) as n FROM huggy_contacts WHERE lead_id IS NULL OR lead_id = ''"
    )
    return rows[0]["n"] if rows else 0
