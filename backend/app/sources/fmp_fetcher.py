"""
FMP (Financial Modeling Prep) fetcher — fetches financial news and market analysis.

Supports two FMP endpoints:
- /stable/news/general-latest — aggregated financial news (WSJ, CNBC, Bloomberg, etc.)
- /stable/fmp-articles — FMP's own market analysis articles

Both endpoints return JSON arrays. The API key is appended as a query parameter.
Articles are normalized into the same dict format as RSS articles.
"""

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from app.sources.registry import SourceConfig
from app.sources.rss_fetcher import strip_html

logger = logging.getLogger(__name__)

FMP_TIMEOUT = 10.0


def _parse_fmp_date(date_str: str | None) -> datetime | None:
    """Parse FMP date format: '2026-02-10 21:02:00' → datetime."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _normalize_general_news(item: dict, source: SourceConfig) -> dict | None:
    """Normalize a general news item into the common article dict.

    General news fields: symbol, publishedDate, publisher, title, image, site, text, url
    """
    title = item.get("title")
    url = item.get("url")
    if not title or not url:
        return None

    return {
        "title": title,
        "summary": item.get("text"),
        "url": url,
        "image_url": item.get("image"),
        "source_id": source.id,
        "source_name": source.name,
        "source_type": source.type,
        "category": source.category,
        "sentiment": None,
        "published_at": _parse_fmp_date(item.get("publishedDate")),
    }


def _normalize_fmp_article(item: dict, source: SourceConfig) -> dict | None:
    """Normalize an FMP article into the common article dict.

    FMP article fields: title, date, content (HTML), tickers, image, link, author, site
    """
    title = item.get("title")
    url = item.get("link")
    if not title or not url:
        return None

    # Content is HTML — strip to plain text and truncate for summary
    raw_content = item.get("content", "")
    summary = strip_html(raw_content)
    if summary and len(summary) > 500:
        summary = summary[:497] + "..."

    return {
        "title": title,
        "summary": summary,
        "url": url,
        "image_url": item.get("image"),
        "source_id": source.id,
        "source_name": source.name,
        "source_type": source.type,
        "category": source.category,
        "sentiment": None,
        "published_at": _parse_fmp_date(item.get("date")),
    }


async def fetch_fmp(source: SourceConfig, client: httpx.AsyncClient) -> list[dict]:
    """Fetch articles from an FMP API endpoint.

    Reads the API key from the env var specified in source.api_key_env,
    appends it to the source URL, fetches and normalizes the response.

    Returns an empty list on any failure (never raises).
    """
    start = time.monotonic()

    # Get API key from environment
    from app.config import settings
    api_key = getattr(settings, (source.api_key_env or "").lower(), "") or os.environ.get(source.api_key_env or "", "")
    if not api_key:
        logger.warning("No API key for %s (env var: %s)", source.name, source.api_key_env)
        return []

    # Append API key to URL
    separator = "&" if "?" in source.url else "?"
    url = f"{source.url}{separator}apikey={api_key}"

    # Fetch
    try:
        response = await client.get(url, timeout=FMP_TIMEOUT)
        response.raise_for_status()
    except httpx.TimeoutException:
        logger.warning("Timeout fetching %s", source.name)
        return []
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            logger.warning("FMP rate limit exceeded for %s", source.name)
        else:
            logger.warning("HTTP %d fetching %s", e.response.status_code, source.name)
        return []
    except httpx.HTTPError as e:
        logger.warning("Network error fetching %s: %s", source.name, str(e))
        return []

    # Parse JSON response
    try:
        data = response.json()
    except Exception:
        logger.warning("Invalid JSON from %s", source.name)
        return []

    if not isinstance(data, list):
        logger.warning("Unexpected response format from %s (expected list)", source.name)
        return []

    # Determine which normalizer to use based on the endpoint
    is_fmp_articles = "fmp-articles" in source.url
    normalizer = _normalize_fmp_article if is_fmp_articles else _normalize_general_news

    # Normalize each item
    articles = []
    for item in data:
        try:
            article = normalizer(item, source)
            if article:
                articles.append(article)
        except Exception as e:
            logger.warning("Error normalizing item from %s: %s", source.name, str(e))
            continue

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info("Fetched %d articles from %s in %dms", len(articles), source.name, duration_ms)

    return articles
