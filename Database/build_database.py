import os
import glob
import sqlite3
import re
import pandas as pd

def normalize_phone(phone_val):
    if pd.isna(phone_val):
        return None
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', str(phone_val))
    if not digits:
        return None
    # If it starts with 55 and has 12 or 13 digits, keep it and prepend +
    if digits.startswith('55') and len(digits) in [12, 13]:
        return '+' + digits
    # If it doesn't start with 55 but has 10 or 11 digits, prepend +55
    if len(digits) in [10, 11]:
        return '+55' + digits
    # Otherwise, return it with a plus sign if it's long enough
    return '+' + digits

def map_column(col):
    col_lower = col.lower()
    if 'nome' in col_lower:
        return 'nome_contato'
    if 'telefone' in col_lower:
        return 'telefone'
    if 'data' in col_lower:
        return 'data_hora'
    if 'dura' in col_lower:
        return 'duracao_segundos'
    if 'resumo' in col_lower:
        return 'resumo_ligacao'
    if 'status' in col_lower:
        return 'status_ligacao'
    if 'grava' in col_lower:
        return 'link_gravacao'
    if 'reuni' in col_lower and 'link' not in col_lower:
        return 'reuniao_agendada'
    if 'reuni' in col_lower and 'link' in col_lower:
        return 'link_reuniao'
    if 'anota' in col_lower:
        return 'anotacoes'
    if 'tag' in col_lower:
        return 'tag'
    
    # Fallback using regex
    import re
    return re.sub(r'[^a-z0-9_]', '_', col_lower).strip('_')

def consolidate_leads(db_conn):
    source_folder = r"C:\Users\BrunoPereiradeMeloAr\Desktop\Marketing e Pitch\Marketing\leads_facebook"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_out_path = os.path.join(script_dir, "leads_consolidated.csv")
    
    print("\n--- Processing Facebook Leads ---")
    
    csv_files = glob.glob(os.path.join(source_folder, "*.csv"))
    if not csv_files:
        print(f"Warning: No CSV files found in {source_folder}")
        return False
        
    print(f"Found {len(csv_files)} CSV files to process.")
    
    all_dfs = []
    for f in csv_files:
        filename = os.path.basename(f)
        try:
            # Facebook leads files are UTF-16 encoded with tab delimiter
            df = pd.read_csv(f, encoding='utf-16', sep='\t')
            df['source_file'] = filename
            all_dfs.append(df)
        except Exception as e:
            print(f"Error reading file {filename}: {e}")
            
    if not all_dfs:
        print("Error: No lead data could be read.")
        return False
        
    combined_df = pd.concat(all_dfs, ignore_index=True)
    total_raw_rows = len(combined_df)
    
    # Deduplicate by 'id' (keep latest lead based on created_time)
    combined_df = combined_df.sort_values(by='created_time', ascending=True)
    dedup_df = combined_df.drop_duplicates(subset=['id'], keep='last').copy()
    
    print(f"Leads: read {total_raw_rows} rows, deduplicated to {len(dedup_df)} unique leads.")
    
    # Clean up phone number (remove p: prefix if present)
    if 'phone' in dedup_df.columns:
        dedup_df['phone'] = dedup_df['phone'].apply(lambda x: str(x)[2:] if isinstance(x, str) and x.startswith('p:') else x)
        # Apply standard normalization to leads phones
        dedup_df['phone'] = dedup_df['phone'].apply(normalize_phone)
        
    # Ensure boolean conversion for 'is_organic' (1 for True, 0 for False)
    if 'is_organic' in dedup_df.columns:
        dedup_df['is_organic'] = dedup_df['is_organic'].astype(bool).astype(int)

    # Save to consolidated CSV
    dedup_df.to_csv(csv_out_path, index=False, encoding='utf-8-sig')
    print(f"Saved consolidated CSV to: {csv_out_path}")
    
    # Write to SQLite
    cursor = db_conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS leads")
    create_table_sql = """
    CREATE TABLE leads (
        id TEXT PRIMARY KEY,
        created_time TEXT,
        ad_id TEXT,
        ad_name TEXT,
        adset_id TEXT,
        adset_name TEXT,
        campaign_id TEXT,
        campaign_name TEXT,
        form_id TEXT,
        form_name TEXT,
        is_organic INTEGER,
        platform TEXT,
        full_name TEXT,
        phone TEXT,
        city TEXT,
        email TEXT,
        lead_status TEXT,
        source_file TEXT
    );
    """
    cursor.execute(create_table_sql)
    dedup_df.to_sql('leads', db_conn, if_exists='append', index=False)
    print("Written to SQLite 'leads' table.")
    
    # Create indexes
    cursor.execute("CREATE INDEX idx_leads_phone ON leads(phone)")
    cursor.execute("CREATE INDEX idx_leads_created_time ON leads(created_time)")
    cursor.execute("CREATE INDEX idx_leads_campaign_name ON leads(campaign_name)")
    cursor.execute("CREATE INDEX idx_leads_platform ON leads(platform)")
    cursor.execute("CREATE INDEX idx_leads_form_name ON leads(form_name)")
    
    return True

def consolidate_calls(db_conn):
    source_folder = r"C:\Users\BrunoPereiradeMeloAr\Desktop\Marketing e Pitch\analise PitchYEs\chamadas_pitchyes"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_out_path = os.path.join(script_dir, "chamadas_consolidated.csv")
    
    print("\n--- Processing PitchYes Calls ---")
    
    excel_files = glob.glob(os.path.join(source_folder, "*.xlsx")) + glob.glob(os.path.join(source_folder, "*.xls"))
    if not excel_files:
        print(f"Warning: No Excel files found in {source_folder}")
        return False
        
    print(f"Found {len(excel_files)} Excel files to process.")
    
    all_dfs = []
    for f in excel_files:
        filename = os.path.basename(f)
        try:
            # Read first sheet
            df = pd.read_excel(f)
            df['source_file'] = filename
            all_dfs.append(df)
        except Exception as e:
            print(f"Error reading file {filename}: {e}")
            
    if not all_dfs:
        print("Error: No call data could be read.")
        return False
        
    combined_df = pd.concat(all_dfs, ignore_index=True)
    total_raw_rows = len(combined_df)
    
    # Map Excel columns to clean database columns
    mapped_columns = {col: map_column(col) for col in combined_df.columns if col != 'source_file'}
    combined_df = combined_df.rename(columns=mapped_columns)
    
    # Normalize phone numbers
    if 'telefone' in combined_df.columns:
        combined_df['telefone_normalizado'] = combined_df['telefone'].apply(normalize_phone)
    else:
        combined_df['telefone_normalizado'] = None
        
    # Format Date and Time
    if 'data_hora' in combined_df.columns:
        try:
            parsed_dates = pd.to_datetime(combined_df['data_hora'], dayfirst=True)
            combined_df['data_hora'] = parsed_dates.dt.strftime('%Y-%m-%d %H:%M:%S')
        except Exception as e:
            print(f"Warning: Could not format data_hora values as datetime: {e}")
            
    # Deduplicate call entries
    # Drop rows that have identical contact name, original phone and call timestamp
    dedup_df = combined_df.drop_duplicates(subset=['nome_contato', 'telefone', 'data_hora']).copy()
    print(f"Calls: read {total_raw_rows} rows, deduplicated to {len(dedup_df)} unique calls.")
    
    # Save to consolidated CSV
    dedup_df.to_csv(csv_out_path, index=False, encoding='utf-8-sig')
    print(f"Saved consolidated CSV to: {csv_out_path}")
    
    # Write to SQLite
    cursor = db_conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS chamadas")
    
    create_table_sql = """
    CREATE TABLE chamadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_contato TEXT,
        telefone TEXT,
        telefone_normalizado TEXT,
        data_hora TEXT,
        duracao_segundos INTEGER,
        resumo_ligacao TEXT,
        status_ligacao TEXT,
        link_gravacao TEXT,
        reuniao_agendada TEXT,
        link_reuniao TEXT,
        anotacoes TEXT,
        tag TEXT,
        source_file TEXT
    );
    """
    cursor.execute(create_table_sql)
    
    # Write dataframe without 'id' so SQLite auto-generates it
    dedup_df.to_sql('chamadas', db_conn, if_exists='append', index=False)
    print("Written to SQLite 'chamadas' table.")
    
    # Create indexes
    cursor.execute("CREATE INDEX idx_chamadas_telefone_normalizado ON chamadas(telefone_normalizado)")
    cursor.execute("CREATE INDEX idx_chamadas_data_hora ON chamadas(data_hora)")
    cursor.execute("CREATE INDEX idx_chamadas_reuniao_agendada ON chamadas(reuniao_agendada)")
    
    return True

def create_views(db_conn):
    print("\n--- Creating Analytical Views ---")
    cursor = db_conn.cursor()
    
    # Helper: Drop views first to avoid errors
    views = [
        "view_leads_by_campaign", "view_leads_by_platform", "view_leads_by_form", "view_leads_by_city",
        "view_leads_contact_status", "view_unmatched_calls", "view_funnel_summary", "view_campaign_funnel",
        "view_scheduled_meetings"
    ]
    for v in views:
        cursor.execute(f"DROP VIEW IF EXISTS {v}")
        
    # Standard Leads Views
    cursor.execute("""
    CREATE VIEW view_leads_by_campaign AS
    SELECT 
        campaign_name, 
        COUNT(*) as total_leads, 
        MIN(created_time) as first_lead_date, 
        MAX(created_time) as last_lead_date
    FROM leads
    GROUP BY campaign_name
    ORDER BY total_leads DESC;
    """)
    
    cursor.execute("""
    CREATE VIEW view_leads_by_platform AS
    SELECT 
        platform, 
        COUNT(*) as total_leads,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads), 2) as percentage
    FROM leads
    GROUP BY platform
    ORDER BY total_leads DESC;
    """)
    
    cursor.execute("""
    CREATE VIEW view_leads_by_form AS
    SELECT 
        form_name, 
        COUNT(*) as total_leads,
        MIN(created_time) as first_lead_date, 
        MAX(created_time) as last_lead_date
    FROM leads
    GROUP BY form_name
    ORDER BY total_leads DESC;
    """)
    
    cursor.execute("""
    CREATE VIEW view_leads_by_city AS
    SELECT 
        COALESCE(city, 'N/A') as city_name, 
        COUNT(*) as total_leads
    FROM leads
    GROUP BY city_name
    ORDER BY total_leads DESC;
    """)
    
    # Unified Funnel Views linking leads and call history
    
    # View 1: Lead Contact Status (Full list of leads and call counts/summaries)
    cursor.execute("""
    CREATE VIEW view_leads_contact_status AS
    SELECT 
        l.id as lead_id,
        l.full_name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        l.campaign_name,
        l.form_name,
        l.created_time as lead_created_time,
        COALESCE(c_stats.total_calls, 0) as total_calls,
        COALESCE(c_stats.total_duration_seconds, 0) as total_duration_seconds,
        c_stats.last_call_date,
        c_stats.last_call_status,
        c_stats.last_call_summary,
        CASE WHEN c_stats.meetings_count > 0 THEN 1 ELSE 0 END as has_meeting_scheduled,
        c_stats.latest_meeting_time
    FROM leads l
    LEFT JOIN (
        SELECT 
            telefone_normalizado,
            COUNT(*) as total_calls,
            SUM(duracao_segundos) as total_duration_seconds,
            MAX(data_hora) as last_call_date,
            (SELECT status_ligacao FROM chamadas WHERE telefone_normalizado = ch.telefone_normalizado ORDER BY data_hora DESC LIMIT 1) as last_call_status,
            (SELECT resumo_ligacao FROM chamadas WHERE telefone_normalizado = ch.telefone_normalizado ORDER BY data_hora DESC LIMIT 1) as last_call_summary,
            COUNT(reuniao_agendada) as meetings_count,
            MAX(reuniao_agendada) as latest_meeting_time
        FROM chamadas ch
        GROUP BY telefone_normalizado
    ) c_stats ON l.phone = c_stats.telefone_normalizado;
    """)
    
    # View 2: Unmatched Calls (Calls made to numbers not present in Facebook Leads)
    cursor.execute("""
    CREATE VIEW view_unmatched_calls AS
    SELECT 
        c.nome_contato,
        c.telefone,
        c.telefone_normalizado,
        c.data_hora,
        c.duracao_segundos,
        c.resumo_ligacao,
        c.status_ligacao,
        c.reuniao_agendada,
        c.tag,
        c.source_file
    FROM chamadas c
    LEFT JOIN leads l ON c.telefone_normalizado = l.phone
    WHERE l.phone IS NULL;
    """)
    
    # View 3: Scheduled Meetings (All meetings scheduled from either leads or unmatched outbound calls)
    cursor.execute("""
    CREATE VIEW view_scheduled_meetings AS
    SELECT 
        lead_name,
        lead_phone,
        lead_email,
        campaign_name,
        form_name,
        lead_created_time,
        total_calls,
        last_call_date,
        latest_meeting_time
    FROM view_leads_contact_status
    WHERE has_meeting_scheduled = 1
    UNION ALL
    SELECT 
        nome_contato as lead_name,
        telefone as lead_phone,
        'N/A' as lead_email,
        'Outbound / Outro' as campaign_name,
        tag as form_name,
        'N/A' as lead_created_time,
        1 as total_calls,
        data_hora as last_call_date,
        reuniao_agendada as latest_meeting_time
    FROM view_unmatched_calls
    WHERE reuniao_agendada IS NOT NULL AND reuniao_agendada != '';
    """)
    
    # View 4: General Funnel Summary (Overall rates)
    cursor.execute("""
    CREATE VIEW view_funnel_summary AS
    SELECT 
        (SELECT COUNT(*) FROM leads) as total_leads,
        (SELECT COUNT(*) FROM view_leads_contact_status WHERE total_calls > 0) as leads_called,
        (SELECT ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads), 2) FROM view_leads_contact_status WHERE total_calls > 0) as call_coverage_percentage,
        (SELECT COUNT(*) FROM chamadas WHERE telefone_normalizado IN (SELECT phone FROM leads)) as total_calls_to_leads,
        (SELECT COUNT(*) FROM view_leads_contact_status WHERE has_meeting_scheduled = 1) as meetings_scheduled,
        (SELECT ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads), 2) FROM view_leads_contact_status WHERE has_meeting_scheduled = 1) as lead_to_meeting_conversion_percentage;
    """)
    
    # View 5: Campaign Funnel performance
    cursor.execute("""
    CREATE VIEW view_campaign_funnel AS
    SELECT 
        campaign_name,
        COUNT(*) as total_leads,
        SUM(CASE WHEN total_calls > 0 THEN 1 ELSE 0 END) as leads_called,
        ROUND(SUM(CASE WHEN total_calls > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as call_coverage_percentage,
        SUM(total_calls) as total_calls,
        ROUND(AVG(total_calls), 2) as avg_calls_per_lead,
        SUM(has_meeting_scheduled) as meetings_scheduled,
        ROUND(SUM(has_meeting_scheduled) * 100.0 / COUNT(*), 2) as conversion_percentage
    FROM view_leads_contact_status
    GROUP BY campaign_name
    ORDER BY total_leads DESC;
    """)
    
    db_conn.commit()
    print("Analytical views and indexes created successfully.")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, "leads.db")
    
    print("====================================================")
    print("Starting Consolidated Marketing & Sales Database Build")
    print("====================================================")
    
    conn = sqlite3.connect(db_path)
    
    leads_success = consolidate_leads(conn)
    calls_success = consolidate_calls(conn)
    
    if leads_success or calls_success:
        create_views(conn)
        print("Database fully built and validated!")
    else:
        print("Error: Consolidation processes failed.")
        
    conn.close()

if __name__ == "__main__":
    main()
