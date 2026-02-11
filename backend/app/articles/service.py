"""
Article service — orchestrates cache checks, fetching, and merging.

This is the main business logic layer for articles. It:
1. Determines which sources to query (based on category or source_id)
2. Checks the in-memory cache for each source
3. Fetches stale/missing sources concurrently via asyncio.gather
4. Caches fresh results
5. Deduplicates articles (URL exact match + title keyword overlap)
6. Merges and sorts articles from all sources

The service does NOT know how to fetch from any specific source type —
it delegates to the appropriate fetcher (rss_fetcher, etc.) based on source.type.
"""

import asyncio
import logging
import re

import httpx

from app import cache
from app.sources.registry import SourceConfig, get_sources_by_category, get_source_by_id
from app.sources.rss_fetcher import fetch_rss
from app.sources.fmp_fetcher import fetch_fmp

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
        return await fetch_fmp(source, client)
    else:
        logger.warning("Unknown source type '%s' for %s", source.type, source.name)
        return []


# ── Deduplication ────────────────────────────────────────────────────────
# Two layers:
# 1. URL exact match — same article from multiple sources (e.g., Ars Technica
#    direct feed + Google News both resolve to the same URL)
# 2. Title keyword overlap — same story covered by different outlets
#    (e.g., Samsung Unpacked from The Verge, Engadget, and Google News)
#
# When two articles are considered duplicates, we keep the "better" one:
# prefer articles with images, prefer direct feeds over Google News.

# Words too common to be meaningful for title comparison
_STOP_WORDS = frozenset({
    "the", "is", "are", "was", "were", "be", "been", "have", "has", "had",
    "do", "does", "did", "will", "would", "shall", "should", "may", "might",
    "can", "could", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "and", "but", "or",
    "if", "not", "no", "its", "it", "this", "that", "an", "up", "so", "than",
    "new", "says", "how", "why", "what", "who", "when", "where", "about",
})

# Minimum keyword overlap ratio to consider two titles as covering the same story
_TITLE_OVERLAP_THRESHOLD = 0.6


def _title_keywords(title: str) -> set[str]:
    """Extract significant keywords from a title for dedup comparison."""
    t = title.lower().replace("'s ", " ").replace("'s", "")
    words = re.findall(r"[a-z0-9]+", t)
    return {w for w in words if w not in _STOP_WORDS and len(w) > 2}


def _titles_match(kw1: set[str], kw2: set[str]) -> bool:
    """Check if two sets of title keywords overlap enough to be the same story."""
    if not kw1 or not kw2:
        return False
    overlap = len(kw1 & kw2)
    smaller = min(len(kw1), len(kw2))
    return (overlap / smaller) >= _TITLE_OVERLAP_THRESHOLD


def _article_priority(article: dict) -> tuple:
    """Score an article for dedup priority. Higher = better to keep.

    Prefers: has image > no image, direct feed > Google News.
    """
    has_image = 1 if article.get("image_url") else 0
    is_direct = 0 if "Google News" in article.get("source_name", "") else 1
    return (is_direct, has_image)


def _deduplicate(articles: list[dict]) -> list[dict]:
    """Remove duplicate articles using URL match and title keyword overlap.

    Keeps the higher-priority version of each duplicate pair.
    """
    if not articles:
        return articles

    # Index: URL → best article seen so far
    url_seen: dict[str, dict] = {}
    # Index: list of (keywords, article) for title comparison
    title_index: list[tuple[set[str], dict]] = []
    kept: list[dict] = []
    removed = 0

    for article in articles:
        url = article.get("url", "")
        priority = _article_priority(article)

        # Layer 1: URL exact match
        if url in url_seen:
            existing = url_seen[url]
            if priority > _article_priority(existing):
                # New article is better — swap
                kept.remove(existing)
                url_seen[url] = article
                # Also update title_index
                title_index = [(kw, a) for kw, a in title_index if a is not existing]
                keywords = _title_keywords(article.get("title", ""))
                title_index.append((keywords, article))
                kept.append(article)
            removed += 1
            continue

        # Layer 2: Title keyword overlap
        keywords = _title_keywords(article.get("title", ""))
        is_dupe = False
        for existing_kw, existing_article in title_index:
            if _titles_match(keywords, existing_kw):
                # Found a title match — keep the better one
                if priority > _article_priority(existing_article):
                    kept.remove(existing_article)
                    title_index.remove((existing_kw, existing_article))
                    url_seen.pop(existing_article.get("url", ""), None)
                    # Add the new article instead
                    url_seen[url] = article
                    title_index.append((keywords, article))
                    kept.append(article)
                removed += 1
                is_dupe = True
                break

        if not is_dupe:
            url_seen[url] = article
            title_index.append((keywords, article))
            kept.append(article)

    if removed:
        logger.info("Dedup: removed %d duplicates, %d → %d articles", removed, len(articles), len(kept))

    return kept


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

    # Deduplicate before sorting
    all_articles = _deduplicate(all_articles)

    # Sort by published_at descending — most recent first
    # Articles without a published_at (None) sort to the end
    all_articles.sort(
        key=lambda a: a.get("published_at") or "",
        reverse=True,
    )

    return all_articles
