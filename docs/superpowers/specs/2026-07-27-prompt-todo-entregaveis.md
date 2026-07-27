# Prompt Mestre e Contexto do Projeto: Planejamento de Entregáveis (WhatsApp Oficial, VOIP e Automação de Leads)

**Data**: 27/07/2026  
**Objetivo**: Prompt completo com o contexto técnico real do projeto Octo / Lead Analytics e especificação detalhada dos 3 novos pilares para geração de Lista de TODOs para IAs.

---

## CONTEXTO DO PROJETO PARA COPIAR E COLAR NA IA

```markdown
### CONTEXTO TÉCNICO E ARQUITETURA DO PROJETO OCTO / LEAD ANALYTICS

Você é um Arquiteto de Software Senior e Gerente de Projetos especialista em CRM de Vendas, SDR e Integrações de Marketing/Comunicação. 

Estou trabalhando no desenvolvimento de um sistema de CRM e Lead Analytics chamado **Octo / Lead Analytics**. 

#### 1. Stack Tecnológica Atual:
- **Frontend**: React 18 (TypeScript), Vite, Vanilla CSS + Tailwind utility classes, Lucide React (ícones), React Router DOM v6, Zustand (gerenciamento de estado de Auth e Configurações), Axios.
- **Backend**: Python 3.11, FastAPI (REST API), Uvicorn, SQLite assíncrono (`aiosqlite`), Pydantic v2, Pytest, SlowAPI (rate-limiting), HTTPX.
- **Banco de Dados**: SQLite (`leads.db`) contendo as tabelas principais:
  - `leads`: id, full_name, phone, email, city, campaign_name, platform, lead_status, created_time, etc.
  - `negocios`: lead_id, etapa, valor, usuario_email, usuario_nome, updated_at, tags, loss_reason.
  - `chamadas`: telefone_normalizado, data_hora, duracao_segundos, resumo_ligacao, reuniao_agendada, tag, status_ligacao, link_gravacao.
  - `users`: id, email, name, role (master, head, administrativo, consultor), active, password_hash.
  - `settings`: permissões, insights de IA, personalização da marca.
- **Infraestrutura e Deploy**: Docker Multi-stage (`Dockerfile` no frontend com Nginx e no backend com Python 3.11-slim) orquestrado por `docker-compose.prod.yml`, Nginx como Proxy Reverso com SSL Certbot e contêiner isolado de backup diário do SQLite.

#### 2. Módulos Já Implementados:
- **Dashboard**: Métricas consolidadas, gráficos e insights estratégicos alimentados por IA (OpenAI).
- **Agenda do Dia**: Gestão de compromissos, tarefas de retorno e ligações do SDR de voz.
- **Gestão de Leads**: Listagem completa, importação manual/CSV, distribuição dinâmica entre consultores e página de **Edição de Leads (edição manual e ações em massa)**.
- **Funil de Negócios**: Visualização Kanban por etapas comerciais com histórico auditável de transições.
- **Campanhas & Performance**: Diagnóstico de tráfego pago e métricas de desempenho por consultor.
- **Gestão de Usuários e Permissões**: Perfis com acessos granulares por aba e recurso.

---

### NOVOS ENTREGÁVEIS SOLICITADOS (ESCOPO):

Precisamos planejar e detalhar a implementação dos 3 seguintes grandes módulos no sistema:

1. **WhatsApp API Oficial (Modo Coexistência)**:
   - Integração com a API Oficial da Meta (Cloud API ou BSP como Z-API / Twilio / Evolution API Oficial / Gupshup).
   - Suporte ao modelo de **Coexistência** (permitindo que o número continue operando simultaneamente no aplicativo físico WhatsApp Business no celular do consultor/empresa).
   - Envio e recebimento de mensagens, disparos de templates pré-aprovados (HSM), webhook de recepção de mensagens/status em tempo real e histórico de conversas acoplado ao Lead no CRM.

2. **Integração de Telefonia VOIP**:
   - Integração com provedor VOIP (ex: Twilio Voice, Ziptime, VovoIP, Asterisk/FreePBX ou WebRTC).
   - Softphone / Dialer integrado diretamente na interface do CRM (webRTC ou acionamento click-to-call).
   - Gravação automática de chamadas com link de áudio salvo na tabela `chamadas`.
   - Pop-up de chamada recebida com identificação do Lead e criação de registro histórico automático.

3. **Automação de Entrada de Leads de Marketing (Webhooks & Formulários)**:
   - Endpoint público e seguro (`POST /api/webhooks/leads`) para recepção instantânea de leads vindo de formulários do site, Elementor, Typeform, Webhooks do n8n/Make/Zapier e Meta Lead Ads.
   - Normalização automática de telefone (formato E.164), desduplicação imediata por telefone/e-mail.
   - Disparo imediato da régua de distribuição automática de leads para o consultor da vez.
   - Notificação em tempo real no frontend (WebSocket / Server-Sent Events / Toast) alertando o consultor sobre o novo lead.

---

### TAREFA DA IA:
Gere uma **Lista Detalhada de TODOs (Checklist Técnico de Implementação)** dividida em Fases lógicas (Fase 1: Preparação e Arquitetura, Fase 2: Backend & APIs, Fase 3: Frontend & UI/UX, Fase 4: Automações e Webhooks, Fase 5: Testes e Homologação).

Para cada item do TODO, inclua:
1. **O que fazer** (Descrição clara da tarefa).
2. **Componentes/Arquivos envolvidos** (quais tabelas do banco, serviços ou telas serão tocados).
3. **Critérios de Aceite / Teste de Sucesso** (como validar que a tarefa foi concluída perfeitamente).
```
