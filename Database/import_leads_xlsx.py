"""
Importa leads exportados do Meta em formato XLSX para o banco do CRM.

O pipeline padrao (build_database.py) so le os exports em CSV UTF-16/tab que a Meta
gerava antes. Os exports novos vem em .xlsx, com os IDs "crus" (sem os prefixos
l:/ag:/as:/c:/f:) e com created_time como datetime. Este script faz essa
normalizacao e usa exatamente o mesmo UPSERT da tabela leads, para que os registros
fiquem indistinguiveis dos importados pelo pipeline antigo.

Uso:
    python3 Database/import_leads_xlsx.py "arquivo.xlsx"                 # so importa os leads
    python3 Database/import_leads_xlsx.py "arquivo.xlsx" --dry-run       # simula, nao grava
    python3 Database/import_leads_xlsx.py "arquivo.xlsx" --distribute    # + cria os cards do Kanban
    python3 Database/import_leads_xlsx.py "arquivo.xlsx" --distribute --tags   # + tag de qualificacao
"""

import argparse
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

import pandas as pd

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# Reaproveita as funcoes do pipeline oficial para nao divergir de comportamento.
import build_database as bd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Fuso do banco: todos os created_time existentes estao em -03:00.
LEADS_TZ = timezone(timedelta(hours=-3))

# Mesma regra de telefone valido usada no cadastro manual (leads_service.create_lead).
# Barra o lixo que a pessoa as vezes digita no formulario (",9,,", ",8,0"), que o
# normalize_phone converteria em "+9" / "+80" e viraria um lead impossivel de ligar.
PHONE_RE = re.compile(r"^\+\d{8,15}$")

# Definido pelo --keep-invalid-phones em main().
DROP_INVALID_PHONES = True

# Prefixos que a exportacao CSV da Meta aplica e que o banco ja usa como convencao.
ID_PREFIXES = {
    "id": "l:",
    "ad_id": "ag:",
    "adset_id": "as:",
    "campaign_id": "c:",
    "form_id": "f:",
}

LEAD_COLUMNS = [
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
    "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
    "platform", "full_name", "phone", "city", "email", "lead_status", "source_file",
]

# UPSERT identico ao de build_database.consolidate_leads: nunca sobrescreve dado
# ja existente no banco, so preenche o que estiver NULL.
UPSERT_SQL = """
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

# Respostas da pergunta de qualificacao -> tag curta para o card do Kanban.
QUALIFICACAO_TAGS = {
    "sim,_possuo_o_valor_disponível": "Possui o valor",
    "possuo_parte_do_valor": "Possui parte do valor",
    "não_possuo_o_valor_no_momento": "Sem o valor",
}


def log(msg=""):
    print(msg, flush=True)


def prefix_id(value, prefix):
    """Aplica o prefixo da convencao Meta/CSV se o ID vier cru do xlsx."""
    if pd.isna(value):
        return None
    # int64 do pandas viraria "1.6195863501682841e+18" via str() direto.
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    if not text:
        return None
    return text if ":" in text else f"{prefix}{text}"


def to_iso(value):
    """created_time -> ISO-8601 com offset -03:00, como o resto da tabela."""
    if pd.isna(value):
        return None
    ts = pd.to_datetime(value)
    if ts.tzinfo is None:
        ts = ts.tz_localize(LEADS_TZ)
    else:
        ts = ts.tz_convert(LEADS_TZ)
    return ts.isoformat(timespec="seconds")


def to_bool_int(value):
    if pd.isna(value):
        return None
    if isinstance(value, str):
        return 1 if value.strip().lower() in ("true", "1", "sim", "yes") else 0
    return int(bool(value))


def clean_text(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def read_leads_table(path):
    """
    Le uma exportacao de leads da Meta em qualquer um dos formatos que ela entrega:
    .xlsx, .csv (UTF-16/tab do export antigo ou UTF-8) e o .xls que na verdade é
    SpreadsheetML (XML do Excel 2003), que o pandas nao abre.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".xlsx":
        return pd.read_excel(path)

    if ext == ".csv":
        for enc, sep in (("utf-16", "\t"), ("utf-8-sig", ","), ("utf-8", ",")):
            try:
                return pd.read_csv(path, encoding=enc, sep=sep)
            except (UnicodeError, UnicodeDecodeError):
                continue
        raise SystemExit(f"ERRO: nao consegui ler o CSV: {path}")

    if ext == ".xls":
        try:
            return pd.read_excel(path)
        except Exception:
            pass  # nao é .xls binario; tenta SpreadsheetML abaixo
        import xml.etree.ElementTree as ET
        ns = {"ss": "urn:schemas-microsoft-com:office:spreadsheet"}
        root = ET.parse(path).getroot()
        rows = root.findall(".//ss:Table/ss:Row", ns)
        if not rows:
            raise SystemExit(f"ERRO: nenhuma linha encontrada em {path}")

        def cells(row):
            out = []
            for cell in row.findall("ss:Cell", ns):
                data = cell.find("ss:Data", ns)
                out.append(data.text if data is not None else None)
            return out

        header = cells(rows[0])
        return pd.DataFrame([cells(r) for r in rows[1:]], columns=header)

    raise SystemExit(f"ERRO: formato nao suportado: {ext}")


def load_known_ids(paths):
    """IDs ja presentes em exports anteriores, para montar o incremental."""
    known = set()
    for path in paths:
        if not os.path.isfile(path):
            raise SystemExit(f"ERRO: arquivo de exclusao nao encontrado: {path}")
        prev = read_leads_table(path)
        if "id" not in prev.columns:
            raise SystemExit(f"ERRO: {path} nao tem coluna 'id'.")
        ids = {prefix_id(v, ID_PREFIXES["id"]) for v in prev["id"]}
        known |= {i for i in ids if i}
        log(f"  {len(ids)} lead(s) em {os.path.basename(path)}")
    return known


def find_qualificacao_column(df):
    """A pergunta do formulario vira nome de coluna e muda a cada campanha."""
    for col in df.columns:
        low = str(col).lower()
        if "investir" in low or "investimento" in low or "valor_dispon" in low:
            return col
    return None


def load_and_normalize(xlsx_path, sheet):
    df = pd.read_excel(xlsx_path, sheet_name=sheet) if sheet not in (0, None) else read_leads_table(xlsx_path)
    df.columns = [str(c).strip() for c in df.columns]

    missing = [c for c in ("id", "created_time", "full_name", "phone") if c not in df.columns]
    if missing:
        raise SystemExit(f"ERRO: colunas obrigatorias ausentes na planilha: {missing}")

    qual_col = find_qualificacao_column(df)
    source_file = os.path.basename(xlsx_path)

    out = pd.DataFrame(index=df.index)
    for col, prefix in ID_PREFIXES.items():
        out[col] = df[col].apply(lambda v, p=prefix: prefix_id(v, p)) if col in df.columns else None

    out["created_time"] = df["created_time"].apply(to_iso)
    out["is_organic"] = df["is_organic"].apply(to_bool_int) if "is_organic" in df.columns else 0
    out["phone"] = df["phone"].apply(bd.normalize_phone)

    for col in ("ad_name", "adset_name", "campaign_name", "form_name", "platform",
                "full_name", "city", "lead_status"):
        out[col] = df[col].apply(clean_text) if col in df.columns else None

    out["email"] = df["email"].apply(lambda v: (clean_text(v) or "").lower() or None) if "email" in df.columns else None
    out["lead_status"] = out["lead_status"].fillna("complete")
    out["source_file"] = source_file
    out["_qualificacao"] = df[qual_col].apply(clean_text) if qual_col else None

    # Sem id ou sem telefone valido o lead nao é utilizavel no CRM.
    valid_phone = out["phone"].apply(lambda p: bool(p) and bool(PHONE_RE.match(str(p))))
    invalid = out[out["id"].isna() | ~valid_phone]
    if len(invalid):
        acao = "descartada(s)" if DROP_INVALID_PHONES else "mantida(s) (--keep-invalid-phones)"
        log(f"AVISO: {len(invalid)} linha(s) com id ausente ou telefone invalido, {acao}:")
        for _, row in invalid.iterrows():
            log(f"  {row['full_name']} | telefone apurado: {row['phone']} | {row['city']}")
        if DROP_INVALID_PHONES:
            out = out.drop(invalid.index)

    # Mesma regra do pipeline: dedup por id mantendo o registro mais recente.
    before = len(out)
    out = out.sort_values("created_time").drop_duplicates(subset=["id"], keep="last")
    if before != len(out):
        log(f"Dedup por id dentro do arquivo: {before} -> {len(out)} linhas.")

    return out, qual_col


def export_meta_csv(df, out_path, qual_col):
    """
    Grava o CSV no formato que o build_database.consolidate_leads() le:
    UTF-16 com tabulacao, colunas originais da Meta e IDs ja prefixados
    (l:/ag:/as:/c:/f:), que é como o export CSV da Meta entrega e como o
    banco de producao ja tem gravado.
    """
    cols = ["id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
            "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
            "platform", "full_name", "email", "phone", "city", "lead_status"]

    out = df.copy()
    # 'false'/'true' minusculo: o pandas infere dtype bool na leitura, que é o que
    # o consolidate_leads espera antes do .astype(bool).astype(int).
    out["is_organic"] = out["is_organic"].apply(lambda v: "true" if v else "false")
    # created_time sem o 'T' do ISO nao é exigido; mantemos ISO com offset -03:00.

    if qual_col:
        out[qual_col] = out["_qualificacao"]
        cols.append(qual_col)

    out[cols].to_csv(out_path, sep="\t", index=False, encoding="utf-16")
    return out_path, cols


def backup_db(db_path):
    backup_dir = os.path.join(script_dir, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(backup_dir, f"leads_pre_import_{stamp}.db")
    shutil.copy2(db_path, dest)
    log(f"Backup do banco criado em: {dest}")
    return dest


def report_collisions(conn, df, skip_existing_phones):
    """Telefones que ja existem no banco viram cards duplicados no Kanban."""
    cur = conn.cursor()
    phones = [p for p in df["phone"].tolist() if p]
    existing = {}
    for i in range(0, len(phones), 500):
        chunk = phones[i:i + 500]
        placeholders = ",".join("?" for _ in chunk)
        cur.execute(
            f"SELECT phone, id, full_name FROM leads WHERE phone IN ({placeholders})",
            tuple(chunk),
        )
        for phone, lead_id, name in cur.fetchall():
            existing.setdefault(phone, (lead_id, name))

    ids_in_db = set()
    ids = df["id"].tolist()
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        placeholders = ",".join("?" for _ in chunk)
        cur.execute(f"SELECT id FROM leads WHERE id IN ({placeholders})", tuple(chunk))
        ids_in_db.update(r[0] for r in cur.fetchall())

    # Colisao real = telefone repetido em um lead que NAO é o mesmo registro.
    collisions = df[df["phone"].isin(existing.keys()) & ~df["id"].isin(ids_in_db)]

    if len(ids_in_db):
        log(f"{len(ids_in_db)} lead(s) do arquivo ja existem por id (serao atualizados, sem sobrescrever dados).")
    if len(collisions):
        log(f"\nAVISO: {len(collisions)} lead(s) tem telefone ja cadastrado em outro lead:")
        for _, row in collisions.head(15).iterrows():
            old_id, old_name = existing[row["phone"]]
            log(f"  {row['phone']}  novo: {row['full_name']}  |  ja no CRM: {old_name} ({old_id})")
        if len(collisions) > 15:
            log(f"  ... e mais {len(collisions) - 15}.")
        if skip_existing_phones:
            log("  --skip-existing-phones ativo: esses leads NAO serao importados.")
            df = df.drop(collisions.index)
        else:
            log("  Serao importados assim mesmo (use --skip-existing-phones para ignora-los).")

    return df


def upsert_leads(conn, df):
    records = []
    for _, row in df[LEAD_COLUMNS].iterrows():
        records.append([None if pd.isna(v) else v for v in row.tolist()])
    cur = conn.cursor()
    cur.executemany(UPSERT_SQL, records)
    conn.commit()
    return len(records)


def apply_qualificacao_tags(conn, df):
    """
    Grava a resposta de qualificacao como tag do negocio. A coluna negocios.tags é
    uma string separada por virgula, editavel na tela de Negocios. So preenche
    quando a tag esta vazia, para nunca apagar o que um consultor escreveu.
    """
    cur = conn.cursor()
    updated = 0
    for _, row in df.iterrows():
        tag = QUALIFICACAO_TAGS.get(row.get("_qualificacao"))
        if not tag:
            continue
        cur.execute(
            "UPDATE negocios SET tags = ? WHERE lead_id = ? AND (tags IS NULL OR tags = '')",
            (tag, row["id"]),
        )
        updated += cur.rowcount
    conn.commit()
    return updated


def write_qualificacao_report(df, qual_col):
    """A tabela leads nao tem coluna para a pergunta do formulario; salva à parte."""
    path = os.path.join(script_dir, "qualificacao_import.csv")
    report = df[["id", "full_name", "phone", "city", "_qualificacao"]].rename(
        columns={"_qualificacao": qual_col or "qualificacao"}
    )
    report.to_csv(path, index=False, encoding="utf-8-sig")
    log(f"Respostas de qualificacao salvas em: {path}")


def main():
    parser = argparse.ArgumentParser(description="Importa leads de um XLSX da Meta para o CRM.")
    parser.add_argument("xlsx", help="Caminho do arquivo .xlsx exportado da Meta")
    parser.add_argument("--sheet", default=0, help="Nome ou indice da aba (padrao: primeira)")
    parser.add_argument("--db", default=os.path.join(script_dir, "leads.db"), help="Caminho do leads.db")
    parser.add_argument("--dry-run", action="store_true", help="Mostra o que seria feito, sem gravar")
    parser.add_argument("--distribute", action="store_true",
                        help="Roda a distribuicao round-robin e cria os cards no Kanban")
    parser.add_argument("--tags", action="store_true",
                        help="Grava a resposta de qualificacao como tag do negocio")
    parser.add_argument("--skip-existing-phones", action="store_true",
                        help="Nao importa leads cujo telefone ja existe no CRM")
    parser.add_argument("--no-backup", action="store_true", help="Nao faz backup do banco antes de gravar")
    parser.add_argument("--to-csv", metavar="SAIDA.csv", nargs="?", const="auto",
                        help="So gera o CSV no formato de upload do CRM (UTF-16/tab). Nao toca no banco.")
    parser.add_argument("--keep-invalid-phones", action="store_true",
                        help="Mantem linhas com telefone invalido em vez de descarta-las")
    parser.add_argument("--exclude-from", action="append", default=[], metavar="ARQUIVO",
                        help="Export anterior (xlsx/xls/csv) cujos leads ja foram enviados. Repetivel.")
    parser.add_argument("--since", metavar="'AAAA-MM-DD HH:MM:SS'",
                        help="So leads com created_time posterior a esta data/hora")
    args = parser.parse_args()

    global DROP_INVALID_PHONES
    DROP_INVALID_PHONES = not args.keep_invalid_phones

    if not os.path.isfile(args.xlsx):
        raise SystemExit(f"ERRO: arquivo nao encontrado: {args.xlsx}")
    if not args.to_csv and not os.path.isfile(args.db):
        raise SystemExit(f"ERRO: banco nao encontrado: {args.db}")

    sheet = int(args.sheet) if str(args.sheet).isdigit() else args.sheet

    log("=" * 60)
    log("Importacao de leads XLSX -> CRM")
    log("=" * 60)
    log(f"Arquivo: {args.xlsx}")
    log(f"Banco:   {args.db}")
    log()

    df, qual_col = load_and_normalize(args.xlsx, sheet)
    total_arquivo = len(df)

    if args.exclude_from:
        log("\nExcluindo leads ja enviados em exports anteriores:")
        known = load_known_ids(args.exclude_from)
        antes = len(df)
        df = df[~df["id"].isin(known)]
        log(f"  {antes} -> {len(df)} lead(s) (removidos {antes - len(df)} ja conhecidos)")

    if args.since:
        cutoff = pd.to_datetime(args.since)
        if cutoff.tzinfo is None:
            cutoff = cutoff.tz_localize(LEADS_TZ)
        antes = len(df)
        df = df[pd.to_datetime(df["created_time"]) > cutoff]
        log(f"\nFiltro --since {cutoff.isoformat()}: {antes} -> {len(df)} lead(s)")

    if df.empty:
        log("\nNenhum lead novo apos os filtros. Nada a fazer.")
        return

    log(f"\n{len(df)} lead(s) prontos (de {total_arquivo} no arquivo).")
    log(f"Periodo: {df['created_time'].min()} -> {df['created_time'].max()}")
    if qual_col:
        log(f"\nPergunta de qualificacao encontrada ('{qual_col}'):")
        for value, count in df["_qualificacao"].value_counts(dropna=False).items():
            log(f"  {count:>4}  {value}")

    log("\nAmostra do que sera gravado:")
    for _, row in df.head(3).iterrows():
        log(f"  {row['id']} | {row['created_time']} | {row['full_name']} | {row['phone']} | "
            f"{row['city']} | {row['campaign_name']}")

    if args.to_csv:
        if args.to_csv == "auto":
            base = os.path.splitext(os.path.basename(args.xlsx))[0]
            out_path = os.path.join(os.path.dirname(os.path.abspath(args.xlsx)), f"{base}.csv")
        else:
            out_path = args.to_csv
        path, cols = export_meta_csv(df, out_path, qual_col)
        log(f"\nCSV gerado: {path}")
        log(f"  {len(df)} lead(s) | UTF-16 / tabulacao | {len(cols)} colunas")
        log("  Suba em Configuracoes > Upload de Leads do Facebook e rode a atualizacao da base.")
        return

    conn = sqlite3.connect(args.db)
    try:
        log()
        df = report_collisions(conn, df, args.skip_existing_phones)

        if args.dry_run:
            log(f"\n[DRY-RUN] Nada foi gravado. {len(df)} lead(s) seriam inseridos/atualizados.")
            if args.distribute:
                log("[DRY-RUN] A distribuicao round-robin tambem seria executada.")
            return

        if not args.no_backup:
            backup_db(args.db)

        total_before = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        count = upsert_leads(conn, df)
        total_after = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        log(f"\nUpsert concluido: {count} linha(s) processadas.")
        log(f"Total de leads no banco: {total_before} -> {total_after} (+{total_after - total_before} novos).")

        if qual_col:
            write_qualificacao_report(df, qual_col)

        if args.distribute:
            log("\n--- Distribuicao round-robin ---")
            bd.distribute_new_leads(conn)
            if args.tags:
                updated = apply_qualificacao_tags(conn, df)
                log(f"Tag de qualificacao aplicada em {updated} negocio(s).")
        elif args.tags:
            log("\nAVISO: --tags exige --distribute (os negocios precisam existir antes). Ignorado.")
        else:
            log("\nOs leads foram gravados, mas ainda NAO aparecem no Kanban de Negocios.")
            log("Rode de novo com --distribute (ou execute Database/build_database.py) para distribui-los.")
    finally:
        conn.close()

    log("\nConcluido.")


if __name__ == "__main__":
    main()
