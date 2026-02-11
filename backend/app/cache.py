"""
In-memory article cache with per-source TTL.

Articles are transient data — fetched from RSS/API sources on demand and cached
briefly (default 15 min) to avoid hitting sources on every request.

Cache structure:
    _cache = {
        "source-id": CacheEntry(articles=[...], fetched_at=..., ttl_minutes=15),
        ...
    }

Design decisions:
- No external dependency (no Redis) — just a Python dict
- Keyed by source_id — each source has its own cache entry and TTL
- Stale entries are overwritten on next fetch (no eviction thread needed)
- Server restart = empty cache = first request fetches fresh data
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class CacheEntry:
    articles: list[dict]       # Normalized article dicts from a single source
    fetched_at: datetime       # When these articles were fetched
    ttl_minutes: int           # How long they're considered fresh

    @property
    def is_fresh(self) -> bool:
        """True if this entry has not expired."""
        return _now() < self.fetched_at + timedelta(minutes=self.ttl_minutes)


# Module-level cache — shared across all requests within the process
_cache: dict[str, CacheEntry] = {}


def get(source_id: str) -> list[dict] | None:
    """Return cached articles if fresh, None if stale or missing."""
    entry = _cache.get(source_id)
    if entry and entry.is_fresh:
        return entry.articles
    return None


def set(source_id: str, articles: list[dict], ttl_minutes: int) -> None:
    """Cache articles for a source. Overwrites any existing entry."""
    _cache[source_id] = CacheEntry(
        articles=articles,
        fetched_at=_now(),
        ttl_minutes=ttl_minutes,
    )


def clear() -> None:
    """Clear entire cache. Useful for testing."""
    _cache.clear()


def stats() -> dict:
    """Return cache stats for debugging/monitoring."""
    entries = {}
    for source_id, entry in _cache.items():
        entries[source_id] = {
            "article_count": len(entry.articles),
            "fetched_at": entry.fetched_at.isoformat(),
            "ttl_minutes": entry.ttl_minutes,
            "is_fresh": entry.is_fresh,
        }
    return {"sources_cached": len(_cache), "entries": entries}
