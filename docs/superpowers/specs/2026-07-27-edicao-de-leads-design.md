# Especificação de Design: Edição Manual e em Massa de Leads

**Data**: 27/07/2026  
**Status**: Proposto  

---

## 1. Visão Geral e Objetivo

Atualmente, o sistema permite listar leads, visualizar detalhes e atribuir/distribuir novos leads de forma automática ou via drag-and-drop no Kanban. No entanto, não há uma interface dedicada para fazer a **edição manual de dados de um lead** (corrigir nome, e-mail, telefone, cidade, campanha) nem para **edições em massa** (por exemplo, selecionar 50 leads e alterar a campanha ou reatribuir o consultor de uma só vez).

Esta especificação define a criação da tela **Edição de Leads** (localizada em `Leads > Edição de Leads`), combinando uma tabela com seleção múltipla, modal de edição individual e barra flutuante para ações em massa.

---

## 2. Experiência do Usuário & Telas (UI/UX)

### 2.1 Navegação (Sidebar)
Em `Sidebar.tsx`, o menu `Leads` passa a conter 3 subitens:
1. `Leads` (Visão Geral/Tabela principal) → `/leads`
2. `Importar Leads` → `/importar-leads`
3. `Distribuição` → `/distribuicao-leads`
4. **`Edição de Leads`** → `/edicao-leads`

### 2.2 Estrutura da Página `EdicaoLeadsPage.tsx`
* **Cabeçalho & Filtros**:
  * Campo de busca textual (Nome, Telefone, E-mail, Cidade, Campanha).
  * Filtro por Campanha.
  * Filtro por Consultor Atribuído.
  * Filtro por Status da Chamada / Lead.
  * Botão de recarregar e contadores de seleção.
* **Tabela de Leads**:
  * Checkbox no cabeçalho ("Selecionar todos os N leads da página").
  * Checkbox em cada linha.
  * Colunas: `Nome`, `Telefone`, `E-mail`, `Cidade`, `Campanha / Plataforma`, `Consultor Atribuído`, `Status`, `Ações`.
  * Botão `Editar` por linha (abre o **Modal de Edição Manual**).
* **Barra Flutuante de Ações em Massa (Bulk Actions Bar)**:
  * Aparece na parte inferior da tela assim que `1` ou mais leads forem selecionados.
  * Exibe a contagem: `X leads selecionados`.
  * Botões de Ação:
    * **Reatribuir Consultor**: Seleciona um consultor em um dropdown e aplica a todos os selecionados.
    * **Alterar Campanha**: Seleciona/digita nova campanha e aplica a todos.
    * **Excluir Leads**: Pede confirmação explícita antes de apagar os leads selecionados.
* **Modal de Edição Manual (Individual)**:
  * Formulario com os campos:
    * Nome Completo (`full_name`)
    * Telefone (`phone`)
    * E-mail (`email`)
    * Cidade (`city`)
    * Nome da Campanha (`campaign_name`)
    * Plataforma (`platform`)
    * Consultor Responsável (`usuario_email`)
  * Botões: `Cancelar` e `Salvar Alterações`.

---

## 3. Arquitetura do Backend e APIs

### 3.1 Endpoints no `backend/app/routers/leads.py`

#### 1. `PUT /leads/{lead_id}`
* **Descrição**: Atualiza os dados de um lead individual.
* **Permissão**: Usuários autenticados (Master/Head editam qualquer lead, Consultor edita os seus).
* **Body**:
```json
{
  "full_name": "João da Silva",
  "phone": "5511999998888",
  "email": "joao@email.com",
  "city": "São Paulo",
  "campaign_name": "Campanha Meta Q3",
  "platform": "fb",
  "consultant_email": "consultor@empresa.com"
}
```

#### 2. `POST /leads/bulk-update`
* **Descrição**: Executa atualização em lote para uma lista de IDs de leads.
* **Body**:
```json
{
  "lead_ids": [101, 102, 103],
  "updates": {
    "consultant_email": "novo_consultor@empresa.com",
    "campaign_name": "Nova Campanha",
    "lead_status": "Contatado"
  }
}
```

#### 3. `POST /leads/bulk-delete`
* **Descrição**: Exclui em lote os leads informados.
* **Body**:
```json
{
  "lead_ids": [101, 102, 103]
}
```

---

## 4. Alterações nos Serviços (`leads_service.py` e `leads.ts`)

1. **`leads_service.py`**:
   * Implementar `update_lead(lead_id, data, user)`: Atualiza `leads` e faz upsert em `negocios` se `consultant_email` for alterado.
   * Implementar `bulk_update_leads(lead_ids, updates, user)`: Atualiza múltiplos registros em uma transação SQLite.
   * Implementar `bulk_delete_leads(lead_ids, user)`: Remove registros de `leads` (e sincroniza `negocios`).
2. **`frontend/src/services/leads.ts`**:
   * Adicionar métodos `updateLead`, `bulkUpdateLeads` e `bulkDeleteLeads`.

---

## 5. Estratégia de Verificação

1. **Testes do Backend (Pytest)**:
   * Testar atualização de campos de um lead.
   * Testar reatribuição de consultor em lote.
   * Testar deleção em lote.
2. **Compilação do Frontend**:
   * Executar `npx tsc --noEmit` e `npm run build` no diretório `frontend`.
3. **Verificação Manual**:
   * Navegar até `/edicao-leads`.
   * Selecionar leads individuais e testar o modal de edição.
   * Selecionar múltiplos leads e aplicar reatribuição em massa.
