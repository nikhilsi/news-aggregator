"""
Article service — orchestrates cache checks, fetching, and merging.

This is the main business logic layer for articles. It:
1. Determines which sources to query (based on category or source_id)
2. Checks the in-memory cache for each source
3. Fetches stale/missing sources concurrently via asyncio.gather
4. Caches fresh results
5. Merges and sorts articles from all sources

The service does NOT know how to fetch from any specific source type —
it delegates to the appropriate fetcher (rss_fetcher, etc.) based on source.type.
"""

import asyncio
import logging

import httpx

from app import cache
from app.sources.registry import SourceConfig, get_sources_by_category, get_source_by_id
from app.sources.rss_fetcher import fetch_rss

logger = logging.getLogger(__name__)

# Shared httpx client — created in app lifespan, used by all fetchers
_http_client: httpx.AsyncClient | None = None


def set_http_client(client: httpx.AsyncClient) -> None:
    """Set the shared HTTP client. Called once during app startup."""
    global _http_client
    _http_client = client


def get_http_client() -> httpx.AsyncClient:
    """Get the shared HTTP client. Raises if not initialized."""
    if _http_client is None:
        raise RuntimeError("HTTP client not initialized — app lifespan not started")
    return _http_client


async def _fetch_source(source: SourceConfig) -> list[dict]:
    """Fetch articles from a single source, delegating to the appropriate fetcher."""
    client = get_http_client()

    if source.type == "rss":
        return await fetch_rss(source, client)
    elif source.type == "news_api":
        # TODO: implement news_api_fetcher.py
        logger.info("News API fetcher not yet implemented, skipping %s", source.name)
        return []
    elif source.type == "financial_api":
        # TODO: implement finance_fetcher.py
        logger.info("Financial API fetcher not yet implemented, skipping %s", source.name)
        return []
    else:
        logger.warning("Unknown source type '%s' for %s", source.type, source.name)
        return []


async def get_articles(
    category: str = "all",
    source_id: str | None = None,
) -> list[dict]:
    """Get articles for a category or specific source.

    Uses cache where fresh, fetches where stale. Multiple stale sources
    are fetched concurrently. Returns a merged list sorted by published_at desc.

    Args:
        category: Category filter ("all", "science", "tech", etc.)
        source_id: Optional — filter to a single source by ID

    Returns:
        Sorted list of article dicts from all relevant sources
    """
    # Determine which sources to query
    if source_id:
        source = get_source_by_id(source_id)
        if not source or not source.enabled:
            return []
        sources = [source]
    else:
        sources = get_sources_by_category(category)

    if not sources:
        return []

    all_articles: list[dict] = []
    sources_to_fetch: list[SourceConfig] = []

    # Check cache for each source individually
    for source in sources:
        cached = cache.get(source.id)
        if cached is not None:
            logger.debug("Cache hit for %s (%d articles)", source.name, len(cached))
            all_articles.extend(cached)
        else:
            sources_to_fetch.append(source)

    # Fetch all stale/missing sources concurrently
    if sources_to_fetch:
        tasks = [_fetch_source(s) for s in sources_to_fetch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for source, result in zip(sources_to_fetch, results):
            if isinstance(result, Exception):
                # Log but don't crash — other sources still return data
                logger.warning("Unexpected error fetching %s: %s", source.name, str(result))
                continue
            cache.set(source.id, result, source.cache_ttl_minutes)
            all_articles.extend(result)

    # Sort by published_at descending — most recent first
    # Articles without a published_at (None) sort to the end
    all_articles.sort(
        key=lambda a: a.get("published_at") or "",
        reverse=True,
    )

    return all_articles
