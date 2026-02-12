"""
Reader view — extracts clean article content from source URLs.

Uses readability-lxml (primary) with trafilatura fallback. Extracted content
is sanitized to remove scripts/iframes/forms and cached for 60 minutes.

The reader service does NOT fetch article lists — it operates on a single URL
provided by the frontend. Article metadata (title, source_name, etc.) is
looked up from the article cache when available.
"""

import asyncio
import logging
import re
import time
from datetime import datetime, timezone

import httpx
import trafilatura
from readability import Document as ReadabilityDocument

from app import cache
from app.articles.service import get_http_client

logger = logging.getLogger(__name__)

READER_CACHE_TTL_MINUTES = 60
FETCH_TIMEOUT = 15.0
MIN_WORD_COUNT = 50  # Below this, extraction is considered failed

# Tags and attributes to strip for XSS prevention
_UNSAFE_TAGS = re.compile(
    r"<\s*/?\s*(script|iframe|frame|object|embed|form|style|link|meta)\b[^>]*>",
    re.IGNORECASE | re.DOTALL,
)
_UNSAFE_TAG_BLOCKS = re.compile(
    r"<\s*(script|style)\b[^>]*>.*?</\s*\1\s*>",
    re.IGNORECASE | re.DOTALL,
)
_EVENT_HANDLERS = re.compile(r'\s+on\w+\s*=\s*"[^"]*"', re.IGNORECASE)
_EVENT_HANDLERS_SQ = re.compile(r"\s+on\w+\s*=\s*'[^']*'", re.IGNORECASE)
_JS_URLS = re.compile(r'(href|src|action)\s*=\s*"javascript:[^"]*"', re.IGNORECASE)
_JS_URLS_SQ = re.compile(r"(href|src|action)\s*=\s*'javascript:[^']*'", re.IGNORECASE)


def _sanitize_html(html: str) -> str:
    """Strip unsafe tags, event handlers, and javascript: URLs from HTML."""
    # Remove script/style block content first
    html = _UNSAFE_TAG_BLOCKS.sub("", html)
    # Remove remaining unsafe tags (self-closing or orphaned)
    html = _UNSAFE_TAGS.sub("", html)
    # Remove event handlers
    html = _EVENT_HANDLERS.sub("", html)
    html = _EVENT_HANDLERS_SQ.sub("", html)
    # Remove javascript: URLs
    html = _JS_URLS.sub("", html)
    html = _JS_URLS_SQ.sub("", html)
    return html.strip()


def _count_words(text: str) -> int:
    """Count words in plain text."""
    return len(text.split()) if text else 0


def _html_to_text(html: str) -> str:
    """Strip HTML tags to get plain text for word counting."""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def _find_article_in_cache(url: str) -> dict | None:
    """Look up article metadata from the article list cache.

    The article cache is keyed by source_id, so we scan all cached sources
    to find the article matching this URL. Returns the article dict or None.
    """
    # Access the internal cache dict directly, skip reader cache entries
    for key, entry in cache._cache.items():
        if key.startswith("reader:") or not entry.is_fresh:
            continue
        for article in entry.articles:
            if isinstance(article, dict) and article.get("url") == url:
                return article
    return None


def _extract_with_readability(html: str, url: str) -> tuple[str | None, str | None]:
    """Extract content using readability-lxml. Returns (html_content, title)."""
    try:
        doc = ReadabilityDocument(html, url=url)
        content = doc.summary()
        title = doc.short_title()
        if content:
            text = _html_to_text(content)
            if _count_words(text) >= MIN_WORD_COUNT:
                return content, title
    except Exception as e:
        logger.warning("Readability extraction failed for %s: %s", url, str(e))
    return None, None


def _extract_with_trafilatura(html: str, url: str) -> str | None:
    """Extract content using trafilatura. Returns HTML string or None."""
    try:
        result = trafilatura.extract(
            html,
            url=url,
            include_comments=False,
            include_tables=True,
            include_images=True,
            include_links=True,
            favor_recall=True,
            output_format="html",
        )
        if result and _count_words(_html_to_text(result)) >= MIN_WORD_COUNT:
            return result
    except Exception as e:
        logger.warning("Trafilatura extraction failed for %s: %s", url, str(e))
    return None


def _extract_author(html: str) -> str | None:
    """Best-effort author extraction from meta tags."""
    # Try meta author tag
    match = re.search(r'<meta\s+name="author"\s+content="([^"]+)"', html, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # Try og:article:author
    match = re.search(r'<meta\s+property="article:author"\s+content="([^"]+)"', html, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


async def extract_article_content(url: str) -> dict:
    """Extract clean article content from a URL.

    Returns a dict matching the ReaderResponse schema shape:
    - status: "ok" or "failed"
    - content_html, word_count, etc. on success
    - reason on failure

    Never raises — all errors are caught and returned as failed status.
    """
    # Check reader content cache
    cached = cache.get(f"reader:{url}")
    if cached is not None:
        logger.info("Reader cache HIT for %s", url[:80])
        return cached

    # Look up article metadata from the article list cache
    article_meta = _find_article_in_cache(url)

    start = time.monotonic()

    # Fetch the full HTML page
    try:
        client = get_http_client()
        response = await client.get(url, follow_redirects=True, timeout=FETCH_TIMEOUT)
        response.raise_for_status()
        html = response.text
    except httpx.TimeoutException:
        logger.warning("Reader fetch timeout for %s", url)
        result = _failed_response(url, "timeout", article_meta)
        cache.set(f"reader:{url}", result, READER_CACHE_TTL_MINUTES)
        return result
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        reason = "forbidden" if status_code in (401, 403) else "error"
        logger.warning("Reader fetch HTTP %d for %s", status_code, url)
        result = _failed_response(url, reason, article_meta)
        cache.set(f"reader:{url}", result, READER_CACHE_TTL_MINUTES)
        return result
    except Exception as e:
        logger.warning("Reader fetch error for %s: %s", url, str(e))
        result = _failed_response(url, "error", article_meta)
        cache.set(f"reader:{url}", result, READER_CACHE_TTL_MINUTES)
        return result

    # Try readability first (preserves HTML structure + images)
    # Offload CPU-bound extraction to thread pool to avoid blocking the event loop
    content_html, extracted_title = await asyncio.to_thread(_extract_with_readability, html, url)
    extractor_used = "readability"

    # Fall back to trafilatura if readability didn't get enough content
    if content_html is None:
        content_html = await asyncio.to_thread(_extract_with_trafilatura, html, url)
        extracted_title = None  # trafilatura doesn't give us a title separately
        extractor_used = "trafilatura"

    # If both failed, return failure
    if content_html is None:
        logger.warning("Reader extraction empty for %s", url)
        result = _failed_response(url, "extraction_empty", article_meta)
        cache.set(f"reader:{url}", result, READER_CACHE_TTL_MINUTES)
        return result

    # Sanitize the extracted HTML (offload regex work to thread pool)
    content_html = await asyncio.to_thread(_sanitize_html, content_html)
    word_count = _count_words(_html_to_text(content_html))

    # Extract author from the raw HTML
    author = _extract_author(html)

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "Reader extracted %d words from %s via %s in %dms",
        word_count, url[:80], extractor_used, duration_ms,
    )

    result = {
        "status": "ok",
        "url": url,
        "title": (article_meta or {}).get("title") or extracted_title,
        "author": author,
        "content_html": content_html,
        "word_count": word_count,
        "image_url": (article_meta or {}).get("image_url"),
        "source_name": (article_meta or {}).get("source_name"),
        "published_at": (article_meta or {}).get("published_at"),
        "extracted_at": datetime.now(timezone.utc),
    }

    cache.set(f"reader:{url}", result, READER_CACHE_TTL_MINUTES)
    return result


def _failed_response(url: str, reason: str, article_meta: dict | None = None) -> dict:
    """Build a failed reader response with whatever metadata we have."""
    return {
        "status": "failed",
        "url": url,
        "reason": reason,
        "title": (article_meta or {}).get("title"),
        "source_name": (article_meta or {}).get("source_name"),
        "image_url": (article_meta or {}).get("image_url"),
        "published_at": (article_meta or {}).get("published_at"),
    }
