"""
Reader View Extraction Test
============================
Fetches real articles from the live ClearNews API, downloads full HTML pages,
runs content extraction with trafilatura and readability-lxml, and generates
a comparison report.

Usage:
    cd backend
    source venv/bin/activate
    python research/reader_view/test_extraction.py

Output:
    research/reader_view/raw/          — Original HTML pages
    research/reader_view/extracted/    — Extracted content (per library)
    research/reader_view/report.md     — Summary comparison table
"""

import asyncio
import os
import re
import time
from pathlib import Path
from dataclasses import dataclass, field

import httpx
import trafilatura
from readability import Document as ReadabilityDocument

# ── Config ──────────────────────────────────────────────────────────────────

API_URL = "https://getclearnews.com/api/v1/articles"
ARTICLES_PER_SOURCE = 2  # How many articles to test per source
MAX_TOTAL_ARTICLES = 30  # Safety cap
FETCH_TIMEOUT = 15.0

# Directories (relative to this script)
SCRIPT_DIR = Path(__file__).parent
RAW_DIR = SCRIPT_DIR / "raw"
EXTRACTED_DIR = SCRIPT_DIR / "extracted"
REPORT_PATH = SCRIPT_DIR / "report.md"

# Browser-like headers (same as the backend uses)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}


# ── Data structures ─────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """Result from one extraction library on one article."""
    library: str
    text_length: int = 0
    word_count: int = 0
    has_content: bool = False
    has_images: bool = False
    image_count: int = 0
    first_200_chars: str = ""
    filename: str = ""
    error: str = ""


@dataclass
class ArticleTestResult:
    """Full test result for one article."""
    source_name: str
    source_id: str
    title: str
    url: str
    category: str
    raw_html_size: int = 0
    raw_filename: str = ""
    fetch_error: str = ""
    fetch_time_ms: int = 0
    extractions: list[ExtractionResult] = field(default_factory=list)


# ── Helpers ─────────────────────────────────────────────────────────────────

def slugify(text: str, max_len: int = 50) -> str:
    """Convert text to a filename-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text[:max_len].rstrip('-')


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split()) if text else 0


def count_images(html: str) -> int:
    """Count <img> tags in HTML."""
    return len(re.findall(r'<img\b', html, re.IGNORECASE)) if html else 0


# ── Step 1: Fetch article URLs from the live API ───────────────────────────

async def fetch_article_urls(client: httpx.AsyncClient) -> list[dict]:
    """Fetch articles from the live API across all categories."""
    print("=" * 70)
    print("Step 1: Fetching article URLs from live API")
    print("=" * 70)

    # Fetch a large page to get articles from many sources
    resp = await client.get(API_URL, params={"per_page": 50, "category": "all"})
    resp.raise_for_status()
    data = resp.json()
    all_articles = data.get("articles", [])
    print(f"  Fetched {len(all_articles)} articles from 'all' category")

    # Also fetch finance specifically (fewer articles, might not be in first 50)
    resp = await client.get(API_URL, params={"per_page": 20, "category": "finance"})
    resp.raise_for_status()
    finance_articles = resp.json().get("articles", [])
    print(f"  Fetched {len(finance_articles)} articles from 'finance' category")

    # Merge, dedup by URL
    seen_urls = set()
    merged = []
    for a in all_articles + finance_articles:
        if a["url"] not in seen_urls:
            seen_urls.add(a["url"])
            merged.append(a)

    # Pick ARTICLES_PER_SOURCE per unique source, up to MAX_TOTAL_ARTICLES
    source_counts: dict[str, int] = {}
    selected = []
    for article in merged:
        sid = article.get("source_id", "unknown")
        if source_counts.get(sid, 0) >= ARTICLES_PER_SOURCE:
            continue
        source_counts[sid] = source_counts.get(sid, 0) + 1
        selected.append(article)
        if len(selected) >= MAX_TOTAL_ARTICLES:
            break

    print(f"  Selected {len(selected)} articles across {len(source_counts)} sources:")
    for sid, count in sorted(source_counts.items()):
        print(f"    {sid}: {count} articles")
    print()

    return selected


# ── Step 2: Download raw HTML ──────────────────────────────────────────────

async def download_article(
    article: dict, client: httpx.AsyncClient
) -> ArticleTestResult:
    """Download the full HTML page for one article."""
    source_name = article.get("source_name", "unknown")
    source_id = article.get("source_id", "unknown")
    title = article.get("title", "untitled")
    url = article.get("url", "")
    category = article.get("category", "")

    slug = slugify(f"{source_id}_{title}")
    raw_filename = f"{slug}.html"

    result = ArticleTestResult(
        source_name=source_name,
        source_id=source_id,
        title=title,
        url=url,
        category=category,
        raw_filename=raw_filename,
    )

    start = time.monotonic()
    try:
        resp = await client.get(url, follow_redirects=True, timeout=FETCH_TIMEOUT)
        resp.raise_for_status()
        html = resp.text
        result.raw_html_size = len(html)
        result.fetch_time_ms = int((time.monotonic() - start) * 1000)

        # Save raw HTML
        raw_path = RAW_DIR / raw_filename
        raw_path.write_text(html, encoding="utf-8")

    except Exception as e:
        result.fetch_error = f"{type(e).__name__}: {str(e)[:100]}"
        result.fetch_time_ms = int((time.monotonic() - start) * 1000)

    return result


async def download_all_articles(
    articles: list[dict], client: httpx.AsyncClient
) -> list[ArticleTestResult]:
    """Download all articles concurrently (with some throttling)."""
    print("=" * 70)
    print("Step 2: Downloading raw HTML pages")
    print("=" * 70)

    sem = asyncio.Semaphore(5)  # Max 5 concurrent downloads

    async def throttled_download(article):
        async with sem:
            return await download_article(article, client)

    tasks = [throttled_download(a) for a in articles]
    results = await asyncio.gather(*tasks)

    ok = sum(1 for r in results if not r.fetch_error)
    failed = sum(1 for r in results if r.fetch_error)
    print(f"  Downloaded: {ok} success, {failed} failed")
    for r in results:
        status = f"{r.raw_html_size:,} bytes in {r.fetch_time_ms}ms" if not r.fetch_error else f"FAILED: {r.fetch_error}"
        print(f"    [{r.source_id}] {status}")
    print()

    return list(results)


# ── Step 3: Run extraction ─────────────────────────────────────────────────

def extract_with_trafilatura(html: str, url: str, slug: str) -> ExtractionResult:
    """Extract content using trafilatura."""
    result = ExtractionResult(library="trafilatura")

    try:
        # Extract as plain text
        text = trafilatura.extract(
            html,
            url=url,
            include_comments=False,
            include_tables=True,
            favor_recall=True,  # Prefer getting more content over precision
        )

        if text:
            result.has_content = True
            result.text_length = len(text)
            result.word_count = count_words(text)
            result.first_200_chars = text[:200].replace('\n', ' ')

            # Save extracted text
            filename = f"{slug}_trafilatura.txt"
            result.filename = filename
            (EXTRACTED_DIR / filename).write_text(text, encoding="utf-8")

        # Also extract as HTML to check image preservation
        html_out = trafilatura.extract(
            html,
            url=url,
            include_comments=False,
            include_tables=True,
            include_images=True,
            output_format="xml",
        )
        if html_out:
            result.image_count = count_images(html_out)
            result.has_images = result.image_count > 0

    except Exception as e:
        result.error = f"{type(e).__name__}: {str(e)[:100]}"

    return result


def extract_with_readability(html: str, url: str, slug: str) -> ExtractionResult:
    """Extract content using readability-lxml (Mozilla Readability port)."""
    result = ExtractionResult(library="readability")

    try:
        doc = ReadabilityDocument(html, url=url)
        content_html = doc.summary()

        if content_html:
            result.has_content = True
            result.text_length = len(content_html)
            result.image_count = count_images(content_html)
            result.has_images = result.image_count > 0

            # Strip HTML for word count and preview
            text_only = re.sub(r'<[^>]+>', ' ', content_html)
            text_only = re.sub(r'\s+', ' ', text_only).strip()
            result.word_count = count_words(text_only)
            result.first_200_chars = text_only[:200]

            # Save extracted HTML
            filename = f"{slug}_readability.html"
            result.filename = filename
            (EXTRACTED_DIR / filename).write_text(content_html, encoding="utf-8")

    except Exception as e:
        result.error = f"{type(e).__name__}: {str(e)[:100]}"

    return result


def run_extractions(results: list[ArticleTestResult]) -> None:
    """Run both extraction libraries on all downloaded articles."""
    print("=" * 70)
    print("Step 3: Running content extraction")
    print("=" * 70)

    for r in results:
        if r.fetch_error:
            print(f"  [{r.source_id}] Skipping (fetch failed)")
            continue

        raw_path = RAW_DIR / r.raw_filename
        if not raw_path.exists():
            print(f"  [{r.source_id}] Skipping (no raw file)")
            continue

        html = raw_path.read_text(encoding="utf-8")
        slug = r.raw_filename.replace(".html", "")

        # Run both extractors
        traf = extract_with_trafilatura(html, r.url, slug)
        read = extract_with_readability(html, r.url, slug)
        r.extractions = [traf, read]

        t_status = f"{traf.word_count} words" if traf.has_content else "EMPTY"
        r_status = f"{read.word_count} words, {read.image_count} imgs" if read.has_content else "EMPTY"
        if traf.error:
            t_status = f"ERROR: {traf.error}"
        if read.error:
            r_status = f"ERROR: {read.error}"

        print(f"  [{r.source_id}] trafilatura: {t_status} | readability: {r_status}")

    print()


# ── Step 4: Generate report ────────────────────────────────────────────────

def generate_report(results: list[ArticleTestResult]) -> None:
    """Generate a markdown report summarizing all extraction results."""
    print("=" * 70)
    print("Step 4: Generating report")
    print("=" * 70)

    lines = [
        "# Reader View Extraction Test Report",
        "",
        f"**Date**: {time.strftime('%Y-%m-%d %H:%M')}",
        f"**Articles tested**: {len(results)}",
        f"**Sources covered**: {len(set(r.source_id for r in results))}",
        "",
        "---",
        "",
        "## Summary Table",
        "",
        "| Source | Category | Title | Traf Words | Traf Imgs | Read Words | Read Imgs | Notes |",
        "|--------|----------|-------|-----------|-----------|-----------|-----------|-------|",
    ]

    # Stats
    traf_success = 0
    read_success = 0
    both_success = 0
    total_testable = 0

    for r in results:
        title_short = r.title[:40] + "..." if len(r.title) > 40 else r.title
        title_short = title_short.replace("|", "\\|")

        if r.fetch_error:
            lines.append(
                f"| {r.source_id} | {r.category} | {title_short} | — | — | — | — | Fetch failed: {r.fetch_error[:30]} |"
            )
            continue

        total_testable += 1
        traf = next((e for e in r.extractions if e.library == "trafilatura"), None)
        read = next((e for e in r.extractions if e.library == "readability"), None)

        t_words = str(traf.word_count) if traf and traf.has_content else "FAIL"
        t_imgs = str(traf.image_count) if traf and traf.has_content else "—"
        r_words = str(read.word_count) if read and read.has_content else "FAIL"
        r_imgs = str(read.image_count) if read and read.has_content else "—"

        notes = []
        if traf and traf.error:
            notes.append(f"traf err: {traf.error[:30]}")
        if read and read.error:
            notes.append(f"read err: {read.error[:30]}")
        if traf and traf.has_content and traf.word_count < 50:
            notes.append("traf: very short")
        if read and read.has_content and read.word_count < 50:
            notes.append("read: very short")

        if traf and traf.has_content:
            traf_success += 1
        if read and read.has_content:
            read_success += 1
        if traf and traf.has_content and read and read.has_content:
            both_success += 1

        lines.append(
            f"| {r.source_id} | {r.category} | {title_short} | {t_words} | {t_imgs} | {r_words} | {r_imgs} | {'; '.join(notes) or '—'} |"
        )

    # Add summary stats
    lines.extend([
        "",
        "---",
        "",
        "## Stats",
        "",
        f"- **Total articles tested**: {len(results)}",
        f"- **Successfully fetched**: {total_testable}",
        f"- **Trafilatura success**: {traf_success}/{total_testable} ({traf_success*100//max(total_testable,1)}%)",
        f"- **Readability success**: {read_success}/{total_testable} ({read_success*100//max(total_testable,1)}%)",
        f"- **Both succeeded**: {both_success}/{total_testable} ({both_success*100//max(total_testable,1)}%)",
        "",
        "---",
        "",
        "## Per-Source Breakdown",
        "",
    ])

    # Group by source
    source_groups: dict[str, list[ArticleTestResult]] = {}
    for r in results:
        source_groups.setdefault(r.source_id, []).append(r)

    for source_id, articles in sorted(source_groups.items()):
        lines.append(f"### {articles[0].source_name} (`{source_id}`)")
        lines.append("")

        for r in articles:
            lines.append(f"**{r.title}**")
            lines.append(f"- URL: {r.url}")

            if r.fetch_error:
                lines.append(f"- Fetch: FAILED — {r.fetch_error}")
                lines.append("")
                continue

            lines.append(f"- Fetch: {r.raw_html_size:,} bytes in {r.fetch_time_ms}ms")
            lines.append(f"- Raw file: `raw/{r.raw_filename}`")

            for ext in r.extractions:
                if ext.error:
                    lines.append(f"- **{ext.library}**: ERROR — {ext.error}")
                elif ext.has_content:
                    lines.append(
                        f"- **{ext.library}**: {ext.word_count} words, "
                        f"{ext.image_count} images → `extracted/{ext.filename}`"
                    )
                    lines.append(f"  - Preview: _{ext.first_200_chars[:150]}..._")
                else:
                    lines.append(f"- **{ext.library}**: No content extracted")

            lines.append("")

    lines.extend([
        "---",
        "",
        "## Files",
        "",
        "- `raw/` — Original HTML pages as downloaded",
        "- `extracted/*_trafilatura.txt` — Plain text extracted by trafilatura",
        "- `extracted/*_readability.html` — HTML extracted by readability-lxml",
        "",
    ])

    report_text = "\n".join(lines)
    REPORT_PATH.write_text(report_text, encoding="utf-8")
    print(f"  Report saved to: {REPORT_PATH}")
    print()


# ── Main ────────────────────────────────────────────────────────────────────

async def main():
    # Ensure output dirs exist
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        # Step 1: Get article URLs from live API
        articles = await fetch_article_urls(client)

        # Step 2: Download raw HTML
        results = await download_all_articles(articles, client)

        # Step 3: Extract content
        run_extractions(results)

        # Step 4: Generate report
        generate_report(results)

    print("=" * 70)
    print("Done! Review:")
    print(f"  Report:    {REPORT_PATH}")
    print(f"  Raw HTML:  {RAW_DIR}/")
    print(f"  Extracted: {EXTRACTED_DIR}/")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
