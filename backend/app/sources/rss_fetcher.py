"""
RSS feed fetcher — fetches and normalizes RSS feeds into common article dicts.

This is the core data pipeline for RSS sources. It:
1. Fetches raw XML via httpx (async, with timeout)
2. Parses with feedparser (sync — just string parsing, no network)
3. Normalizes each entry into a common dict format

Normalization handles field variations across feeds:
- Images: tries media:content → media:thumbnail → enclosures → <img> in HTML
- Dates: tries published_parsed → updated_parsed → raw date string
- Summaries: strips HTML, truncates to 500 chars

Error handling is per-entry and per-feed — one bad entry or one broken feed
never crashes the entire request. Errors are logged and skipped.
"""

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

# Max time to wait for a single feed response
FEED_TIMEOUT = 10.0


# ── HTML Stripping ───────────────────────────────────────────────────────

class _HTMLTextExtractor(HTMLParser):
    """Simple HTML-to-text converter using Python's built-in parser."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def strip_html(html: str | None) -> str | None:
    """Remove HTML tags, return plain text. Returns None if input is empty."""
    if not html:
        return None
    extractor = _HTMLTextExtractor()
    try:
        extractor.feed(html)
        return extractor.get_text()
    except Exception:
        # Fallback for malformed HTML: brute-force regex strip
        return re.sub(r"<[^>]+>", "", html).strip()


# ── Field Extraction ─────────────────────────────────────────────────────
# Each function handles the variations in how RSS feeds provide a given field.

def _extract_image_url(entry: dict) -> str | None:
    """Extract an image URL from an RSS entry.

    Tries multiple strategies in priority order:
    1. media:content (RSS media extension — most reliable when present)
    2. media:thumbnail
    3. enclosures with image MIME type
    4. First <img> tag in summary or content HTML (last resort)
    """
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

    # Strategy 4: parse <img> from HTML content
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
    """Extract published date from an RSS entry.

    Tries feedparser's pre-parsed struct_time first, then falls back to
    parsing the raw date string. Returns None if no date is available.
    """
    # feedparser's normalized struct_time (handles most date formats)
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        try:
            return datetime(*parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass

    # Fallback: parse the raw date string using email.utils
    raw = entry.get("published") or entry.get("updated")
    if raw:
        try:
            return parsedate_to_datetime(raw)
        except Exception:
            pass

    return None


def _extract_summary(entry: dict) -> str | None:
    """Extract a clean text summary from an RSS entry.

    Prefers entry.summary, falls back to content[0].value.
    Strips HTML and truncates to 500 characters.
    """
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
    """Normalize a single feedparser entry into the common article dict.

    Returns None if the entry is missing required fields (title or link).
    Source metadata (id, name, type, category) comes from the SourceConfig,
    not from the feed entry itself.
    """
    title = entry.get("title")
    url = entry.get("link")

    # Title and URL are required — skip entries without them
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
        "sentiment": None,  # RSS feeds don't provide sentiment — only API sources do
        "published_at": _parse_published_date(entry),
    }


# ── Main Fetch Function ─────────────────────────────────────────────────

async def fetch_rss(source: SourceConfig, client: httpx.AsyncClient) -> list[dict]:
    """Fetch an RSS feed and return a list of normalized article dicts.

    This function never raises exceptions — it returns an empty list on failure
    and logs the error. This ensures one broken feed doesn't affect other sources.

    Args:
        source: Source configuration from the registry
        client: Shared httpx async client (connection pooling)

    Returns:
        List of normalized article dicts, or empty list on failure
    """
    start = time.monotonic()

    # Step 1: Fetch raw XML (async, with timeout)
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

    # Step 2: Parse with feedparser (sync — just string parsing, fast)
    feed = feedparser.parse(response.text)

    # feedparser sets bozo=True for malformed XML, but often still parses partial data
    if feed.bozo and not feed.entries:
        logger.warning("Malformed feed from %s: %s", source.name, feed.bozo_exception)
        return []

    # Step 3: Normalize each entry (skip individual entries that fail)
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
