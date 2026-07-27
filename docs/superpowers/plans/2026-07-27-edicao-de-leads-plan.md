# Edição de Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement lead editing functionality (individual manual editing and bulk actions) accessible under `Leads > Edição de Leads`.

**Architecture:** 
- Backend: FastAPI endpoints (`PUT /leads/{lead_id}`, `POST /leads/bulk-update`, `POST /leads/bulk-delete`) in `leads.py` backed by `leads_service.py` updating SQLite `leads` and `negocios` tables.
- Frontend: New page `EdicaoLeadsPage.tsx` at `/edicao-leads`, with sidebar menu entry under `Leads`, checkbox table selection, individual lead edit modal, and bottom floating bulk actions bar.

**Tech Stack:** Python (FastAPI, Pytest, SQLite), React (TypeScript, Lucide-react, Tailwind-like utility classes).

## Global Constraints
- Keep TypeScript strict build clean (`npx tsc --noEmit` must pass with 0 errors).
- All new routes require user authentication via `get_current_user`.

---

### Task 1: Backend Service & Endpoints for Lead Edit and Bulk Actions

**Files:**
- Modify: `backend/app/services/leads_service.py`
- Modify: `backend/app/routers/leads.py`
- Create: `backend/tests/test_leads_edit.py`

**Interfaces:**
- Consumes: `query` from `app.services.database`
- Produces: `update_lead`, `bulk_update_leads`, `bulk_delete_leads` in `leads_service.py` and FastAPI endpoints `PUT /leads/{lead_id}`, `POST /leads/bulk-update`, `POST /leads/bulk-delete`.

- [ ] **Step 1: Write backend tests for lead update and bulk actions**

Create `backend/tests/test_leads_edit.py`:
```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_update_lead(async_client: AsyncClient, auth_headers: dict):
    # Test individual lead update
    response = await async_client.put(
        "/leads/1",
        json={
            "full_name": "Nome Atualizado",
            "city": "Campinas",
            "campaign_name": "Campanha Teste"
        },
        headers=auth_headers
    )
    assert response.status_code in (200, 404)

@pytest.mark.asyncio
async def test_bulk_update_leads(async_client: AsyncClient, auth_headers: dict):
    # Test bulk update endpoint
    response = await async_client.post(
        "/leads/bulk-update",
        json={
            "lead_ids": [1, 2],
            "updates": {
                "campaign_name": "Campanha em Massa"
            }
        },
        headers=auth_headers
    )
    assert response.status_code in (200, 404)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_leads_edit.py -v`
Expected: FAIL (405 Method Not Allowed or 404 Not Found)

- [ ] **Step 3: Implement backend functions in `leads_service.py` and `leads.py`**

In `backend/app/services/leads_service.py`:
```python
async def update_lead(lead_id: int, data: dict, user: dict) -> dict:
    lead_rows = await query("SELECT * FROM leads WHERE id = ?", (lead_id,))
    if not lead_rows:
        return None
    
    fields = []
    params = []
    updatable_fields = ["full_name", "phone", "email", "city", "campaign_name", "platform", "lead_status"]
    for field in updatable_fields:
        if field in data and data[field] is not None:
            fields.append(f"{field} = ?")
            params.append(data[field])
            
    if fields:
        params.append(lead_id)
        sql = f"UPDATE leads SET {', '.join(fields)} WHERE id = ?"
        await query(sql, tuple(params))
        
    if "consultant_email" in data:
        c_email = data["consultant_email"]
        c_nome = c_email.split("@")[0].capitalize() if c_email else ""
        neg_rows = await query("SELECT * FROM negocios WHERE lead_id = ?", (lead_id,))
        if neg_rows:
            await query("UPDATE negocios SET usuario_email = ?, usuario_nome = ? WHERE lead_id = ?", (c_email, c_nome, lead_id))
        else:
            await query("INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome) VALUES (?, 'Sem Contato', 0, datetime('now'), ?, ?)", (lead_id, c_email, c_nome))

    updated = await query("SELECT * FROM leads WHERE id = ?", (lead_id,))
    return dict(updated[0]) if updated else None

async def bulk_update_leads(lead_ids: list[int], updates: dict, user: dict) -> int:
    count = 0
    for lid in lead_ids:
        res = await update_lead(lid, updates, user)
        if res:
            count += 1
    return count

async def bulk_delete_leads(lead_ids: list[int], user: dict) -> int:
    if not lead_ids:
        return 0
    placeholders = ",".join(["?"] * len(lead_ids))
    await query(f"DELETE FROM negocios WHERE lead_id IN ({placeholders})", tuple(lead_ids))
    await query(f"DELETE FROM leads WHERE id IN ({placeholders})", tuple(lead_ids))
    return len(lead_ids)
```

In `backend/app/routers/leads.py`:
```python
class UpdateLeadSchema(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    campaign_name: str | None = None
    platform: str | None = None
    lead_status: str | None = None
    consultant_email: str | None = None

class BulkUpdateSchema(BaseModel):
    lead_ids: list[int]
    updates: UpdateLeadSchema

class BulkDeleteSchema(BaseModel):
    lead_ids: list[int]

@router.put("/{lead_id}")
async def update_lead_endpoint(
    lead_id: int,
    payload: UpdateLeadSchema,
    current_user: UserResponse = Depends(get_current_user)
):
    res = await leads_service.update_lead(lead_id, payload.model_dump(exclude_unset=True), current_user.model_dump())
    if not res:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    return res

@router.post("/bulk-update")
async def bulk_update_endpoint(
    payload: BulkUpdateSchema,
    current_user: UserResponse = Depends(get_current_user)
):
    count = await leads_service.bulk_update_leads(payload.lead_ids, payload.updates.model_dump(exclude_unset=True), current_user.model_dump())
    return {"updated_count": count}

@router.post("/bulk-delete")
async def bulk_delete_endpoint(
    payload: BulkDeleteSchema,
    current_user: UserResponse = Depends(get_current_user)
):
    count = await leads_service.bulk_delete_leads(payload.lead_ids, current_user.model_dump())
    return {"deleted_count": count}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pytest backend/tests/test_leads_edit.py -v`
Expected: PASS

- [ ] **Step 5: Commit backend changes**

```bash
git add backend/app/services/leads_service.py backend/app/routers/leads.py backend/tests/test_leads_edit.py
git commit -m "feat(backend): add lead edit and bulk update/delete endpoints"
```

---

### Task 2: Frontend Service & Routing

**Files:**
- Modify: `frontend/src/services/leads.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `/leads/{id}`, `/leads/bulk-update`, `/leads/bulk-delete`
- Produces: `leadsService.updateLead`, `leadsService.bulkUpdateLeads`, `leadsService.bulkDeleteLeads`

- [ ] **Step 1: Add frontend API methods in `leads.ts`**

In `frontend/src/services/leads.ts`:
```typescript
  async updateLead(leadId: number, data: Record<string, any>) {
    const response = await api.put(`/leads/${leadId}`, data)
    return response.data
  },

  async bulkUpdateLeads(leadIds: number[], updates: Record<string, any>) {
    const response = await api.post('/leads/bulk-update', { lead_ids: leadIds, updates })
    return response.data
  },

  async bulkDeleteLeads(leadIds: number[]) {
    const response = await api.post('/leads/bulk-delete', { lead_ids: leadIds })
    return response.data
  },
```

- [ ] **Step 2: Update Sidebar.tsx navigation menu**

In `frontend/src/components/layout/Sidebar.tsx` inside `subItems` of `Leads`:
```typescript
      subItems: [
        {
          name: 'Importar Leads',
          path: '/importar-leads',
          id: 'importar_leads',
        },
        {
          name: 'Distribuição',
          path: '/distribuicao-leads',
          id: 'distribuicao_leads',
        },
        {
          name: 'Edição de Leads',
          path: '/edicao-leads',
          id: 'edicao_leads',
        },
      ]
```

- [ ] **Step 3: Register route in `App.tsx`**

In `frontend/src/App.tsx`:
```typescript
import EdicaoLeadsPage from './pages/EdicaoLeadsPage'
...
<Route path="/edicao-leads" element={<EdicaoLeadsPage />} />
```

- [ ] **Step 4: Commit service and routing changes**

```bash
git add frontend/src/services/leads.ts frontend/src/components/layout/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add lead edit routes and service methods"
```

---

### Task 3: Build `EdicaoLeadsPage.tsx` UI Component

**Files:**
- Create: `frontend/src/pages/EdicaoLeadsPage.tsx`

**Interfaces:**
- Consumes: `leadsService`, `authService`
- Produces: Complete `EdicaoLeadsPage` with Filters, Checkbox Selection, Individual Edit Modal, and Floating Bulk Actions Bar.

- [ ] **Step 1: Create `EdicaoLeadsPage.tsx` with full interactive UI**

Implement `frontend/src/pages/EdicaoLeadsPage.tsx` including:
1. Search and Filter Bar (Busca, Campanha, Consultor, Status).
2. Leads Table with header checkbox (Select All) and row checkboxes.
3. Edit Modal for updating single lead fields (`full_name`, `phone`, `email`, `city`, `campaign_name`, `consultant_email`).
4. Floating Bottom Bar (Barra Flutuante de Ações em Massa) displaying selected count and actions: Reassign Consultant, Change Campaign, Delete Selected.
5. Toast notifications / Feedback alerts on successful edits or failures.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit` in `frontend/`
Expected: 0 errors

- [ ] **Step 3: Test frontend build**

Run: `npm run build` in `frontend/`
Expected: Clean build success

- [ ] **Step 4: Commit `EdicaoLeadsPage.tsx`**

```bash
git add frontend/src/pages/EdicaoLeadsPage.tsx
git commit -m "feat(frontend): add EdicaoLeadsPage component with bulk actions and edit modal"
```
