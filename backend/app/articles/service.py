"""Article service — orchestrates cache checks, fetching, and merging."""

import asyncio
import logging

import httpx

from app import cache
from app.sources.registry import SourceConfig, get_sources_by_category, get_source_by_id
from app.sources.rss_fetcher import fetch_rss

logger = logging.getLogger(__name__)

# Shared httpx client — set by app lifespan
_http_client: httpx.AsyncClient | None = None


def set_http_client(client: httpx.AsyncClient) -> None:
    global _http_client
    _http_client = client


def get_http_client() -> httpx.AsyncClient:
    if _http_client is None:
        raise RuntimeError("HTTP client not initialized")
    return _http_client


async def _fetch_source(source: SourceConfig) -> list[dict]:
    """Fetch articles from a single source based on its type."""
    client = get_http_client()

    if source.type == "rss":
        return await fetch_rss(source, client)
    elif source.type == "news_api":
        # TODO: implement news API fetcher
        logger.info("News API fetcher not yet implemented, skipping %s", source.name)
        return []
    elif source.type == "financial_api":
        # TODO: implement financial API fetcher
        logger.info("Financial API fetcher not yet implemented, skipping %s", source.name)
        return []
    else:
        logger.warning("Unknown source type '%s' for %s", source.type, source.name)
        return []


async def get_articles(
    category: str = "all",
    source_id: str | None = None,
) -> list[dict]:
    """Get articles for a category, using cache where fresh and fetching where stale.

    Returns a merged list of articles from all relevant sources, sorted by published_at desc.
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

    # Check cache for each source
    for source in sources:
        cached = cache.get(source.id)
        if cached is not None:
            logger.debug("Cache hit for %s (%d articles)", source.name, len(cached))
            all_articles.extend(cached)
        else:
            sources_to_fetch.append(source)

    # Fetch stale/missing sources concurrently
    if sources_to_fetch:
        tasks = [_fetch_source(s) for s in sources_to_fetch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for source, result in zip(sources_to_fetch, results):
            if isinstance(result, Exception):
                logger.warning("Unexpected error fetching %s: %s", source.name, str(result))
                continue
            cache.set(source.id, result, source.cache_ttl_minutes)
            all_articles.extend(result)

    # Sort by published_at descending (None dates sort to the end)
    all_articles.sort(
        key=lambda a: a.get("published_at") or "",
        reverse=True,
    )

    return all_articles
