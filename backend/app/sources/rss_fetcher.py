"""
RSS feed fetcher — fetches and normalizes RSS feeds into common article dicts.

This is the core data pipeline for RSS sources. It:
1. Fetches raw XML via httpx (async, with timeout)
2. Parses with feedparser (sync — just string parsing, no network)
3. Normalizes each entry into a common dict format
4. Resolves Google News redirect URLs to real article URLs
5. Backfills missing images via og:image from article pages

Normalization handles field variations across feeds:
- Images: tries media:content → media:thumbnail → enclosures → <img> in HTML
- Dates: tries published_parsed → updated_parsed → raw date string
- Summaries: strips HTML, truncates to 500 chars

Error handling is per-entry and per-feed — one bad entry or one broken feed
never crashes the entire request. Errors are logged and skipped.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import quote, urlparse

import asyncio

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


# ── og:image Fallback ───────────────────────────────────────────────────

# Max bytes to read from an article page when looking for og:image.
# The meta tag is always in <head>, so 15KB is more than enough.
OG_IMAGE_READ_LIMIT = 15_000
OG_IMAGE_TIMEOUT = 5.0

async def _fetch_og_image(url: str, client: httpx.AsyncClient) -> str | None:
    """Fetch the og:image meta tag from an article's page.

    Only reads the first ~15KB of the page (enough to get <head> content).
    Returns None on any error — this is a best-effort fallback.
    """
    try:
        response = await client.get(url, timeout=OG_IMAGE_TIMEOUT)
        # Only read the first chunk — og:image is always in <head>
        html = response.text[:OG_IMAGE_READ_LIMIT]
        match = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            html,
        )
        if match:
            return match.group(1)
        # Also try reversed attribute order (content before property)
        match = re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            html,
        )
        if match:
            return match.group(1)
    except Exception:
        pass
    return None


async def _backfill_missing_images(
    articles: list[dict], client: httpx.AsyncClient
) -> None:
    """For articles with no image, try to fetch og:image from the article page.

    Modifies articles in place. Fetches concurrently for performance.
    """
    missing = [(i, a) for i, a in enumerate(articles) if not a.get("image_url")]
    if not missing:
        return

    tasks = [_fetch_og_image(a["url"], client) for _, a in missing]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    found = 0
    for (idx, _), result in zip(missing, results):
        if isinstance(result, str) and result:
            articles[idx]["image_url"] = result
            found += 1

    if found:
        logger.debug("Backfilled %d/%d missing images via og:image", found, len(missing))


# ── Google News URL Resolver ────────────────────────────────────────────
# Google News RSS feeds provide opaque redirect URLs (news.google.com/rss/articles/...)
# instead of real article URLs. The real URL is encoded in a protobuf/base64 blob.
# Newer URLs (post-July 2024) can't be decoded offline — they require two HTTP calls
# to Google's batchexecute API: one to get a signature+timestamp, one to decode.
#
# We resolve these at fetch time so the cache stores final, ready-to-serve data.
# This also lets the og:image backfill work, since it needs real article URLs.

GNEWS_DECODE_TIMEOUT = 8.0

# Limit concurrent requests to Google to avoid rate limiting.
# All 5 Google News sources resolve URLs simultaneously — without a limit,
# that's ~350 concurrent requests. Cap at 10 to be respectful.
_gnews_semaphore = asyncio.Semaphore(10)


def _is_google_news_url(url: str) -> bool:
    """Check if a URL is a Google News redirect."""
    return "news.google.com/" in url


async def _resolve_single_google_url(
    article_url: str, client: httpx.AsyncClient
) -> str | None:
    """Resolve a single Google News redirect URL to the real article URL.

    Makes two HTTP calls to Google:
    1. Fetch the article page to extract signature + timestamp
    2. POST to batchexecute API with those params to get the decoded URL

    Uses a shared semaphore to limit concurrent requests to Google.
    Returns the decoded URL, or None on any failure.
    """
    async with _gnews_semaphore:
        parsed = urlparse(article_url)
        base64_str = parsed.path.split("/")[-1]

        # Step 1: Fetch article page to get decoding params
        try:
            resp = await client.get(article_url, follow_redirects=True, timeout=GNEWS_DECODE_TIMEOUT)
        except Exception:
            return None

        sig_match = re.search(r'data-n-a-sg="([^"]+)"', resp.text)
        ts_match = re.search(r'data-n-a-ts="([^"]+)"', resp.text)
        if not sig_match or not ts_match:
            return None

        signature = sig_match.group(1)
        timestamp = ts_match.group(1)

        # Step 2: Decode via batchexecute API
        try:
            payload = [
                "Fbv4je",
                f'["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{base64_str}",{timestamp},"{signature}"]',
            ]
            resp2 = await client.post(
                "https://news.google.com/_/DotsSplashUi/data/batchexecute",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                },
                data=f"f.req={quote(json.dumps([[payload]]))}",
                timeout=GNEWS_DECODE_TIMEOUT,
            )
            parsed_data = json.loads(resp2.text.split("\n\n")[1])[:-2]
            decoded_url = json.loads(parsed_data[0][2])[1]
            return decoded_url
        except Exception:
            return None


async def _resolve_google_news_urls(
    articles: list[dict], client: httpx.AsyncClient
) -> None:
    """Resolve Google News redirect URLs to real article URLs.

    Modifies articles in place. Runs concurrently for performance.
    Only processes articles whose URL is a Google News redirect.
    """
    google_articles = [
        (i, a) for i, a in enumerate(articles) if _is_google_news_url(a.get("url", ""))
    ]
    if not google_articles:
        return

    tasks = [_resolve_single_google_url(a["url"], client) for _, a in google_articles]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    resolved = 0
    for (idx, _), result in zip(google_articles, results):
        if isinstance(result, str) and result:
            articles[idx]["url"] = result
            resolved += 1

    logger.info(
        "Resolved %d/%d Google News URLs to real article URLs",
        resolved,
        len(google_articles),
    )


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

    # Step 2: Parse with feedparser (CPU-bound — offload to thread pool)
    feed = await asyncio.to_thread(feedparser.parse, response.text)

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

    # Step 4: Resolve Google News redirect URLs to real article URLs
    # Must happen before og:image backfill — og:image needs real URLs to work.
    await _resolve_google_news_urls(articles, client)

    # Step 5: Backfill missing images by fetching og:image from article pages
    await _backfill_missing_images(articles, client)

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info("Fetched %d articles from %s in %dms", len(articles), source.name, duration_ms)

    return articles
