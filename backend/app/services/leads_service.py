import statistics
import re
from datetime import datetime
from app.services.database import query

async def get_leads(status=None, campanha_id=None, search=None, page=1, page_size=50) -> dict:
    """
    Selects leads from the leads table with optional filters, search, and dynamic call classification.
    Returns a paginated dictionary structure.
    """
    conditions = []
    params = []
    
    if campanha_id is not None and campanha_id != "" and campanha_id != "all":
        conditions.append("(campaign_id = ? OR campaign_name = ?)")
        params.append(campanha_id)
        params.append(campanha_id)
        
    if search is not None and search.strip() != "":
        s_term = f"%{search.strip()}%"
        conditions.append("(full_name LIKE ? OR phone LIKE ? OR email LIKE ? OR campaign_name LIKE ? OR city LIKE ?)")
        params.extend([s_term, s_term, s_term, s_term, s_term])
        
    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
        
    # SQL query with join to latest call
    sql = f"""
    SELECT l.*, 
           c.data_hora as call_date, 
           c.duracao_segundos as call_duration, 
           c.resumo_ligacao as call_summary, 
           c.reuniao_agendada, 
           c.tag as call_tag, 
           c.status_ligacao as call_status_orig,
           c.link_gravacao as call_recording,
           c.telefone_normalizado as call_phone
    FROM leads l
    LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY telefone_normalizado ORDER BY data_hora DESC) as rn
        FROM chamadas
    ) c ON c.telefone_normalizado = l.phone AND c.rn = 1
    {where_clause}
    ORDER BY l.created_time DESC
    """
    
    all_rows = await query(sql, tuple(params))
    
    enriched_items = []
    for row in all_rows:
        lead_item = dict(row)
        
        # Calculate dynamic status
        call_phone = row.get("call_phone")
        if call_phone:
            call_dict = {
                "resumo_ligacao": row.get("call_summary"),
                "tag": row.get("call_tag"),
                "duracao_segundos": row.get("call_duration"),
                "reuniao_agendada": row.get("reuniao_agendada")
            }
            classif, subcat, score = classify_call_dynamic(call_dict)
            lead_item["status_chamada"] = classif
            lead_item["subcategoria_motivo"] = subcat
            lead_item["score_qualidade"] = score
        else:
            lead_item["status_chamada"] = "Sem Ligação"
            lead_item["subcategoria_motivo"] = None
            lead_item["score_qualidade"] = None
            
        # Optional filter by status
        if status is not None and status != "" and status != "all":
            if lead_item["status_chamada"] != status:
                continue
                
        enriched_items.append(lead_item)
        
    total = len(enriched_items)
    pages = (total + page_size - 1) // page_size if total > 0 else 0
    
    # Paginate
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_items = enriched_items[start_idx:end_idx]
    
    return {
        "items": paginated_items,
        "total": total,
        "page": page,
        "pages": pages
    }

async def get_lead_by_phone(phone: str) -> dict | None:
    """
    Retrieves a single lead and all associated calls by phone.
    Joins leads and chamadas tables.
    """
    # Fetch lead
    lead_rows = await query("SELECT * FROM leads WHERE phone = ? LIMIT 1", (phone,))
    if not lead_rows:
        return None
    lead = lead_rows[0]
    
    # Fetch associated calls
    calls = await query(
        "SELECT * FROM chamadas WHERE telefone_normalizado = ? ORDER BY data_hora DESC",
        (phone,)
    )
    
    lead_dict = dict(lead)
    lead_dict["chamadas"] = [dict(call) for call in calls]
    return lead_dict

async def get_kpis() -> dict:
    """
    Calculates KPI metrics directly on SQLite.
    Returns total_leads, total_com_chamada, total_agendados, contact rate,
    and conversion rate without contact.
    """
    # total_leads
    res_total = await query("SELECT COUNT(*) as total FROM leads")
    total_leads = res_total[0]["total"] if res_total else 0
    
    # total_com_chamada
    res_chamada = await query(
        "SELECT COUNT(*) as total FROM leads "
        "WHERE phone IN (SELECT DISTINCT telefone_normalizado FROM chamadas)"
    )
    total_com_chamada = res_chamada[0]["total"] if res_chamada else 0
    
    # total_agendados (reuniao_agendada IS NOT NULL and not empty string)
    res_agendados = await query(
        "SELECT COUNT(*) as total FROM leads "
        "WHERE phone IN (SELECT DISTINCT telefone_normalizado FROM chamadas WHERE reuniao_agendada IS NOT NULL AND reuniao_agendada != '')"
    )
    total_agendados = res_agendados[0]["total"] if res_agendados else 0
    
    # taxa_contato (%)
    taxa_contato = (total_com_chamada / total_leads * 100.0) if total_leads > 0 else 0.0
    
    # conv_sem_contato (%)
    # percentage of leads without calls that scheduled a meeting.
    # since meetings only exist within calls in the schema, this is 0.0.
    conv_sem_contato = 0.0
    
    return {
        "total_leads": total_leads,
        "total_com_chamada": total_com_chamada,
        "total_agendados": total_agendados,
        "taxa_contato": round(taxa_contato, 2),
        "conv_sem_contato": round(conv_sem_contato, 2)
    }

def format_duration(seconds):
    if not seconds:
        return "0s"
    m = int(seconds // 60)
    s = int(round(seconds % 60))
    if m > 0:
        return f"{m}m {s}s"
    return f"{s}s"

def parse_date_to_iso(val):
    if not val:
        return None
    val_str = str(val).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}', val_str):
        return val_str[:10]
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', val_str)
    if match:
        d, m, y = match.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    iso_match = re.match(r'^(\d{4})-(\d{2})-(\d{2})', val_str)
    if iso_match:
        return iso_match.group(0)
    return val_str[:10]

def clean_phone_for_whatsapp(phone):
    if not phone:
        return ""
    clean = re.sub(r'\D', '', str(phone))
    if len(clean) in (10, 11) and not clean.startswith('55'):
        clean = '55' + clean
    return clean

def get_region(campaign_name):
    if not campaign_name:
        return "Brasil (Nacional)"
    name_upper = campaign_name.upper()
    if "GO" in name_upper:
        return "Goiás (GO)"
    if "TO" in name_upper:
        return "Tocantins (TO)"
    if "PA" in name_upper:
        return "Pará (PA)"
    return "Brasil (Nacional)"

def classify_call_dynamic(call):
    resumo = (call.get("resumo_ligacao") or "").lower()
    tag = (call.get("tag") or "").lower()
    dur = call.get("duracao_segundos") or 0
    reuniao = call.get("reuniao_agendada")
    
    # 1. Check if meeting scheduled
    if reuniao and str(reuniao).lower() != 'none' and str(reuniao).strip() != '':
        return "Agendou Reunião", "Qualificado / Agendou reunião", 8
        
    # 2. Check if lead is hot/qualified
    if "{lead quente}" in resumo or "lead quente" in tag or "reunião foi agendada" in resumo:
        return "Lead Qualificado", "Qualificado / Agendou reunião", 7
        
    # 3. Check if contact failed (caixa postal / no answer)
    if "caixa postal" in resumo or "não atendido" in resumo or "caixa postal" in tag:
        return "Caixa Postal / Não Atendido", "Caixa Postal / Não Atendido", 2
        
    # 4. Check if call was extremely short
    if dur > 0 and dur < 15:
        return "Caixa Postal / Não Atendido", "Ligação Curta / Sem Diálogo", 2
        
    # 5. Check other categories
    if "ligar depois" in resumo or "retornar mais tarde" in resumo or "ligar mais tarde" in resumo:
        return "Sem Contato Efetivo", "Pediu para Ligar Depois", 4
        
    if "avaliando internamente" in resumo or "avaliar com o sócio" in resumo:
        return "Sem Contato Efetivo", "Avaliando Internamente", 5
        
    if "desqualificado" in resumo or "{lead desqualificado}" in resumo or "fora do perfil" in resumo:
        return "Lead Desqualificado", "Fora do Perfil de Cliente Ideal", 1
        
    if "não tem interesse" in resumo or "sem interesse" in resumo or "recusa" in resumo:
        return "Sem Interesse", "Recusa Direta / Sem Interesse", 3
        
    if "hostil" in resumo or "irritado" in resumo:
        return "Sem Interesse", "Lead Hostil / Irritado", 1
        
    # Default fallbacks
    if dur >= 30:
        return "Lead Qualificado", "Qualificado / Agendou reunião", 6
    elif dur > 0:
        return "Sem Contato Efetivo", "Avaliando Internamente", 4
        
    return "Caixa Postal / Não Atendido", "Caixa Postal / Não Atendido", 2

async def get_dashboard_data() -> dict:
    # 1. Query all leads and all calls from SQLite database
    leads = await query("SELECT * FROM leads")
    calls = await query("SELECT * FROM chamadas")
    
    # Calculate stats
    total_leads = len(leads)
    
    # Group calls by phone normalized
    calls_by_phone = {}
    for call in calls:
        phone = call.get("telefone_normalizado")
        if phone:
            if phone not in calls_by_phone:
                calls_by_phone[phone] = []
            calls_by_phone[phone].append(call)
            
    # Process leads
    platform_details = {}
    region_counts = {}
    campaigns_details = {}
    leads_by_day = {}
    durations = []
    score_counts = {str(i): 0 for i in range(1, 9)}
    unique_campaigns = set()
    
    funnel_counts = {
        "total": 0,
        "semLigacao": 0,
        "caixaPostal": 0,
        "ligacaoCurta": 0,
        "semContatoEfetivo": 0,
        "pediuLigarDepois": 0,
        "avaliandoInternamente": 0,
        "aguardandoRetorno": 0,
        "semInteresseDesq": 0,
        "qualificadoSemAgenda": 0,
        "agendouReuniao": 0
    }
    
    motivo_counts = {
        "semLigacao": 0,
        "caixaPostal": 0,
        "ligacaoCurta": 0,
        "pediuLigarDepois": 0,
        "avaliandoInternamente": 0,
        "recusaDireta": 0,
        "foraPerfil": 0,
        "leadHostil": 0,
        "qualificadoAgendou": 0
    }
    
    houve_retorno_pos = 0
    leads_raw = []
    
    for lead in leads:
        camp = lead.get("campaign_name")
        plat = lead.get("platform")
        if plat == "ig":
            plat = "Instagram"
        elif plat == "fb":
            plat = "Facebook"
            
        reg = get_region(camp)
        cria = lead.get("created_time")
        phone = lead.get("phone")
        
        # Get latest call info
        lead_calls = calls_by_phone.get(phone, []) if phone else []
        classif = "Sem Ligação"
        subcat = None
        score = None
        dur = None
        resumo = None
        link_gravacao = None
        retorno = "Negativo"
        
        if lead_calls:
            lead_calls.sort(key=lambda x: x.get("data_hora") or "", reverse=True)
            latest_call = lead_calls[0]
            classif, subcat, score = classify_call_dynamic(latest_call)
            dur = latest_call.get("duracao_segundos")
            resumo = latest_call.get("resumo_ligacao")
            link_gravacao = latest_call.get("link_gravacao")
            retorno = "Positivo" if classif not in ("Sem Ligação", "Caixa Postal / Não Atendido") else "Negativo"
            
        # Campanha
        if camp:
            unique_campaigns.add(camp)
            if camp not in campaigns_details:
                campaigns_details[camp] = {"total": 0, "semLigacao": 0, "agendouReuniao": 0}
            campaigns_details[camp]["total"] += 1
            
        # Plataforma
        if plat:
            if plat not in platform_details:
                platform_details[plat] = {"total": 0, "semLigacao": 0, "agendouReuniao": 0}
            platform_details[plat]["total"] += 1
            
        # Regiao
        if reg:
            if reg not in region_counts:
                region_counts[reg] = {"total": 0, "semLigacao": 0, "agendouReuniao": 0}
            region_counts[reg]["total"] += 1
            
        # Data de Criacao
        day_str = parse_date_to_iso(cria)
        if day_str:
            leads_by_day[day_str] = leads_by_day.get(day_str, 0) + 1
            
        # Houve retorno
        if retorno == 'Positivo':
            houve_retorno_pos += 1
            
        # Duracao
        if dur is not None:
            durations.append(dur)
            
        # Score
        if score is not None:
            try:
                s_str = str(int(float(score)))
                if s_str in score_counts:
                    score_counts[s_str] += 1
            except ValueError:
                pass
                
        is_sem_ligacao = (classif == "Sem Ligação")
        
        if reg:
            if is_sem_ligacao:
                region_counts[reg]["semLigacao"] += 1
            if classif == "Agendou Reunião":
                region_counts[reg]["agendouReuniao"] += 1
                
        if plat:
            if is_sem_ligacao:
                platform_details[plat]["semLigacao"] += 1
            if classif == "Agendou Reunião":
                platform_details[plat]["agendouReuniao"] += 1
                
        if camp:
            if is_sem_ligacao:
                campaigns_details[camp]["semLigacao"] += 1
            if classif == "Agendou Reunião":
                campaigns_details[camp]["agendouReuniao"] += 1
                
        # Funnel
        funnel_counts["total"] += 1
        if is_sem_ligacao:
            funnel_counts["semLigacao"] += 1
        else:
            if classif == "Caixa Postal / Não Atendido":
                funnel_counts["caixaPostal"] += 1
            if subcat == "Ligação Curta / Sem Diálogo":
                funnel_counts["ligacaoCurta"] += 1
            if classif == "Sem Contato Efetivo":
                funnel_counts["semContatoEfetivo"] += 1
            if subcat == "Pediu para Ligar Depois":
                funnel_counts["pediuLigarDepois"] += 1
            if subcat == "Avaliando Internamente":
                funnel_counts["avaliandoInternamente"] += 1
            if subcat == "Aguardando Retorno do Lead":
                funnel_counts["aguardandoRetorno"] += 1
                
            is_sem_interesse_desq = (
                classif in ("Sem Interesse", "Lead Desqualificado") or
                subcat in ("Recusa Direta / Sem Interesse", "Fora do Perfil de Cliente Ideal")
            )
            if is_sem_interesse_desq:
                funnel_counts["semInteresseDesq"] += 1
                
            if classif == "Lead Qualificado":
                funnel_counts["qualificadoSemAgenda"] += 1
            if classif == "Agendou Reunião":
                funnel_counts["agendouReuniao"] += 1
                
        # Motivos
        if is_sem_ligacao:
            motivo_counts["semLigacao"] += 1
        else:
            if classif == "Caixa Postal / Não Atendido":
                motivo_counts["caixaPostal"] += 1
            if subcat == "Ligação Curta / Sem Diálogo":
                motivo_counts["ligacaoCurta"] += 1
            if subcat == "Pediu para Ligar Depois":
                motivo_counts["pediuLigarDepois"] += 1
            if subcat == "Avaliando Internamente":
                motivo_counts["avaliandoInternamente"] += 1
            if subcat == "Recusa Direta / Sem Interesse":
                motivo_counts["recusaDireta"] += 1
            if subcat == "Fora do Perfil de Cliente Ideal":
                motivo_counts["foraPerfil"] += 1
            if subcat == "Lead Hostil / Irritado":
                motivo_counts["leadHostil"] += 1
            if classif in ("Lead Qualificado", "Agendou Reunião"):
                motivo_counts["qualificadoAgendou"] += 1
                
        leads_raw.append({
            "Campanha": camp,
            "Plataforma": plat,
            "Região": reg,
            "Data de Criação": day_str,
            "houve retornow": retorno,
            "Chamada - Classificação": classif,
            "Chamada - Subcategoria do Motivo": subcat,
            "Chamada - Duração (segundos)": dur,
            "Chamada - Qualidade (Score)": score,
            "phone": phone
        })
        
    # Process chamadas
    calls_by_day = {}
    hot_calls = []
    status_counts = {}
    calls_raw = []
    
    for call in calls:
        date_val = call.get("data_hora")
        iso_date = parse_date_to_iso(date_val)
        if iso_date:
            calls_by_day[iso_date] = calls_by_day.get(iso_date, 0) + 1
            
        status = call.get("status_ligacao")
        if status:
            status_counts[status] = status_counts.get(status, 0) + 1
            
        classification, subcat, score = classify_call_dynamic(call)
        
        is_hot = False
        try:
            if score is not None and float(score) >= 5:
                is_hot = True
        except ValueError:
            pass
            
        if classification in ("Agendou Reunião", "Lead Qualificado", "Retorno Agendado"):
            is_hot = True
            
        phone = call.get("telefone_normalizado") or call.get("telefone") or ""
        clean_phone = clean_phone_for_whatsapp(phone)
        wa_link = f"https://wa.me/{clean_phone}" if clean_phone else ""
        
        call_dict = {
            "nome": call.get("nome_contato") or "Sem Nome",
            "telefone": phone,
            "whatsapp_link": wa_link,
            "data_hora": call.get("data_hora") or "",
            "iso_date": iso_date,
            "duracao": call.get("duracao_segundos"),
            "classificacao": classification,
            "score": score,
            "resumo": call.get("resumo_ligacao") or "Sem resumo disponível.",
            "link_gravacao": call.get("link_gravacao") or ""
        }
        
        if is_hot:
            hot_calls.append(call_dict)
            
        calls_raw.append({
            "Nome do Contato": call.get("nome_contato") or "Sem Nome",
            "Número de Telefone": call.get("telefone") or "",
            "Tel Meta": call.get("telefone_normalizado") or "",
            "whatsapp_link": wa_link,
            "Data e Hora": call.get("data_hora") or "",
            "iso_date": iso_date,
            "Duração (segundos)": call.get("duracao_segundos"),
            "Classificação da Chamada": classification,
            "Qualidade do Lead (Score)": score,
            "Resumo da Conversa (IA)": call.get("resumo_ligacao") or "Sem resumo disponível.",
            "Link da Gravação": call.get("link_gravacao") or "",
            "Status Original da Ligação": status,
            "tag": call.get("tag") or ""
        })
        
    def sort_key(c):
        score_val = 0
        try:
            if c["score"] is not None:
                score_val = float(c["score"])
        except ValueError:
            pass
        return (score_val, c["data_hora"])
        
    hot_calls.sort(key=sort_key, reverse=True)
    
    dur_media = format_duration(statistics.mean(durations)) if durations else "0s"
    dur_mediana = format_duration(statistics.median(durations)) if durations else "0s"
    
    return {
        "totalLeads": total_leads,
        "contatos": houve_retorno_pos,
        "agendados": funnel_counts["agendouReuniao"],
        "campaigns": sorted(list(unique_campaigns)),
        "leadsPorPlataforma": platform_details,
        "leadsPorRegiao": region_counts,
        "leadsPorCampanha": campaigns_details,
        "funnel": funnel_counts,
        "motivos": motivo_counts,
        "duracao": {
            "media": dur_media,
            "mediana": dur_mediana
        },
        "scores": score_counts,
        "leadsPorDia": {k: leads_by_day[k] for k in sorted(leads_by_day.keys())},
        "ligacoesPorDia": {k: calls_by_day[k] for k in sorted(calls_by_day.keys())},
        "ligacoesQuentes": hot_calls,
        "statusLigacoes": status_counts,
        "allLeads": leads_raw,
        "allCalls": calls_raw
    }

