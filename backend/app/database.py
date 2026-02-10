import aiosqlite
from pathlib import Path

DB_PATH = Path("news_aggregator.db")
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


async def get_db() -> aiosqlite.Connection:
    """Get a database connection. Caller must close it."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    return db


async def init_db() -> None:
    """Create tables if they don't exist. Reads schema from schema.sql."""
    schema = SCHEMA_PATH.read_text()
    db = await aiosqlite.connect(DB_PATH)
    try:
        await db.executescript(schema)
        await db.commit()
    finally:
        await db.close()
