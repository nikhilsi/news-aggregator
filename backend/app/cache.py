"""
In-memory article cache with per-source TTL and stale-while-revalidate (SWR).

Articles are transient data — fetched from RSS/API sources on demand and cached
briefly (default 15 min) to avoid hitting sources on every request.

Cache structure:
    _cache = {
        "source-id": CacheEntry(articles=[...], fetched_at=..., ttl_minutes=15),
        ...
    }

SWR behavior:
    - Fresh (< TTL): return immediately
    - Stale (TTL to 4x TTL): return stale data, trigger background refresh
    - Expired (> 4x TTL) or missing: caller must fetch synchronously

Design decisions:
- No external dependency (no Redis) — just a Python dict
- Keyed by source_id — each source has its own cache entry and TTL
- Stale entries are overwritten on next fetch (no eviction thread needed)
- Server restart = empty cache = first request fetches fresh data
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CacheStatus(Enum):
    """Result of a cache lookup."""
    HIT = "hit"        # Fresh data, no action needed
    STALE = "stale"    # Usable data, but should refresh in background
    MISS = "miss"      # No data available, must fetch synchronously


@dataclass
class CacheResult:
    """Result from get_swr() — includes status and age for logging."""
    status: CacheStatus
    articles: list[dict]
    age_seconds: float


@dataclass
class CacheEntry:
    articles: list[dict]       # Normalized article dicts from a single source
    fetched_at: datetime       # When these articles were fetched
    ttl_minutes: int           # How long they're considered fresh

    @property
    def is_fresh(self) -> bool:
        """True if this entry has not expired."""
        return _now() < self.fetched_at + timedelta(minutes=self.ttl_minutes)

    @property
    def age_seconds(self) -> float:
        """How old this entry is, in seconds."""
        return (_now() - self.fetched_at).total_seconds()


# Module-level cache — shared across all requests within the process
_cache: dict[str, CacheEntry] = {}

# Per-source refreshing flag — prevents stacking background refreshes
_refreshing: set[str] = set()

# SWR stale window multiplier — serve stale data up to this many times the TTL
_SWR_MULTIPLIER = 4  # e.g., 15min TTL × 4 = stale data usable for up to 60min


def get(source_id: str) -> list[dict] | None:
    """Return cached articles if fresh, None if stale or missing.

    Original behavior — used by reader.py and anywhere that doesn't need SWR.
    """
    entry = _cache.get(source_id)
    if entry and entry.is_fresh:
        return entry.articles
    return None


def get_swr(source_id: str) -> CacheResult:
    """Return cached articles with SWR status.

    - HIT: data is fresh (within TTL)
    - STALE: data exists but expired (within SWR window) — usable, should refresh
    - MISS: no data or data too old (beyond SWR window) — must fetch
    """
    entry = _cache.get(source_id)
    if entry is None:
        return CacheResult(status=CacheStatus.MISS, articles=[], age_seconds=0)

    if entry.is_fresh:
        return CacheResult(
            status=CacheStatus.HIT,
            articles=entry.articles,
            age_seconds=entry.age_seconds,
        )

    # Check if within the SWR window (up to _SWR_MULTIPLIER × TTL)
    swr_limit = entry.fetched_at + timedelta(minutes=entry.ttl_minutes * _SWR_MULTIPLIER)
    if _now() < swr_limit:
        return CacheResult(
            status=CacheStatus.STALE,
            articles=entry.articles,
            age_seconds=entry.age_seconds,
        )

    # Beyond SWR window — treat as miss
    return CacheResult(status=CacheStatus.MISS, articles=[], age_seconds=entry.age_seconds)


def set(source_id: str, articles: list[dict], ttl_minutes: int) -> None:
    """Cache articles for a source. Overwrites any existing entry."""
    _cache[source_id] = CacheEntry(
        articles=articles,
        fetched_at=_now(),
        ttl_minutes=ttl_minutes,
    )


def is_refreshing(source_id: str) -> bool:
    """Check if a background refresh is already running for this source."""
    return source_id in _refreshing


def set_refreshing(source_id: str) -> None:
    """Mark a source as currently being refreshed in the background."""
    _refreshing.add(source_id)


def clear_refreshing(source_id: str) -> None:
    """Clear the refreshing flag for a source."""
    _refreshing.discard(source_id)


def clear() -> None:
    """Clear entire cache. Useful for testing."""
    _cache.clear()
    _refreshing.clear()


def stats() -> dict:
    """Return cache stats for debugging/monitoring."""
    entries = {}
    for source_id, entry in _cache.items():
        entries[source_id] = {
            "article_count": len(entry.articles),
            "fetched_at": entry.fetched_at.isoformat(),
            "ttl_minutes": entry.ttl_minutes,
            "is_fresh": entry.is_fresh,
            "age_seconds": round(entry.age_seconds),
        }
    return {
        "sources_cached": len(_cache),
        "sources_refreshing": list(_refreshing),
        "entries": entries,
    }
