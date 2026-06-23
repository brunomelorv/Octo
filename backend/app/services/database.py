import os
import aiosqlite
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./leads.db")

def dict_factory(cursor, row):
    """Row factory to convert SQLite rows to dictionaries."""
    fields = [column[0] for column in cursor.description]
    return {key: value for key, value in zip(fields, row)}

async def get_db() -> aiosqlite.Connection:
    """Opens a connection to the SQLite database with row_factory set to return dicts."""
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn

async def query(sql: str, params: tuple = ()) -> list[dict]:
    """Executes a SQL query and returns the list of row dictionaries."""
    db = await get_db()
    try:
        async with db.execute(sql, params) as cursor:
            return await cursor.fetchall()
    finally:
        await db.close()
