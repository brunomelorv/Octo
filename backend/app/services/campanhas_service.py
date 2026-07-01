from app.services.database import query

async def get_campanhas() -> list[dict]:
    """
    Retrieves a list of campaigns with summary metrics including total leads, total calls,
    meetings scheduled, and callbacks requested.
    """
    sql = """
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
    """
    return await query(sql)
