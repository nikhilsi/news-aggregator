"""In-memory article cache with per-source TTL."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class CacheEntry:
    articles: list[dict]
    fetched_at: datetime
    ttl_minutes: int

    @property
    def is_fresh(self) -> bool:
        return _now() < self.fetched_at + timedelta(minutes=self.ttl_minutes)


_cache: dict[str, CacheEntry] = {}


def get(source_id: str) -> list[dict] | None:
    """Return cached articles if fresh, None if stale/missing."""
    entry = _cache.get(source_id)
    if entry and entry.is_fresh:
        return entry.articles
    return None


def set(source_id: str, articles: list[dict], ttl_minutes: int) -> None:
    """Cache articles for a source."""
    _cache[source_id] = CacheEntry(
        articles=articles,
        fetched_at=_now(),
        ttl_minutes=ttl_minutes,
    )


def clear() -> None:
    """Clear entire cache."""
    _cache.clear()


def stats() -> dict:
    """Return cache stats for debugging."""
    entries = {}
    for source_id, entry in _cache.items():
        entries[source_id] = {
            "article_count": len(entry.articles),
            "fetched_at": entry.fetched_at.isoformat(),
            "ttl_minutes": entry.ttl_minutes,
            "is_fresh": entry.is_fresh,
        }
    return {"sources_cached": len(_cache), "entries": entries}
