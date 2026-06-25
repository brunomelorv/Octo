import os
import aiosqlite
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def dict_factory(cursor, row):
    """Row factory to convert SQLite rows to dictionaries."""
    fields = [column[0] for column in cursor.description]
    return {key: value for key, value in zip(fields, row)}

def resolve_db_path() -> str:
    raw_path = os.getenv("DB_PATH", "./leads.db")
    candidate = Path(raw_path)
    if candidate.is_absolute():
      return str(candidate)

    cwd_candidate = (Path.cwd() / candidate).resolve()
    if cwd_candidate.exists():
        return str(cwd_candidate)

    backend_candidate = (Path(__file__).resolve().parents[2] / candidate).resolve()
    return str(backend_candidate)

async def get_db() -> aiosqlite.Connection:
    """Opens a connection to the SQLite database with row_factory set to return dicts."""
    conn = await aiosqlite.connect(resolve_db_path())
    conn.row_factory = dict_factory
    return conn

async def query(sql: str, params: tuple = ()) -> list[dict]:
    """Executes a SQL query and returns the list of row dictionaries."""
    db = await get_db()
    try:
        async with db.execute(sql, params) as cursor:
            res = await cursor.fetchall()
            await db.commit()
            return res
    finally:
        await db.close()
