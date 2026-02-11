"""
SQLite database connection and initialization.

Only persistent data lives in SQLite (currently just the users table).
Articles are cached in-memory — see cache.py.

Schema is defined in backend/schema.sql and applied on startup via init_db().
Uses WAL journal mode for better concurrent read performance.
"""

import aiosqlite
from pathlib import Path

# Database file location (relative to where uvicorn is started)
DB_PATH = Path("news_aggregator.db")

# SQL schema file — lives alongside sources.yaml in backend/
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


async def get_db() -> aiosqlite.Connection:
    """Get an async database connection.

    Returns a connection with:
    - Row factory set (access columns by name)
    - WAL journal mode enabled (better read concurrency)

    Caller is responsible for closing the connection.
    """
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    return db


async def init_db() -> None:
    """Initialize the database by applying schema.sql.

    Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
    """
    schema = SCHEMA_PATH.read_text()
    db = await aiosqlite.connect(DB_PATH)
    try:
        await db.executescript(schema)
        await db.commit()
    finally:
        await db.close()
