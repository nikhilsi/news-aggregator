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
import time

import httpx

from app import cache
from app.cache import CacheStatus
from app.sources.registry import SourceConfig, get_sources_by_category, get_source_by_id, get_enabled_sources
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
    Uses a set for O(1) membership checks instead of O(n) list.remove().

    Title comparison is bucketed by category — articles in different categories
    are never title-duplicates (e.g., India Today won't dupe CBS Sports).
    URL dedup remains global (same URL can appear in any category).
    """
    if not articles:
        return articles

    # Index: URL → best article seen so far (global — cross-category)
    url_seen: dict[str, dict] = {}
    # Per-category title index — only compare titles within the same category
    cat_title_index: dict[str, list[tuple[set[str], dict]]] = {}
    # Track removed articles by id() for O(1) discard instead of O(n) list.remove()
    removed_ids: set[int] = set()
    kept: list[dict] = []
    removed = 0

    for article in articles:
        url = article.get("url", "")
        cat = article.get("category", "")
        priority = _article_priority(article)

        # Layer 1: URL exact match (global)
        if url in url_seen:
            existing = url_seen[url]
            if priority > _article_priority(existing):
                # New article is better — mark old as removed, replace
                removed_ids.add(id(existing))
                url_seen[url] = article
                keywords = _title_keywords(article.get("title", ""))
                cat_title_index.setdefault(cat, []).append((keywords, article))
                kept.append(article)
            removed += 1
            continue

        # Layer 2: Title keyword overlap (within category only)
        keywords = _title_keywords(article.get("title", ""))
        bucket = cat_title_index.get(cat, [])
        is_dupe = False
        for existing_kw, existing_article in bucket:
            if id(existing_article) in removed_ids:
                continue
            if _titles_match(keywords, existing_kw):
                # Found a title match — keep the better one
                if priority > _article_priority(existing_article):
                    removed_ids.add(id(existing_article))
                    url_seen.pop(existing_article.get("url", ""), None)
                    url_seen[url] = article
                    cat_title_index.setdefault(cat, []).append((keywords, article))
                    kept.append(article)
                removed += 1
                is_dupe = True
                break

        if not is_dupe:
            url_seen[url] = article
            cat_title_index.setdefault(cat, []).append((keywords, article))
            kept.append(article)

    # Filter out removed articles in one pass
    if removed_ids:
        kept = [a for a in kept if id(a) not in removed_ids]

    if removed:
        logger.info("Dedup: removed %d duplicates, %d → %d articles", removed, len(articles), len(kept))

    return kept


def _pub_key(article: dict) -> str:
    """Sort key: published_at descending. Articles without a date sort to the end."""
    return article.get("published_at") or ""


def _tiered_sort(articles: list[dict], category: str) -> list[dict]:
    """Two-tier sort: diverse top section, then everything else chronologically.

    "All" tab: tier 1 = 1 most recent per source, capped at 3 per category.
    Category tabs: tier 1 = top 5 per source.
    Tier 2 = remaining articles sorted by published_at descending.
    """
    if not articles:
        return articles

    # Sort all articles by time first so "top N" picks are most recent
    articles.sort(key=_pub_key, reverse=True)

    tier1_set: set[int] = set()  # track by id() for O(1) lookup

    if category == "all":
        # Step 1: pick 1 most recent per source
        seen_sources: dict[str, dict] = {}
        for a in articles:
            sid = a.get("source_id", "")
            if sid not in seen_sources:
                seen_sources[sid] = a

        # Step 2: cap at 3 per category from that pool
        cat_counts: dict[str, int] = {}
        for a in seen_sources.values():
            cat = a.get("category", "")
            if cat_counts.get(cat, 0) < 3:
                cat_counts[cat] = cat_counts.get(cat, 0) + 1
                tier1_set.add(id(a))
    else:
        # Category tab: top 5 per source
        source_counts: dict[str, int] = {}
        for a in articles:
            sid = a.get("source_id", "")
            if source_counts.get(sid, 0) < 5:
                source_counts[sid] = source_counts.get(sid, 0) + 1
                tier1_set.add(id(a))

    # Build tier 1 and tier 2 in one pass (articles already sorted by time)
    tier1 = [a for a in articles if id(a) in tier1_set]
    tier2 = [a for a in articles if id(a) not in tier1_set]

    return tier1 + tier2


async def _fetch_and_cache_sources(sources: list[SourceConfig]) -> list[dict]:
    """Fetch a list of sources concurrently and cache results. Returns all fetched articles."""
    if not sources:
        return []

    fetch_names = [s.name for s in sources]
    logger.info("Fetching %d sources: %s", len(sources), ", ".join(fetch_names))
    fetch_start = time.monotonic()

    tasks = [_fetch_source(s) for s in sources]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    fetch_duration_ms = int((time.monotonic() - fetch_start) * 1000)
    all_fetched: list[dict] = []
    total_fetched = 0

    for source, result in zip(sources, results):
        if isinstance(result, Exception):
            logger.warning("Unexpected error fetching %s: %s", source.name, str(result))
            continue
        cache.set(source.id, result, source.cache_ttl_minutes)
        all_fetched.extend(result)
        total_fetched += len(result)

    logger.info(
        "Sources fetched: %d sources, %d articles, %dms",
        len(sources), total_fetched, fetch_duration_ms,
    )
    return all_fetched


async def _background_refresh(sources: list[SourceConfig]) -> None:
    """Background task: refresh stale sources and update cache.

    Fire-and-forget — catches all errors to avoid crashing the event loop.
    """
    source_names = [s.name for s in sources]
    logger.info("Background refresh started for %d sources: %s", len(sources), ", ".join(source_names))

    try:
        await _fetch_and_cache_sources(sources)
        logger.info("Background refresh completed for %d sources", len(sources))
    except Exception as e:
        logger.error("Background refresh failed: %s", str(e))
    finally:
        for source in sources:
            cache.clear_refreshing(source.id)


# ── Progressive / deadline-based fetching ─────────────────────────────────
# On cold cache, instead of blocking until all 41 sources return (~10s),
# wait up to a deadline and return whatever is ready. Remaining sources
# continue fetching in the background and get cached for the next request.

_COLD_FETCH_DEADLINE = 3.0  # seconds — ~15-20 sources complete within this window


async def _complete_pending_fetches(
    pending_tasks: set[asyncio.Task],
    task_to_source: dict[asyncio.Task, SourceConfig],
) -> None:
    """Background: await remaining fetch tasks and cache their results.

    Fire-and-forget — catches all errors to avoid crashing the event loop.
    """
    try:
        done, _ = await asyncio.wait(pending_tasks)
        total = 0
        for task in done:
            source = task_to_source[task]
            try:
                result = task.result()
                cache.set(source.id, result, source.cache_ttl_minutes)
                total += len(result)
            except Exception as e:
                logger.warning("Background fetch error for %s: %s", source.name, str(e))
        logger.info("Background fetch completed: %d sources, %d articles", len(done), total)
    except Exception as e:
        logger.error("Background fetch completion failed: %s", str(e))


async def _fetch_with_deadline(
    sources: list[SourceConfig], deadline: float = _COLD_FETCH_DEADLINE
) -> tuple[list[dict], bool]:
    """Fetch sources concurrently with a deadline for progressive response.

    Returns (fetched_articles, all_complete). Sources that finish within the
    deadline are cached and their articles returned. Remaining sources continue
    fetching in a fire-and-forget background task that caches results as they
    complete — the next request picks them up from cache.
    """
    if not sources:
        return [], True

    fetch_names = [s.name for s in sources]
    logger.info("Fetching %d sources with %.0fs deadline: %s", len(sources), deadline, ", ".join(fetch_names))
    fetch_start = time.monotonic()

    # Create tasks mapped to sources
    task_to_source: dict[asyncio.Task, SourceConfig] = {}
    for source in sources:
        task = asyncio.create_task(_fetch_source(source))
        task_to_source[task] = source

    # Wait up to deadline
    done, pending = await asyncio.wait(task_to_source.keys(), timeout=deadline)

    fetch_duration_ms = int((time.monotonic() - fetch_start) * 1000)

    # Cache and collect completed results
    all_fetched: list[dict] = []
    total_fetched = 0
    for task in done:
        source = task_to_source[task]
        try:
            result = task.result()
        except Exception as e:
            logger.warning("Unexpected error fetching %s: %s", source.name, str(e))
            continue
        cache.set(source.id, result, source.cache_ttl_minutes)
        all_fetched.extend(result)
        total_fetched += len(result)

    all_complete = len(pending) == 0

    logger.info(
        "Deadline fetch: %d/%d sources completed, %d articles, %dms%s",
        len(done), len(sources), total_fetched, fetch_duration_ms,
        "" if all_complete else f" ({len(pending)} still pending)",
    )

    # Kick off background task to complete remaining sources
    if pending:
        asyncio.create_task(_complete_pending_fetches(pending, task_to_source))

    return all_fetched, all_complete


async def get_articles(
    category: str = "all",
    source_id: str | None = None,
    refresh: bool = False,
) -> tuple[list[dict], bool]:
    """Get articles for a category or specific source.

    Uses stale-while-revalidate (SWR) caching:
    - Fresh cache → return immediately
    - Stale cache → return stale data, kick off background refresh
    - No cache → fetch with deadline (return partial data fast, rest in background)

    Pass refresh=True to bypass cache entirely and fetch all sources fresh
    (no deadline — user explicitly requested fresh data).

    Args:
        category: Category filter ("all", "science", "tech", etc.)
        source_id: Optional — filter to a single source by ID
        refresh: Force fresh fetch, bypass SWR cache

    Returns:
        Tuple of (sorted article list, complete flag).
        complete=False means some sources are still loading in the background.
    """
    # Determine which sources to query
    if source_id:
        source = get_source_by_id(source_id)
        if not source or not source.enabled:
            return [], True
        sources = [source]
    else:
        sources = get_sources_by_category(category)

    if not sources:
        return [], True

    all_articles: list[dict] = []
    sources_to_fetch: list[SourceConfig] = []  # MISS — must fetch
    sources_to_refresh: list[SourceConfig] = []  # STALE — refresh in background
    complete = True

    if refresh:
        # Force refresh — user explicitly wants fresh data, wait for all sources
        logger.info("Force refresh requested — fetching all %d sources", len(sources))
        sources_to_fetch = list(sources)
    else:
        # Normal SWR cache check
        hits = 0
        stale = 0
        misses = 0
        for source in sources:
            result = cache.get_swr(source.id)
            if result.status == CacheStatus.HIT:
                hits += 1
                all_articles.extend(result.articles)
            elif result.status == CacheStatus.STALE:
                stale += 1
                all_articles.extend(result.articles)
                # Schedule background refresh if not already refreshing
                if not cache.is_refreshing(source.id):
                    sources_to_refresh.append(source)
            else:  # MISS
                misses += 1
                sources_to_fetch.append(source)

        logger.info(
            "Cache: %d HIT, %d STALE, %d MISS out of %d sources",
            hits, stale, misses, len(sources),
        )

        # Kick off background refresh for stale sources (fire-and-forget)
        if sources_to_refresh:
            for s in sources_to_refresh:
                cache.set_refreshing(s.id)
            refresh_names = [s.name for s in sources_to_refresh]
            logger.info("Background refresh queued for: %s", ", ".join(refresh_names))
            asyncio.create_task(_background_refresh(sources_to_refresh))

    # Fetch MISS sources
    if sources_to_fetch:
        if refresh:
            # Force refresh: wait for all sources (no deadline)
            fetched = await _fetch_and_cache_sources(sources_to_fetch)
            all_articles.extend(fetched)
        else:
            # Normal cold cache: use deadline for faster partial response
            fetched, complete = await _fetch_with_deadline(sources_to_fetch)
            all_articles.extend(fetched)

    # Deduplicate before sorting (CPU-bound — offload to thread pool)
    before_dedup = len(all_articles)
    all_articles = await asyncio.to_thread(_deduplicate, all_articles)

    # Two-tier sorting: diverse tier 1 on top, then chronological tier 2
    all_articles = _tiered_sort(all_articles, category)

    logger.info(
        "Returning %d articles (dedup removed %d)%s",
        len(all_articles), before_dedup - len(all_articles),
        "" if complete else " [partial — more sources loading in background]",
    )

    return all_articles, complete


async def warmup_cache() -> None:
    """Pre-fetch all enabled sources to warm the cache on startup.

    Called as a background task during app lifespan — does not block server startup.
    """
    sources = get_enabled_sources()
    logger.info("Cache warmup started — %d sources", len(sources))
    start = time.monotonic()

    try:
        await _fetch_and_cache_sources(sources)
    except Exception as e:
        logger.error("Cache warmup error: %s", str(e))

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info("Cache warmup completed in %dms", duration_ms)
