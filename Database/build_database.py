import os
import glob
import sqlite3
import re
import sys
import pandas as pd
from dotenv import load_dotenv

# Load env variables from parent directory
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
load_dotenv(os.path.join(parent_dir, '.env'))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

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
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_folder = os.getenv("FACEBOOK_LEADS_DIR", os.path.join(script_dir, "leads_facebook"))
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
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS leads (
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
    
    # Perform upsert row-by-row or using a batch SQL statement
    upsert_sql = """
    INSERT INTO leads (
        id, created_time, ad_id, ad_name, adset_id, adset_name, 
        campaign_id, campaign_name, form_id, form_name, is_organic, 
        platform, full_name, phone, city, email, lead_status, source_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        created_time = COALESCE(leads.created_time, excluded.created_time),
        ad_id = COALESCE(leads.ad_id, excluded.ad_id),
        ad_name = COALESCE(leads.ad_name, excluded.ad_name),
        adset_id = COALESCE(leads.adset_id, excluded.adset_id),
        adset_name = COALESCE(leads.adset_name, excluded.adset_name),
        campaign_id = COALESCE(leads.campaign_id, excluded.campaign_id),
        campaign_name = COALESCE(leads.campaign_name, excluded.campaign_name),
        form_id = COALESCE(leads.form_id, excluded.form_id),
        form_name = COALESCE(leads.form_name, excluded.form_name),
        is_organic = COALESCE(leads.is_organic, excluded.is_organic),
        platform = COALESCE(leads.platform, excluded.platform),
        full_name = COALESCE(leads.full_name, excluded.full_name),
        phone = COALESCE(leads.phone, excluded.phone),
        city = COALESCE(leads.city, excluded.city),
        email = COALESCE(leads.email, excluded.email),
        lead_status = COALESCE(leads.lead_status, excluded.lead_status),
        source_file = COALESCE(leads.source_file, excluded.source_file)
    """
    
    columns = [
        'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
        'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic',
        'platform', 'full_name', 'phone', 'city', 'email', 'lead_status', 'source_file'
    ]
    
    # Ensure all columns exist in the DataFrame (fill with None if missing)
    for col in columns:
        if col not in dedup_df.columns:
            dedup_df[col] = None
            
    records = dedup_df[columns].values.tolist()
    
    # Convert numpy types to python types (especially nan to None)
    clean_records = []
    for r in records:
        clean_records.append([None if pd.isna(val) else val for val in r])
        
    cursor.executemany(upsert_sql, clean_records)
    db_conn.commit()
    print(f"Upserted {len(clean_records)} leads into SQLite.")
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_created_time ON leads(created_time)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_campaign_name ON leads(campaign_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_form_name ON leads(form_name)")
    
    return True

def consolidate_calls(db_conn):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_folder = os.getenv("PITCHYES_CALLS_DIR", os.path.join(script_dir, "chamadas_pitchyes"))
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
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS chamadas (
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
    
    # Create the unique index to enable ON CONFLICT upserting
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chamadas_upsert ON chamadas(nome_contato, telefone, data_hora)")
    
    # We will use cursor.executemany to perform the upsert efficiently
    upsert_sql = """
    INSERT INTO chamadas (
        nome_contato, telefone, telefone_normalizado, data_hora, 
        duracao_segundos, resumo_ligacao, status_ligacao, 
        link_gravacao, reuniao_agendada, link_reuniao, 
        anotacoes, tag, source_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nome_contato, telefone, data_hora) DO UPDATE SET
        telefone_normalizado = COALESCE(chamadas.telefone_normalizado, excluded.telefone_normalizado),
        duracao_segundos = COALESCE(chamadas.duracao_segundos, excluded.duracao_segundos),
        resumo_ligacao = COALESCE(chamadas.resumo_ligacao, excluded.resumo_ligacao),
        status_ligacao = COALESCE(chamadas.status_ligacao, excluded.status_ligacao),
        link_gravacao = COALESCE(chamadas.link_gravacao, excluded.link_gravacao),
        reuniao_agendada = COALESCE(chamadas.reuniao_agendada, excluded.reuniao_agendada),
        link_reuniao = COALESCE(chamadas.link_reuniao, excluded.link_reuniao),
        anotacoes = COALESCE(chamadas.anotacoes, excluded.anotacoes),
        tag = COALESCE(chamadas.tag, excluded.tag),
        source_file = COALESCE(chamadas.source_file, excluded.source_file)
    """
    
    columns = [
        'nome_contato', 'telefone', 'telefone_normalizado', 'data_hora',
        'duracao_segundos', 'resumo_ligacao', 'status_ligacao',
        'link_gravacao', 'reuniao_agendada', 'link_reuniao',
        'anotacoes', 'tag', 'source_file'
    ]
    
    # Ensure all columns exist in the DataFrame (fill with None if missing)
    for col in columns:
        if col not in dedup_df.columns:
            dedup_df[col] = None
            
    records = dedup_df[columns].values.tolist()
    
    # Convert numpy types to python types (especially nan to None)
    clean_records = []
    for r in records:
        clean_records.append([None if pd.isna(val) else val for val in r])
        
    cursor.executemany(upsert_sql, clean_records)
    db_conn.commit()
    print(f"Upserted {len(clean_records)} calls into SQLite.")
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chamadas_telefone_normalizado ON chamadas(telefone_normalizado)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chamadas_data_hora ON chamadas(data_hora)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chamadas_reuniao_agendada ON chamadas(reuniao_agendada)")
    
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

def log_message(level, message):
    from datetime import datetime
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {message}")

def distribute_new_leads(db_conn):
    import json
    from datetime import datetime
    
    log_message("INFO", "Running Lead Distribution (Round-Robin)...")
    cursor = db_conn.cursor()
    
    # Ensure negócios and negócios_historico tables exist (prevent crashes on fresh installs)
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT,
            tags TEXT
        );
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS negocios_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id TEXT NOT NULL,
            etapa_anterior TEXT,
            etapa_nova TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            usuario_email TEXT NOT NULL,
            usuario_nome TEXT NOT NULL,
            data_hora TEXT NOT NULL
        );
        """)
        db_conn.commit()
    except Exception as e:
        log_message("ERROR", f"Failed to verify/create 'negocios' or 'negocios_historico' tables: {e}")
        return
        
    # 1. Fetch setting for distribution
    try:
        cursor.execute("SELECT value FROM settings WHERE key = 'distribuicao'")
        row = cursor.fetchone()
    except sqlite3.OperationalError as e:
        log_message("WARNING", f"Table 'settings' does not exist yet. Skipping lead distribution. (Detail: {e})")
        return
        
    if not row:
        log_message("INFO", "No lead distribution settings found in 'settings' table. Skipping.")
        return
        
    try:
        config = json.loads(row[0])
    except Exception as e:
        log_message("ERROR", f"Error parsing distribution config JSON: {e}")
        return
        
    auto_distribute = config.get("auto_distribute", False)
    participating_users = config.get("participating_users", [])
    
    if not auto_distribute:
        log_message("INFO", "Round-Robin distribution is disabled in settings. Skipping.")
        return
        
    if not participating_users:
        log_message("WARNING", "No participating users selected in settings. Skipping.")
        return
        
    # 2. Fetch active users' email and names
    user_ids = []
    for uid in participating_users:
        try:
            user_ids.append(int(uid))
        except (ValueError, TypeError):
            pass
            
    if not user_ids:
        log_message("WARNING", "No valid user IDs found in settings. Skipping.")
        return
        
    placeholders = ",".join("?" for _ in user_ids)
    try:
        cursor.execute(f"SELECT id, email, name, active FROM users WHERE id IN ({placeholders})", tuple(user_ids))
        all_db_users = [dict(zip(["id", "email", "name", "active"], r)) for r in cursor.fetchall()]
    except sqlite3.OperationalError as e:
        log_message("WARNING", f"Table 'users' does not exist yet. Skipping lead distribution. (Detail: {e})")
        return
        
    # Filter active users and log inactive/missing users
    db_users = [u for u in all_db_users if u["active"] == 1]
    
    db_user_ids = {u["id"] for u in all_db_users}
    active_user_ids = {u["id"] for u in db_users}
    
    for uid in user_ids:
        if uid not in db_user_ids:
            log_message("WARNING", f"Configured user ID {uid} does not exist in 'users' table.")
        elif uid not in active_user_ids:
            log_message("WARNING", f"Configured user ID {uid} exists but is marked INACTIVE in the database.")
            
    if not db_users:
        log_message("ERROR", "No active participating users found in the database. Skipping lead distribution.")
        return
        
    # Order the users in the round robin to match the order in participating_users setting
    user_order_map = {int(uid): idx for idx, uid in enumerate(participating_users) if str(uid).isdigit()}
    db_users.sort(key=lambda u: user_order_map.get(u["id"], 9999))
    
    log_message("INFO", f"Active consultants in distribution queue (ordered): {[u['name'] for u in db_users]}")
    
    # 3. Find leads that DO NOT exist in negocios
    # Join with the latest call partition to compute stage
    cursor.execute("""
    SELECT l.id, l.full_name, l.phone,
           c.resumo_ligacao, c.reuniao_agendada
    FROM leads l
    LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY telefone_normalizado ORDER BY data_hora DESC) as rn
        FROM chamadas
    ) c ON c.telefone_normalizado = l.phone AND c.rn = 1
    WHERE l.id NOT IN (SELECT lead_id FROM negocios)
    ORDER BY l.created_time ASC
    """)
    new_leads = cursor.fetchall()
    
    if not new_leads:
        log_message("INFO", "No new unassigned leads found. Distribution complete.")
        return
        
    log_message("INFO", f"Found {len(new_leads)} new unassigned leads to distribute.")
    
    def compute_initial_stage(resumo_ligacao, reuniao_agendada, has_call):
        if not has_call:
            return "Sem Contato"
        resumo_lower = (resumo_ligacao or "").lower()
        if (reuniao_agendada and str(reuniao_agendada).lower() != 'none' and str(reuniao_agendada).strip() != '') or "reunião agendada" in resumo_lower:
            return "Reunião Agendada"
        elif "{lead quente}" in resumo_lower or "retorno agendado" in resumo_lower:
            return "Qualificado"
        elif "{lead desqualificado}" in resumo_lower:
            return "Perdido"
        else:
            return "Contatado"
            
    # 4. Perform Round-Robin assignment
    num_users = len(db_users)
    
    # To make it even more balanced across imports, we start with the user who has the fewest assigned leads.
    # We use case-insensitive email keys to ensure correct lookup and mapping.
    cursor.execute("SELECT usuario_email, count(*) as count FROM negocios WHERE usuario_email IS NOT NULL GROUP BY usuario_email")
    counts_map = {r[0].lower(): r[1] for r in cursor.fetchall() if r[0]}
    
    min_count = float('inf')
    start_user_idx = 0
    for idx, u in enumerate(db_users):
        email_key = u["email"].lower() if u["email"] else ""
        ucount = counts_map.get(email_key, 0)
        if ucount < min_count:
            min_count = ucount
            start_user_idx = idx
            
    user_idx = start_user_idx
    log_message("INFO", f"Starting distribution from: {db_users[user_idx]['name']} (email: {db_users[user_idx]['email']}, current count: {counts_map.get(db_users[user_idx]['email'].lower(), 0)})")
    
    insert_negocios_sql = """
        INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    
    negocios_data = []
    updated_at = datetime.now().isoformat()
    
    for lead in new_leads:
        lead_id, full_name, phone, resumo_ligacao, reuniao_agendada = lead
        has_call = phone is not None and resumo_ligacao is not None
        initial_stage = compute_initial_stage(resumo_ligacao, reuniao_agendada, has_call)
        
        assigned_user = db_users[user_idx]
        
        negocios_data.append((
            lead_id,
            initial_stage,
            0.0,
            updated_at,
            assigned_user["email"],
            assigned_user["name"]
        ))
        
        log_message("INFO", f"Lead '{full_name}' ({lead_id}) -> Assigned to: {assigned_user['name']} ({assigned_user['email']}) | Stage: {initial_stage}")
        user_idx = (user_idx + 1) % num_users
        
    if negocios_data:
        try:
            cursor.executemany(insert_negocios_sql, negocios_data)
            db_conn.commit()
            log_message("INFO", f"Successfully distributed {len(negocios_data)} leads in 'negocios' table.")
        except Exception as e:
            log_message("ERROR", f"Error inserting into 'negocios' table: {e}")
            return
        
        # Insert audit trail for these assignments in negocios_historico
        insert_hist_sql = """
            INSERT INTO negocios_historico (lead_id, etapa_anterior, etapa_nova, valor, usuario_email, usuario_nome, data_hora)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        hist_data = []
        for d in negocios_data:
            hist_data.append((
                d[0],
                "Sem Contato",
                d[1],
                0.0,
                d[4],
                d[5],
                d[3]
            ))
        try:
            cursor.executemany(insert_hist_sql, hist_data)
            db_conn.commit()
            log_message("INFO", f"Created {len(hist_data)} history audit entries in 'negocios_historico' table.")
        except Exception as e:
            log_message("ERROR", f"Error inserting audit entries into 'negocios_historico': {e}")

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
        distribute_new_leads(conn)
        print("Database fully built and validated!")
    else:
        print("Error: Consolidation processes failed.")
        
    conn.close()

if __name__ == "__main__":
    main()
