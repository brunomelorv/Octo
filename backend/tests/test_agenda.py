import pytest
import pytest_asyncio
from httpx import AsyncClient
from unittest.mock import patch
from datetime import datetime
from app.services.database import query
from app.services.auth_service import create_access_token
from app.services.agenda_service import (
    get_agenda,
    add_agenda_comment,
    complete_agenda_item,
    reschedule_agenda_item
)

@pytest_asyncio.fixture(autouse=True)
async def setup_agenda_tables(app_setup):
    """Ensure all required tables for agenda tests exist and are clean before each test."""
    await query("DROP TABLE IF EXISTS leads")
    await query("DROP TABLE IF EXISTS chamadas")
    await query("DROP TABLE IF EXISTS negocios")
    await query("DROP TABLE IF EXISTS agenda_comments")
    await query("DROP TABLE IF EXISTS agenda_completions")
    await query("DROP TABLE IF EXISTS negocios_historico")
    
    await query("""
        CREATE TABLE leads (
            id TEXT PRIMARY KEY,
            full_name TEXT,
            phone TEXT,
            email TEXT,
            city TEXT,
            campaign_name TEXT
        );
    """)
    await query("""
        CREATE TABLE chamadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_contato TEXT,
            telefone_normalizado TEXT,
            data_hora TEXT,
            resumo_ligacao TEXT,
            status_ligacao TEXT,
            anotacoes TEXT,
            source_file TEXT,
            data_retorno_agendado TEXT,
            horario_retorno_agendado TEXT,
            tipo_retorno TEXT,
            reuniao_agendada TEXT
        );
    """)
    await query("""
        CREATE TABLE negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT,
            tags TEXT,
            loss_reason TEXT,
            loss_comment TEXT
        );
    """)
    await query("""
        CREATE TABLE agenda_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telefone_normalizado TEXT NOT NULL,
            data_agendamento TEXT NOT NULL,
            comentario TEXT NOT NULL,
            created_at TEXT NOT NULL,
            usuario_email TEXT NOT NULL
        );
    """)
    await query("""
        CREATE TABLE agenda_completions (
            chamada_id INTEGER PRIMARY KEY,
            completed_at TEXT NOT NULL,
            completed_by TEXT NOT NULL
        );
    """)
    await query("""
        CREATE TABLE negocios_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id TEXT NOT NULL,
            etapa_anterior TEXT,
            etapa_nova TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            usuario_email TEXT NOT NULL,
            usuario_nome TEXT NOT NULL,
            data_hora TEXT NOT NULL
        );
    """)
    yield

@pytest_asyncio.fixture
async def admin_token():
    return create_access_token({"sub": "admin@example.com", "role": "admin"})

@pytest_asyncio.fixture
async def consultor_token():
    return create_access_token({"sub": "consultor@example.com", "role": "consultor"})

# ================= SERVICE TESTS =================

@pytest.mark.asyncio
async def test_get_agenda_empty():
    items = await get_agenda("2026-07-13")
    assert items == []

@pytest.mark.asyncio
async def test_get_agenda_invalid_date():
    items = await get_agenda("invalid-date")
    assert items == []

@pytest.mark.asyncio
async def test_get_agenda_with_structured_event():
    # Insert a lead and a structured scheduled call
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-1", "John Doe", "5511999999999"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("John Doe", "5511999999999", "2026-07-13T10:00:00", "2026-07-13", "14:30", "Chamada")
    )
    
    items = await get_agenda("2026-07-13")
    assert len(items) == 1
    assert items[0]["lead_name"] == "John Doe"
    assert items[0]["phone"] == "5511999999999"
    assert items[0]["time"] == "14:30"
    assert items[0]["event_type"] == "Chamada"
    assert items[0]["is_completed"] is False

@pytest.mark.asyncio
async def test_get_agenda_fallback_parsing():
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-2", "Jane Doe", "5511888888888"))
    
    # Text-based agenda matching via resumo_ligacao regex fallback for 13/07/26
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao) 
           VALUES (?, ?, ?, ?)""",
        ("Jane Doe", "5511888888888", "2026-07-12T10:00:00", "Chamada agendada para: 13/07/26 16:00")
    )
    
    items = await get_agenda("2026-07-13")
    assert len(items) == 1
    assert items[0]["lead_name"] == "Jane Doe"
    assert items[0]["phone"] == "5511888888888"
    assert items[0]["time"] == "16:00"
    assert items[0]["event_type"] == "Chamada"

@pytest.mark.asyncio
async def test_get_agenda_ignores_lost_deals_and_disqualified():
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-lost", "Lost Lead", "5511777777777"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("Lost Lead", "5511777777777", "2026-07-13T10:00:00", "2026-07-13", "14:30", "Chamada")
    )
    await query("INSERT INTO negocios (lead_id, etapa) VALUES (?, ?)", ("lead-lost", "Perdido"))
    
    # Disqualified lead
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-disq", "Disqualified Lead", "5511666666666"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, resumo_ligacao) 
           VALUES (?, ?, ?, ?, ?)""",
        ("Disqualified Lead", "5511666666666", "2026-07-13T10:00:00", "2026-07-13", "some text with {lead desqualificado} here")
    )
    
    items = await get_agenda("2026-07-13")
    assert len(items) == 0

@pytest.mark.asyncio
async def test_get_agenda_role_filtering():
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-assigned", "My Lead", "5511555555555"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado) 
           VALUES (?, ?, ?, ?, ?)""",
        ("My Lead", "5511555555555", "2026-07-13T10:00:00", "2026-07-13", "11:00")
    )
    await query("INSERT INTO negocios (lead_id, etapa, usuario_email, usuario_nome) VALUES (?, ?, ?, ?)", ("l-assigned", "Sem Contato", "consultor@example.com", "Consultor Name"))
    
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-other", "Other Lead", "5511444444444"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado) 
           VALUES (?, ?, ?, ?, ?)""",
        ("Other Lead", "5511444444444", "2026-07-13T10:00:00", "2026-07-13", "12:00")
    )
    await query("INSERT INTO negocios (lead_id, etapa, usuario_email, usuario_nome) VALUES (?, ?, ?, ?)", ("l-other", "Sem Contato", "other@example.com", "Other Name"))
    
    # Admin sees both
    admin_items = await get_agenda("2026-07-13", {"role": "admin", "email": "admin@example.com"})
    assert len(admin_items) == 2
    
    # Consultor sees only theirs
    consultor_items = await get_agenda("2026-07-13", {"role": "consultor", "email": "consultor@example.com"})
    assert len(consultor_items) == 1
    assert consultor_items[0]["phone"] == "5511555555555"

@pytest.mark.asyncio
async def test_add_agenda_comment_simple():
    comment = await add_agenda_comment("5511999999999", "2026-07-13", "Regular comment text", "user@example.com")
    assert comment is not None
    assert comment["comentario"] == "Regular comment text"
    assert comment["usuario_email"] == "user@example.com"
    
    # Verify comment created in database
    rows = await query("SELECT comentario FROM agenda_comments WHERE telefone_normalizado = ?", ("5511999999999",))
    assert len(rows) == 1
    assert rows[0]["comentario"] == "Regular comment text"
    
    # Verify CRM annotation row created in chamadas
    call_rows = await query("SELECT status_ligacao, anotacoes FROM chamadas WHERE telefone_normalizado = ? AND status_ligacao = ?", ("5511999999999", "Anotação CRM"))
    assert len(call_rows) == 1
    assert call_rows[0]["anotacoes"] == "Regular comment text"

@pytest.mark.asyncio
async def test_add_agenda_comment_with_scheduling_tag():
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-tagged", "Lead Name", "5511333333333"))
    await query("INSERT INTO negocios (lead_id, etapa) VALUES (?, ?)", ("lead-tagged", "Sem Contato"))
    
    tagged_comment = "[Tag: Tarefa - Data: 2026-07-20 - Horário: 15:45] Follow-up task comment"
    comment = await add_agenda_comment("5511333333333", "2026-07-13", tagged_comment, "user@example.com")
    
    # Check future schedule event in chamadas
    scheduled_calls = await query("SELECT data_retorno_agendado, horario_retorno_agendado, tipo_retorno, resumo_ligacao FROM chamadas WHERE telefone_normalizado = ? AND status_ligacao = ?", ("5511333333333", "Tarefa Agendada"))
    assert len(scheduled_calls) == 1
    assert scheduled_calls[0]["data_retorno_agendado"] == "2026-07-20"
    assert scheduled_calls[0]["horario_retorno_agendado"] == "15:45"
    assert scheduled_calls[0]["tipo_retorno"] == "Tarefa"
    assert scheduled_calls[0]["resumo_ligacao"] == "Tarefa agendada para: 20/07/26 15:45"
    
    # Check history record created
    history = await query("SELECT etapa_anterior, etapa_nova FROM negocios_historico WHERE lead_id = ?", ("lead-tagged",))
    assert len(history) == 1
    assert history[0]["etapa_anterior"] == "Sem Contato"
    assert history[0]["etapa_nova"] == "Tag: Tarefa"

@pytest.mark.asyncio
async def test_complete_agenda_item_logic():
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("lead-complete", "Lead Full Name", "5511222222222"))
    await query("INSERT INTO negocios (lead_id, etapa) VALUES (?, ?)", ("lead-complete", "Contato Inicial"))
    await query("INSERT INTO chamadas (id, nome_contato, telefone_normalizado) VALUES (?, ?, ?)", (99, "Lead Full Name", "5511222222222"))
    
    success = await complete_agenda_item(99, "user@example.com", "5511222222222", "Lead Full Name", deal_stage="Reunião Agendada")
    assert success is True
    
    # Verify completion entry
    comps = await query("SELECT completed_by FROM agenda_completions WHERE chamada_id = ?", (99,))
    assert len(comps) == 1
    assert comps[0]["completed_by"] == "user@example.com"
    
    # Verify kanban stage synced
    neg = await query("SELECT etapa FROM negocios WHERE lead_id = ?", ("lead-complete",))
    assert neg[0]["etapa"] == "Reunião Agendada"

@pytest.mark.asyncio
async def test_reschedule_agenda_item_logic():
    success = await reschedule_agenda_item("5511111111111", "Lead Resched", "2026-07-25", "09:30", "user@example.com", "Customer requested morning call")
    assert success is True
    
    # Verify new call row inserted
    calls = await query("SELECT data_retorno_agendado, horario_retorno_agendado, tipo_retorno, resumo_ligacao FROM chamadas WHERE telefone_normalizado = ? AND status_ligacao = ?", ("5511111111111", "Reagendamento CRM"))
    assert len(calls) == 1
    assert calls[0]["data_retorno_agendado"] == "2026-07-25"
    assert calls[0]["horario_retorno_agendado"] == "09:30"
    assert calls[0]["tipo_retorno"] == "Retorno"
    assert "Customer requested morning call" in calls[0]["resumo_ligacao"]


# ================= ROUTER / API TESTS =================

@pytest.mark.asyncio
async def test_api_read_agenda_unauthorized(client: AsyncClient):
    response = await client.get("/api/agenda/?date=2026-07-13")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_api_read_agenda_success(client: AsyncClient, admin_token: str):
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-api", "API Lead", "5511999999901"))
    await query(
        """INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("API Lead", "5511999999901", "2026-07-13T10:00:00", "2026-07-13", "14:00", "Chamada")
    )
    
    response = await client.get("/api/agenda/?date=2026-07-13", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["phone"] == "5511999999901"
    assert data[0]["time"] == "14:00"

@pytest.mark.asyncio
async def test_api_create_agenda_comment(client: AsyncClient, admin_token: str):
    req_body = {
        "phone": "5511999999902",
        "date_str": "2026-07-13",
        "comment": "API generated comment text"
    }
    response = await client.post(
        "/api/agenda/comments",
        json=req_body,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["comentario"] == "API generated comment text"
    assert data["usuario_email"] == "admin@example.com"  # overridden by token email

@pytest.mark.asyncio
async def test_api_complete_agenda(client: AsyncClient, admin_token: str):
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-comp", "Complete API Lead", "5511999999903"))
    await query("INSERT INTO chamadas (id, nome_contato, telefone_normalizado) VALUES (?, ?, ?)", (101, "Complete API Lead", "5511999999903"))
    
    req_body = {
        "chamada_id": 101,
        "phone": "5511999999903",
        "lead_name": "Complete API Lead",
        "deal_stage": "Contatado"
    }
    response = await client.post(
        "/api/agenda/complete",
        json=req_body,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json() == {"success": True}

@pytest.mark.asyncio
async def test_api_reschedule_agenda(client: AsyncClient, admin_token: str):
    req_body = {
        "phone": "5511999999904",
        "lead_name": "Reschedule API Lead",
        "new_date_str": "2026-07-15",
        "new_time_str": "10:30",
        "comment": "API Reschedule note"
    }
    response = await client.post(
        "/api/agenda/reschedule",
        json=req_body,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json() == {"success": True}

@pytest.mark.asyncio
async def test_api_agenda_performance(client: AsyncClient, admin_token: str):
    # Setup some completed and pending agenda items for performance testing
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-perf-1", "Lead Perf 1", "5511999999905"))
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-perf-2", "Lead Perf 2", "5511999999906"))
    
    # 2 calls on 2026-07-13
    await query(
        """INSERT INTO chamadas (id, nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (201, "Lead Perf 1", "5511999999905", "2026-07-13T10:00:00", "2026-07-13", "14:00", "Chamada")
    )
    await query(
        """INSERT INTO chamadas (id, nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (202, "Lead Perf 2", "5511999999906", "2026-07-13T10:30:00", "2026-07-13", "15:00", "Chamada")
    )
    
    # Complete 1 call
    await query("INSERT INTO agenda_completions (chamada_id, completed_at, completed_by) VALUES (?, ?, ?)", (201, "2026-07-13T14:15:00", "admin@example.com"))
    
    response = await client.get(
        "/api/agenda/performance?date_start=2026-07-13&date_end=2026-07-13",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    
    assert data["summary"]["total"] == 2
    assert data["summary"]["completed"] == 1
    assert data["summary"]["pending"] == 1
    assert data["summary"]["completion_rate"] == 50.0
    
    daily = data["daily"]
    assert len(daily) == 1
    assert daily[0]["date"] == "2026-07-13"
    assert daily[0]["total"] == 2
    assert daily[0]["completed"] == 1

@pytest.mark.asyncio
async def test_api_performance_leads(client: AsyncClient, admin_token: str):
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-perf-3", "Lead Perf 3", "5511999999907"))
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("l-perf-4", "Lead Perf 4", "5511999999908"))
    
    await query(
        """INSERT INTO chamadas (id, nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (301, "Lead Perf 3", "5511999999907", "2026-07-13T10:00:00", "2026-07-13", "14:00", "Chamada")
    )
    await query(
        """INSERT INTO chamadas (id, nome_contato, telefone_normalizado, data_hora, data_retorno_agendado, horario_retorno_agendado, tipo_retorno) 
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (302, "Lead Perf 4", "5511999999908", "2026-07-13T10:30:00", "2026-07-13", "15:00", "Chamada")
    )
    
    await query("INSERT INTO agenda_completions (chamada_id, completed_at, completed_by) VALUES (?, ?, ?)", (301, "2026-07-13T14:15:00", "admin@example.com"))
    
    # Get completed leads
    response = await client.get(
        "/api/agenda/performance-leads?date_start=2026-07-13&date_end=2026-07-13&status=completed",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["phone"] == "5511999999907"
    assert data[0]["is_completed"] is True
    
    # Get pending leads
    response = await client.get(
        "/api/agenda/performance-leads?date_start=2026-07-13&date_end=2026-07-13&status=pending",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["phone"] == "5511999999908"
    assert data[0]["is_completed"] is False
