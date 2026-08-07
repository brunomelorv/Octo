"""
Tests for matching a Huggy phone number to a CRM lead.

`leads.phone` is the de-facto business key of this CRM, and Brazilian mobile numbers exist in
two shapes (with and without the ninth digit) that normalize to different, non-matching keys.
Exact match alone therefore misses real leads, and an over-eager match attaches a customer's
private conversation to the wrong person — so the cascade and its ambiguity guard are both
pinned here.
"""
import pytest

from app.services.database import query
from app.services.huggy_service import resolve_lead, to_iso


async def _insert_lead(lead_id: str, phone: str, name: str = "Lead"):
    await query(
        "INSERT INTO leads (id, phone, full_name, created_time) VALUES (?, ?, ?, ?)",
        (lead_id, phone, name, "2026-08-01T10:00:00-03:00"),
    )


@pytest.mark.asyncio
async def test_exact_match(app_setup):
    await _insert_lead("l:1", "+5511987654321")
    lead_id, method, normalized = await resolve_lead("+5511987654321")
    assert lead_id == "l:1"
    assert method == "exact"
    assert normalized == "+5511987654321"


@pytest.mark.asyncio
async def test_match_without_plus_and_unformatted(app_setup):
    """Huggy may deliver the number in any shape; normalization happens first."""
    await _insert_lead("l:1", "+5511987654321")
    for raw in ("5511987654321", "11987654321", "(11) 98765-4321", "+55 11 98765 4321"):
        lead_id, method, _ = await resolve_lead(raw)
        assert lead_id == "l:1", f"falhou para {raw!r}"
        assert method == "exact"


@pytest.mark.asyncio
async def test_eleven_digit_lead_found_by_ten_digit_number(app_setup):
    """Lead stored with the ninth digit, Huggy sends the legacy 10-digit form."""
    await _insert_lead("l:1", "+5511987654321")
    lead_id, method, _ = await resolve_lead("+551187654321")
    assert lead_id == "l:1"
    assert method == "nine_digit"


@pytest.mark.asyncio
async def test_ten_digit_lead_found_by_eleven_digit_number(app_setup):
    """The reverse: legacy lead in the DB, modern number arriving from Huggy."""
    await _insert_lead("l:1", "+551187654321")
    lead_id, method, _ = await resolve_lead("+5511987654321")
    assert lead_id == "l:1"
    assert method == "nine_digit"


@pytest.mark.asyncio
async def test_ambiguous_suffix_does_not_link(app_setup):
    """
    Two leads sharing the last 8 digits in the same DDD must leave the contact unlinked.

    Guessing here would show one customer's WhatsApp conversation on another customer's record.
    """
    # Both end in 87654321 and share DDD 11, so the suffix net catches the two of them.
    await _insert_lead("l:1", "+5511987654321", "Primeiro")
    await _insert_lead("l:2", "+5511887654321", "Segundo")
    # Matches neither exactly, and has no ninth-digit sibling, so it falls through to the suffix.
    lead_id, method, _ = await resolve_lead("+5511787654321")
    assert lead_id is None
    assert method == "none"


@pytest.mark.asyncio
async def test_unambiguous_suffix_does_link(app_setup):
    """With a single candidate the suffix net is the whole point: it recovers real matches."""
    await _insert_lead("l:1", "+5511987654321", "Unico")
    lead_id, method, _ = await resolve_lead("+5511787654321")
    assert lead_id == "l:1"
    assert method == "suffix"


@pytest.mark.asyncio
async def test_no_match_returns_none(app_setup):
    await _insert_lead("l:1", "+5511987654321")
    lead_id, method, normalized = await resolve_lead("+5521999990000")
    assert lead_id is None
    assert method == "none"
    # The normalized value is still returned so the contact row keeps a usable key.
    assert normalized == "+5521999990000"


@pytest.mark.asyncio
async def test_garbage_phone_is_safe(app_setup):
    lead_id, method, normalized = await resolve_lead("nao-e-telefone")
    assert lead_id is None
    assert method == "none"
    assert normalized is None


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", [
    "2018-04-19 13:37:34",        # the shape Huggy actually sends
    "2026-08-05T10:00:00-03:00",  # already ISO
    "2026-08-05",                 # date only
    1631130946,                   # unix epoch
    "",
    None,
    "totalmente-invalido",
])
async def test_to_iso_always_yields_a_T(raw):
    """
    Every timestamp handed to the frontend must be parseable.

    The lead drawer renders `new Date(created_at).toISOString()`, which raises RangeError on an
    invalid date and blanks the entire panel — the same failure mode that took the Performance
    page down. to_iso must never emit something a browser cannot parse, not even for garbage.
    """
    result = to_iso(raw)
    assert "T" in result
    from datetime import datetime
    datetime.fromisoformat(result)  # raises if unparseable
