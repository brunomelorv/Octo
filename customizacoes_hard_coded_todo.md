# TODO: Customizações de Itens Hard Coded (Side Bar)

Abaixo estão listados os itens que atualmente estão fixos (hard coded) no código e que seriam excelentes candidatos para serem movidos para uma tela de configurações ou para a *side bar* do sistema, permitindo que administradores personalizem o CRM sem a necessidade de alterar o código-fonte.

## 1. Templates de Mensagem do WhatsApp
- **Arquivo atual:** `frontend/src/components/WhatsAppTemplateSelector.tsx`
- **O que está hard coded:** O array `TEMPLATES` contém as mensagens pré-definidas (Apresentação, Follow-up, Agendamento, etc) e suas respectivas variáveis (ex: `{nome}`, `{campanha}`).
- **O que precisa ser feito:**
  - [ ] Criar uma interface na side bar (Configurações de WhatsApp) para o usuário adicionar, editar e remover templates.
  - [ ] Criar tabelas/endpoints no banco de dados para salvar os templates customizados de cada usuário/conta.
  - [ ] Atualizar o componente `WhatsAppTemplateSelector.tsx` para buscar os templates da API em vez de usar a constante local.

## 2. Setup e Prompt da Inteligência Artificial (Insights)
- **Arquivo atual:** `backend/app/routers/leads.py` (rota `/campaign-insights`)
- **O que está hard coded:** O *prompt* inteiro passado para a OpenAI (explicando como ele deve agir, os dados que recebe e o HTML que deve gerar), o modelo (`gpt-4o-mini`), e os parâmetros de criatividade (`temperature: 0.5`).
- **O que precisa ser feito:**
  - [ ] Adicionar na side bar uma seção de "Configurações de IA".
  - [ ] Permitir a edição do *System Prompt* e do *User Prompt* base.
  - [ ] Permitir a seleção do modelo de IA a ser utilizado (ex: GPT-4o, GPT-4o-mini) e ajuste de parâmetros como *temperature*.
  - [ ] Salvar essas configurações no banco de dados (provavelmente junto da *API Key* que já é salva de forma dinâmica) e lê-las na execução da rota.

## 3. Estágios do Funil e Motivos de Perda (Classificações)
- **Arquivo atual:** `frontend/src/utils/dashboardHelpers.ts` (e em algumas lógicas de views no DB/Backend).
- **O que está hard coded:** Strings exatas para classificar os leads, como `'Agendou Reunião'`, `'Lead Qualificado'`, `'Caixa Postal / Não Atendido'`, `'Lead Hostil / Irritado'`, `'Fora do Perfil de Cliente Ideal'`, etc. O funil e os KPIs dependem desses nomes exatos.
- **O que precisa ser feito:**
  - [ ] Criar um gerenciador de "Status e Motivos de Perda" na side bar, para que a operação possa cadastrar suas próprias nomenclaturas.
  - [ ] Refatorar os cálculos do dashboard (`dashboardHelpers.ts`) para agrupar os motivos e status com base em categorias mapeadas no banco (ex: Categoria "Perda", Categoria "Aguardando"), em vez de comparar as strings diretamente.
  - [ ] Garantir que o processo de importação e processamento de chamadas utilize os status customizados cadastrados.

## 4. Scores e Regras de "Ligação Quente"
- **Arquivo atual:** `frontend/src/utils/dashboardHelpers.ts`
- **O que está hard coded:** A lógica considera uma "Hot Call" se o `score >= 5` ou se a classificação for exatamente uma de um pequeno grupo de opções (`'Agendou Reunião'`, etc).
- **O que precisa ser feito:**
  - [ ] Colocar nas configurações (side bar) o "Limiar de Score para Leads Quentes" (ex: poder alterar de 5 para 7).
  - [ ] Permitir que o usuário defina quais status ou classificações devem automaticamente colocar o lead na lista de "Ligações Quentes".
