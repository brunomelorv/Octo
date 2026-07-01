# Relatório de Diagnóstico e Oportunidades de Melhoria — CRM Lead Analytics

Este relatório consolida uma análise técnica e funcional aprofundada da plataforma **Lead Analytics** (Backend FastAPI + Frontend React/TypeScript/Tailwind), mapeando os problemas de funcionalidade críticos, inconsistências de integração e oportunidades de aprimoramento com base nas melhores práticas de mercado para CRMs.

---

## 1. Problemas de Funcionalidade Críticos (Bugs de Integração)

### A. Erro nos Módulos de Personalização e Configuração de Acesso (404 / 500)
* **O Problema:** Ao acessar as páginas **Personalização** (`PersonalizacaoPage.tsx`) e **Configurações de Acesso** (`ConfiguracoesPage.tsx`), o sistema falha ao carregar e salvar as informações, exibindo erros na interface.
* **Causa Raiz:** Há uma divergência nas rotas de API (endpoints) mapeadas entre o frontend e o backend:
  * No **Backend** (`backend/app/main.py`), as rotas de configurações estão registradas sob o prefixo `/api/settings`:
    ```python
    app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
    ```
  * No **Frontend**, as chamadas do Axios estão apontando para o prefixo incorreto `/config`:
    * Em `ConfiguracoesPage.tsx`:
      ```typescript
      api.get('/config/permissions')
      api.put('/config/permissions', permissions)
      ```
    * Em `PersonalizacaoPage.tsx`:
      ```typescript
      api.get('/config/personalizacao')
      api.put('/config/personalizacao', ...)
      ```
* **Solução Recomendada:** Corrigir as URLs no frontend para apontarem para `/settings/permissions` e `/settings/personalizacao`, reestabelecendo a comunicação direta com o backend.

---

## 2. Aprimoramento das Métricas de Marketing (Dashboard & Campanhas)

### A. Contabilidade Dinâmica de Reuniões e Retornos
* **O Problema:** A aba de **Desempenho de Campanhas** (`CampanhasPage.tsx`) e as APIs correspondentes apenas contabilizam a quantidade bruta de `leads` e `chamadas` por campanha. Não há inteligência para identificar o desfecho operacional de cada lead (se ele converteu em uma reunião ou solicitou um retorno), o que impossibilita o cálculo do ROI real de cada campanha de marketing.
* **A Regra de Negócio (PitchYES):** O processamento de ligações da PitchYES insere no final da coluna **"Resumo da Ligação"** (`resumo_ligacao` no banco de dados) marcadores padronizados gerados por IA:
  1. **Reunião Agendada:** Contém a assinatura `"Reunião agendada para: DD/MM/YY HH:MM AM/PM"` ou similar.
  2. **Retorno Agendado:** Contém a assinatura `"Retorno agendado para: DD/MM/YY HH:MM AM/PM"` ou similar.
  3. **Desqualificação:** Contém a tag `"{lead desqualificado}"`.
* **Solução Recomendada:**
  1. **Query SQL Otimizada:** Ajustar a função `get_campanhas` no backend (`campanhas_service.py`) para realizar uma agregação baseada nesses critérios de texto, calculando dinamicamente a taxa de conversão final por campanha:
     ```sql
     SELECT 
         l.campaign_id, 
         l.campaign_name, 
         l.platform,
         COUNT(DISTINCT l.id) as total_leads,
         COUNT(DISTINCT c.id) as total_chamadas,
         COUNT(DISTINCT CASE WHEN LOWER(c.resumo_ligacao) LIKE '%reunião agendada para%' THEN l.id END) as total_reunioes,
         COUNT(DISTINCT CASE WHEN LOWER(c.resumo_ligacao) LIKE '%retorno agendado para%' THEN l.id END) as total_retornos
     FROM leads l 
     LEFT JOIN chamadas c ON c.telefone_normalizado = l.phone
     GROUP BY l.campaign_id
     ```
  2. **Ajuste na Interface (Frontend):** Atualizar o TypeScript (`CampanhasResponse`) e adicionar colunas visuais no painel de campanhas para exibir de forma clara e visual a quantidade de **Reuniões** e **Retornos** por campanha, além de atualizar os cards de KPI no topo da tela para englobar esses totais consolidados.

---

## 3. Oportunidades de Melhoria de Processo e Banco de Dados (Melhores Práticas de CRM)

### A. Sincronização entre Uploads e Banco de Dados (Fim do "Drop & Rebuild")
* **O Gargalo:** O script `build_database.py` executa um comando de `DROP TABLE` na tabela de `leads` e `chamadas` toda vez que novas planilhas são enviadas pelo administrador. Isso apaga instantaneamente todas as interações manuais, comentários, distribuições e atribuições feitas pelos vendedores no Kanban e na Agenda.
* **Melhor Prática:** Substituir a estratégia por um fluxo de **Upsert (Update or Insert)**. A tabela mantém os registros passados, atualizando apenas as informações que sofreram alteração (identificadas de forma única por ID do lead e combinação de Telefone/Data na chamada).

### B. Ativação da Distribuição Round-Robin no Backend
* **O Gargalo:** Embora o painel do administrador permita ligar a "Distribuição Automática" e selecionar quais consultores participam do rodízio, essa configuração é ignorada pelo backend na importação. Os leads entram no sistema sem dono ("Sem Consultor"), gerando disputa desorganizada ("pescaria de leads").
* **Melhor Prática:** No momento de finalização do processamento do banco, rodar um trigger de distribuição que lê a tabela `settings` (chave `distribuicao`) e distribui os novos leads de forma rotativa e equilibrada entre os consultores ativos.

### C. Estruturação da Agenda do Consultor ( NLP vs. Campos Estruturados )
* **O Gargalo:** Atualmente, a agenda de tarefas do consultor é montada varrendo o texto dos resumos de chamadas em busca de datas no formato `DD/MM/YY`. Qualquer desvio ou alteração de escrita por parte da IA faz o compromisso sumir silenciosamente da tela do vendedor.
* **Melhor Prática:** Criar campos específicos na tabela de banco de dados (`data_retorno_agendado` e `tipo_retorno`). Quando o script extrair dados das chamadas, ele salva a data em um formato padrão `YYYY-MM-DD` diretamente nessas colunas, blindando a agenda do time de vendas de falhas de digitação ou formatação de texto.

### D. Captura do Motivo de Perda no Kanban (Loss Reason Analysis)
* **O Gargalo:** O funil de vendas (Kanban) permite arrastar o card diretamente para a coluna "Perdido", mas não solicita nenhuma justificativa.
* **Melhor Prática:** Ao arrastar o lead para "Perdido", exibir um modal pop-up perguntando a razão da desqualificação/perda (ex: "Sem Orçamento", "Não atende", "Sem interesse", "Preço Alto"). Isso gera dados estatísticos cruciais para a diretoria entender gargalos do time comercial.

---

## 4. Plano de Ação Recomendado para Correção

Podemos iniciar a correção imediata dessas frentes na seguinte ordem de prioridade operacional:

1. **Correção das URLs de Configuração e Personalização** no frontend para restaurar o acesso às telas administrativas.
2. **Atualização da Query de Campanhas no Backend** e exibição das novas métricas de **Reuniões** e **Retornos** no frontend.
3. **Refatoração do script de banco de dados** para adotar lógica de **Upsert** (preservando o histórico comercial).
4. **Implementação do Modal de Motivo de Perda** no Kanban comercial.
