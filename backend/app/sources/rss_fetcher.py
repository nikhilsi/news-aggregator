"""RSS feed fetcher — fetches and normalizes RSS feeds into common article dicts."""

import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

import feedparser
import httpx

from app.sources.registry import SourceConfig

logger = logging.getLogger(__name__)

# Timeout for fetching a single feed
FEED_TIMEOUT = 10.0


class _HTMLTextExtractor(HTMLParser):
    """Strip HTML tags, keep text content."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def strip_html(html: str | None) -> str | None:
    """Remove HTML tags, return plain text."""
    if not html:
        return None
    extractor = _HTMLTextExtractor()
    try:
        extractor.feed(html)
        return extractor.get_text()
    except Exception:
        # Fallback: regex strip
        return re.sub(r"<[^>]+>", "", html).strip()


def _extract_image_url(entry: dict) -> str | None:
    """Try to extract an image URL from an RSS entry using multiple strategies."""
    # Strategy 1: media:content
    media = entry.get("media_content")
    if media:
        for m in media:
            url = m.get("url", "")
            media_type = m.get("type", "")
            if url and ("image" in media_type or not media_type):
                return url

    # Strategy 2: media:thumbnail
    thumbs = entry.get("media_thumbnail")
    if thumbs:
        for t in thumbs:
            url = t.get("url", "")
            if url:
                return url

    # Strategy 3: enclosures
    enclosures = entry.get("enclosures")
    if enclosures:
        for enc in enclosures:
            if "image" in enc.get("type", ""):
                return enc.get("href") or enc.get("url")

    # Strategy 4: first <img> in summary or content HTML
    for field in ["summary", "content"]:
        html = ""
        if field == "content":
            content_list = entry.get("content")
            if content_list and len(content_list) > 0:
                html = content_list[0].get("value", "")
        else:
            html = entry.get(field, "")

        if html:
            match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html)
            if match:
                return match.group(1)

    return None


def _parse_published_date(entry: dict) -> datetime | None:
    """Extract published date from an RSS entry."""
    # Strategy 1: published_parsed (feedparser's normalized struct_time)
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        try:
            return datetime(*parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass

    # Strategy 2: raw date string
    raw = entry.get("published") or entry.get("updated")
    if raw:
        try:
            return parsedate_to_datetime(raw)
        except Exception:
            pass

    return None


def _extract_summary(entry: dict) -> str | None:
    """Extract a clean text summary from an RSS entry."""
    # Prefer summary, fall back to content
    raw = entry.get("summary")
    if not raw:
        content_list = entry.get("content")
        if content_list and len(content_list) > 0:
            raw = content_list[0].get("value", "")

    text = strip_html(raw)
    if text and len(text) > 500:
        text = text[:497] + "..."
    return text


def _normalize_entry(entry: dict, source: SourceConfig) -> dict | None:
    """Normalize a single feedparser entry into our common article dict.

    Returns None if the entry is missing required fields (title, link).
    """
    title = entry.get("title")
    url = entry.get("link")

    if not title or not url:
        logger.warning("Skipping entry from %s: missing title or link", source.name)
        return None

    return {
        "title": strip_html(title) or title,
        "summary": _extract_summary(entry),
        "url": url,
        "image_url": _extract_image_url(entry),
        "source_id": source.id,
        "source_name": source.name,
        "source_type": source.type,
        "category": source.category,
        "sentiment": None,
        "published_at": _parse_published_date(entry),
    }


async def fetch_rss(source: SourceConfig, client: httpx.AsyncClient) -> list[dict]:
    """Fetch an RSS feed and return a list of normalized article dicts.

    Never raises — returns an empty list on failure.
    """
    start = time.monotonic()

    try:
        response = await client.get(source.url, timeout=FEED_TIMEOUT)
        response.raise_for_status()
    except httpx.TimeoutException:
        logger.warning("Timeout fetching %s (%s)", source.name, source.url)
        return []
    except httpx.HTTPStatusError as e:
        logger.warning("HTTP %d fetching %s: %s", e.response.status_code, source.name, source.url)
        return []
    except httpx.HTTPError as e:
        logger.warning("Network error fetching %s: %s", source.name, str(e))
        return []

    # Parse the raw XML (no network call — feedparser just parses the string)
    feed = feedparser.parse(response.text)

    if feed.bozo and not feed.entries:
        logger.warning("Malformed feed from %s: %s", source.name, feed.bozo_exception)
        return []

    articles = []
    for entry in feed.entries:
        try:
            article = _normalize_entry(entry, source)
            if article:
                articles.append(article)
        except Exception as e:
            logger.warning("Error normalizing entry from %s: %s", source.name, str(e))
            continue

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info("Fetched %d articles from %s in %dms", len(articles), source.name, duration_ms)

    return articles
