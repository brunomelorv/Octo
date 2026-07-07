import re
import json
import logging
import httpx
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from app.routers.auth import get_current_user
from app.models.user import UserResponse
from app.services.settings_service import get_settings, update_settings
import app.services.leads_service as leads_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/kpis")
async def get_kpis(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns general analytical KPIs for leads.
    """
    try:
        return await leads_service.get_kpis(user=current_user.model_dump())
    except Exception as e:
        logger.exception("Erro ao obter KPIs")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/")
async def list_leads(
    status: str | None = Query(None),
    campanha_id: str | None = Query(None),
    search: str | None = Query(None),
    consultant: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Lists leads with optional pagination, filters, and search query.
    """
    try:
        return await leads_service.get_leads(
            status=status,
            campanha_id=campanha_id,
            search=search,
            consultant=consultant,
            page=page,
            page_size=page_size,
            user=current_user.model_dump()
        )
    except Exception as e:
        logger.exception("Erro ao listar leads")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/dashboard-data")
async def get_dashboard_data(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns the complete aggregated analytical dashboard data from the database.
    """
    try:
        return await leads_service.get_dashboard_data(user=current_user.model_dump())
    except Exception as e:
        logger.exception("Erro ao obter dados do dashboard")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")


@router.get("/consultants-performance")
async def get_consultants_performance(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns performance metrics per consultant.
    """
    try:
        return await leads_service.get_consultants_performance()
    except Exception as e:
        logger.exception("Erro ao obter performance dos consultores")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

class CampaignInsightRequest(BaseModel):
    totalLeads: int
    contatos: int
    agendados: int
    leadsPorCampanha: dict
    leadsPorPlataforma: dict
    motivos: dict

async def require_head_or_master(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current_user.role not in ("master", "head"):
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Apenas Master e Head podem executar esta ação.",
        )
    return current_user

@router.get("/campaign-insights")
async def get_saved_campaign_insights(current_user: UserResponse = Depends(get_current_user)):
    data = await get_settings("campaign_insights")
    return {
        "insights": data.get("insights"),
        "generated_at": data.get("generated_at")
    }

@router.post("/campaign-insights")
async def generate_campaign_insights(
    data: CampaignInsightRequest,
    current_user: UserResponse = Depends(require_head_or_master)
):
    # Fetch API Key
    key_settings = await get_settings("openai_api_key")
    api_key = key_settings.get("api_key", "").strip()
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="A chave de API da OpenAI não está configurada. Por favor, adicione-a em Configurações."
        )
        
    # Construct prompt
    prompt = f"""
Você é um especialista em Marketing Digital e Vendas (SDR/CRM). Analise os dados de performance de leads abaixo e forneça um diagnóstico estratégico completo de acordo com as instruções de formato.

Métricas Gerais:
- Total de Leads: {data.totalLeads}
- Leads Contatados (Diálogo efetivo): {data.contatos} (Taxa de contato: {round(data.contatos/data.totalLeads*100, 1) if data.totalLeads > 0 else 0}%)
- Reuniões Agendadas: {data.agendados} (Taxa de agendamento sobre contatos: {round(data.agendados/data.contatos*100, 1) if data.contatos > 0 else 0}%)

Desempenho por Campanha:
{json.dumps(data.leadsPorCampanha, indent=2, ensure_ascii=False)}

Desempenho por Plataforma:
{json.dumps(data.leadsPorPlataforma, indent=2, ensure_ascii=False)}

Motivos de Perda/Não-Atendimento (PitchYES):
{json.dumps(data.motivos, indent=2, ensure_ascii=False)}

Você DEVE estruturar sua resposta EXCLUSIVAMENTE em HTML puro (sem blocos de código com ```html ou qualquer outro delimitador, sem tags <html>, <head> ou <body>, apenas o fragmento contendo as tags div, span, etc) seguindo EXATAMENTE a estrutura de classes abaixo.

Estrutura de Seções Obrigatória:

1. Primeira Seção:
<div class="section">
  <div class="section-label">Insights estratégicos</div>
  <div class="three-col">
    <!-- Gere de 3 a 6 cards de insights. Use as classes 'red' para crítico, 'amber' para alto, 'green' para positivo/oportunidades, 'blue' ou 'purple' para médio -->
    <div class="insight-card red">
      <div class="insight-badge">Insight 01 · Crítico</div>
      <div class="insight-title">[Título Curto do Insight]</div>
      <div class="insight-body">[Descrição detalhada com porcentagens e números baseados nos dados de tráfego/chamadas reais fornecidos]</div>
    </div>
    <!-- adicione mais cards... -->
  </div>
</div>

2. Segunda Seção:
<div class="section">
  <div class="section-label">Diagnóstico das campanhas de tráfego</div>
  <div class="card">
    <div class="card-header">
      <div class="card-header-title">PROBLEMAS IDENTIFICADOS · PRIORIDADE · AÇÃO RECOMENDADA</div>
    </div>
    <!-- Gere itens de diagnóstico com classe diag-item contendo crit, alto, medio ou pos. A ordem dos itens deve ser numerada (1, 2, 3...) ou com ✓ para o item positivo. -->
    <div class="diag-item crit">
      <div class="diag-num">1</div>
      <div>
        <div class="diag-title">[Título do Diagnóstico]</div>
        <div class="diag-body">[Análise detalhada do problema observado nos dados fornecidos]</div>
      </div>
      <div class="diag-prio"><span class="tag tag-red">Crítico</span></div>
      <div class="diag-action">
        <strong>Ação Recomendada</strong>
        [Direcionamento prático e direto para o time de tráfego ou processo de SDR]
      </div>
    </div>
    <!-- adicione mais itens... -->
  </div>
</div>

3. Terceira Seção:
<div class="section">
  <div class="section-label">Plano de ação — campanhas de tráfego pago</div>
  <div class="card">
    <div class="card-header">
      <div class="card-header-title">[Quantidade] RECOMENDAÇÕES PRIORIZADAS</div>
    </div>
    <!-- Gere itens com a classe rec-item. A numeração (1, 2, 3...) deve ir no rec-dot. -->
    <div class="rec-item">
      <div class="rec-dot tag-red font-mono">1</div>
      <div class="rec-content">
        <div class="rec-title">[Título da Recomendação]</div>
        <div class="rec-body">[Explicação da ação a ser tomada com base nos insights e diagnósticos]</div>
        <div class="rec-meta">
          <span class="rec-chip">Área: [Mídia / Criativo / Processo]</span>
          <span class="rec-chip">Prazo: [Imediato / Curto prazo / Médio prazo]</span>
          <span class="rec-chip tag-red">[Impacto Estimado, ex: ↑ Taxa de contato +15–20%]</span>
        </div>
      </div>
    </div>
    <!-- adicione mais itens... -->
  </div>
</div>

Gere insights reais baseados estritamente nas métricas fornecidas acima. Seja extremamente focado em dados de conversão, custos ocultos e gargalos de atendimento do SDR de voz.
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Você é um analista de marketing e SDR. Você gera relatórios de insights estritamente formatados em HTML fragmentado, conforme solicitado pelo usuário, sem blocos de código com crases (```)."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                json=payload,
                headers=headers,
                timeout=60.0
            )
            
            if response.status_code != 200:
                error_detail = response.json().get("error", {}).get("message", "Erro desconhecido ao chamar OpenAI.")
                raise HTTPException(
                    status_code=500,
                    detail=f"Erro da API OpenAI: {error_detail}"
                )
                
            result = response.json()
            insights_text = result["choices"][0]["message"]["content"]
            generated_at = datetime.now().strftime("%d/%m/%Y às %H:%M:%S")
            
            await update_settings("campaign_insights", {
                "insights": insights_text,
                "generated_at": generated_at
            })
            
            return {"insights": insights_text, "generated_at": generated_at}
            
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro de comunicação com a OpenAI: {str(exc)}"
        )

@router.get("/{phone}")
async def get_lead_by_phone(
    phone: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieves detailed info of a lead and its calls history using phone number.
    """
    if not re.match(r'^\+?\d{8,15}$', phone):
        raise HTTPException(
            status_code=400,
            detail="Formato de telefone inválido"
        )
    try:
        lead = await leads_service.get_lead_by_phone(phone)
        if not lead:
            raise HTTPException(
                status_code=404,
                detail="Lead não encontrado"
            )
        return lead
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao obter lead")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")


