from app.services.database import query

async def get_campanhas() -> list[dict]:
    """
    Retrieves a list of campaigns with the count of total leads and total calls.
    Performs a LEFT JOIN between leads and chamadas tables.
    """
    sql = """
    SELECT 
        l.campaign_id, 
        l.campaign_name, 
        l.platform,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT c.id) as total_chamadas
    FROM leads l 
    LEFT JOIN chamadas c ON c.telefone_normalizado = l.phone
    GROUP BY l.campaign_id
    """
    return await query(sql)
