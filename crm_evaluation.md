# Avaliação de Caso de Uso e Funcional — CRM Lead Analytics

Esta é uma avaliação aprofundada das capacidades atuais, pontos fortes e oportunidades de melhoria para a plataforma **Lead Analytics**, analisando a arquitetura de banco de dados, o fluxo de negócios (Kanban), a gestão da Agenda e o módulo de distribuição de leads.

---

## 1. Visão Geral dos Casos de Uso Atuais

O CRM foi projetado com foco em três pilares analíticos e operacionais:
1. **Marketing Geral (Dashboard & Campanhas):** Análise de origens, taxas de contato e desempenho de campanhas de anúncios (Meta/Facebook Ads).
2. **PitchYES (Leads & Negócios - Kanban):** Pipeline de vendas no formato Kanban para acompanhamento de leads, atribuição de proprietário (Consultor) e valores de contrato.
3. **Análise de Ligações (Chamadas & Agenda):** Acompanhamento de ligações feitas ( PitchYES), geração de resumos de IA, acompanhamento e reagendamento de retornos e reuniões.

---

## 2. Pontos Fortes do Sistema

* **Classificação Dinâmica por IA/NLP:** O sistema analisa de forma automática os resumos de ligações gerados por IA e atribui tags como `{lead quente}` ou `{lead desqualificado}`. Com base nisso, ele calcula dinamicamente o status do lead ("Lead Qualificado", "Caixa Postal", etc.) e a etapa inicial sugerida no funil de vendas. Isso reduz drasticamente o trabalho de preenchimento manual dos consultores.
* **Isolamento de Carteira por Perfil:** O sistema possui regras de visibilidade no backend onde consultores só enxergam leads atribuídos a si ou leads ainda sem dono ("first-come, first-served"). Perfis administrativos ou gerenciais ("head", "master") possuem visão completa.
* **Histórico de Auditoria estruturado:** Toda alteração de etapa no Kanban gera um registro na tabela `negocios_historico` com o usuário que fez o movimento, valor e timestamps, mantendo o controle total da operação.
* **Eventos Manuais unificados na Linha do Tempo:** Movimentações de fechamento (Ganho/Perdido) criam um registro fake/manual na tabela `chamadas` (com a tag `CRM_MANUAL`), permitindo que a linha do tempo de ligações reflita a resolução final do CRM.

---

## 3. Oportunidades de Melhoria (Gargalos & Soluções)

Após analisar o código do backend (`FastAPI`) e do frontend (`React + Vite + TypeScript`), identificamos os seguintes pontos críticos que podem ser melhorados:

### A. Ativação da Distribuição Automática de Leads (Gargalo Crítico)
* **Situação Atual:** A tela "Distribuição de Leads" permite ligar a distribuição automática (Round-Robin) e selecionar os consultores participantes. Porém, **essa configuração é ignorada no backend**. Durante a carga de dados (`build_database.py`), a tabela de leads é limpa e reconstruída, mas os leads nunca são distribuídos ou vinculados na tabela `negocios`. Os leads entram como "Sem Dono", gerando uma disputa desorganizada ("pescaria de leads").
* **Proposta de Melhoria:** Criar uma rotina no backend (ou acoplada ao processo de importação/criação) que leia as configurações da tabela `settings` (chave `distribuicao`) e distribua os novos leads de forma rotativa entre os IDs de consultores ativos, registrando as atribuições imediatamente na tabela `negocios`.

### B. Fragilidade na Agenda por Varredura de Texto (NLP)
* **Situação Atual:** O serviço `agenda_service.py` varre o resumo de texto das chamadas (`resumo_ligacao LIKE '%DD/MM/YY%'`) para montar o calendário de compromissos. Se o LLM que transcreve a chamada mudar o formato da data ou errar a digitação, o compromisso desaparece da agenda do consultor.
* **Proposta de Melhoria:** Criar colunas estruturadas de compromisso no banco de dados (ex: `data_retorno_agendado` e `tipo_retorno`). Quando o script extrair dados das chamadas, ele salva a data em um formato padrão `YYYY-MM-DD` diretamente nessas colunas, tornando a consulta da agenda 100% segura e livre de falhas de regex/texto.

### C. Captura do Motivo de Perda no Kanban (Loss Analysis)
* **Situação Atual:** O backend está preparado para salvar o motivo e comentário da perda (`loss_reason` e `loss_comment` no método `save_negocio`), mas o frontend (`NegociosPage.tsx`) atualiza a etapa para "Perdido" instantaneamente ao arrastar o card, sem dar chance para o consultor preencher o porquê da perda.
* **Proposta de Melhoria:** Ao arrastar um card para a coluna "Perdido" no Kanban, exibir um modal pop-up simples solicitando o motivo (ex: "Preço Alto", "Sem Orçamento", "Concorrente", "Não atende") e uma caixa de texto para observações. Isso enriquecerá o banco de dados e permitirá a criação de gráficos de "Perdas por Motivo" no Dashboard para tomada de decisão.

### D. Substituição do "Drop & Rebuild" por Importações Incrementais (Upsert)
* **Situação Atual:** O script `build_database.py` executa `DROP TABLE IF EXISTS leads` e `chamadas` toda vez que um novo upload é processado. Isso significa que anotações manuais dos consultores, novos compromissos adicionados localmente ou históricos de chamadas manuais podem ser completamente apagados caso o arquivo enviado não os contenha mais.
* **Proposta de Melhoria:** Substituir a exclusão total por uma estratégia de **Upsert** (atualizar se já existe pelo número de telefone/ID, ou inserir se for novo). Isso preserva a integridade dos dados históricos inseridos manualmente pelo time de vendas.

### E. Sincronização Automática da Agenda com o Kanban
* **Situação Atual:** Marcar uma tarefa como "Concluída" na agenda (`agenda_completions`) é um evento isolado. Ele não altera a etapa do lead no Kanban.
* **Proposta de Melhoria:** Integrar a conclusão da agenda com o pipeline. Por exemplo, ao concluir uma "Reunião" agendada, o sistema pode perguntar ao usuário: *"A reunião aconteceu com sucesso?"* e mover automaticamente o lead para "KYC/COF/Contrato" ou "Ganho/Perdido", otimizando os cliques do vendedor.

### F. Atalhos de Templates para Comunicação Rápida (WhatsApp)
* **Situação Atual:** O sistema exibe um link para abrir o WhatsApp Web com o número do lead, mas a mensagem é enviada em branco.
* **Proposta de Melhoria:** Adicionar templates rápidos configuráveis na tela de detalhes do lead. Exemplo: clicando no botão *"Enviar Mensagem de Reagendamento"*, o sistema abre o link do WhatsApp já preenchido com a mensagem: *"Olá, [Nome do Lead], tudo bem? Tentei te ligar hoje para conversarmos sobre nossa solução, mas não consegui contato. Qual o melhor horário para nos falarmos?"*.

---

## 4. Próximos Passos Sugeridos

Podemos trabalhar na implementação de qualquer uma dessas melhorias. As mais recomendadas para início imediato por trazerem valor imediato à operação são:
1. **Modal de Motivo de Perda** no Kanban.
2. **Distribuição Automática de Leads (Round-Robin)** rodando no backend após o upload.
3. **Persistência de Dados (Upsert)** no build de banco de dados para evitar perda de dados manuais.
