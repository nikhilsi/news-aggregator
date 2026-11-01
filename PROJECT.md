# News Aggregator - Project Documentation

> **Since Nov 1, 2026 ClearNews runs on one Cloudflare Worker.** Current architecture, API contract and decisions: [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md). This file keeps the product idea, data model, dedup and sorting rules (unchanged by the move) and the design history.

## Overview

A personal news aggregator that pulls from multiple sources (RSS feeds, News APIs, Financial APIs) and presents them through a clean, filterable interface. Built for personal use by the owner and shared with family and friends.

The core idea: a single place to consume news without clickbait, ad overload, and political noise — with the ability to filter by category, sentiment, and source type.

---

## Tech Stack

| Layer | Technology | Notes |
|-|-|-|
| **API and feed refresh** | TypeScript / Hono on a Cloudflare Worker | Cron Trigger every minute, run from a Durable Object pinned to Western North America |
| **Storage** | Workers KV | Two values: per-source state and the merged lists; written only by the cron |
| **Web Frontend** | Next.js 16 (React 19) / Tailwind CSS v4 | Static export served by the Worker |
| **iOS App** | Swift / SwiftUI | Native iOS app, zero packages, @Observable + .environment() |
| **Android App** | Kotlin 2.1 / Jetpack Compose / Material 3 | OkHttp + kotlinx.serialization + Coil 3 |
| **Hosting** | Cloudflare Workers (OmSpark account) | Until Nov 1, 2026: a DigitalOcean droplet with Docker Compose, FastAPI and nginx |
| **CI/CD** | GitHub Actions | Tag-triggered Android APK + AAB release |

---

## Architecture

```
Next.js site    iOS app    Android app
      \            |            /
       └──── https://getclearnews.com ────┘
                     │
              Worker "clearnews"
       site (static files) + /api/v1/* + /health
                     │ reads
                Workers KV  <── writes ── Cron Trigger (every minute)
                                            │
                              Durable Object "Refresher" (Western North America)
                                            │ fetches
                                  RSS feeds, og:image pages
```

### Data Flow

1. **Every minute** the cron hands a run to the Refresher. It refetches every source whose last check is 15 minutes old (conditional GETs), normalizes the items, looks up missing og:images, and checks every article against the output gate.
2. **When any source changed**, it builds every tab's list (non-Latin filter except India, dedup, two-tier sort) and stores the result in KV, then the per-source state.
3. **A client asks** for `GET /api/v1/articles?category=tech`. The Worker reads the stored list for that tab, applies search, and returns one page. Nothing is fetched on the request path.
4. **The reader** fetches one article page on demand (SSRF checks on every redirect hop), extracts the main text with Mozilla Readability, and sanitizes it.

Details and the reasons behind each choice: [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md). Until Nov 1, 2026 a FastAPI backend fetched sources on demand with an in-memory stale-while-revalidate cache and a 25-second refresh loop.

---

## Security

- **SSRF protection**: the reader checks the URL and every redirect hop (scheme, no credentials, no IP literals or local names, DNS over HTTPS answers checked against private and special ranges), with a 15 s timeout and a 3 MB cap
- **HTML sanitization**: two layers. The Worker uses sanitize-html with an allowlist; the web adds DOMPurify; iOS and Android use a Content Security Policy in their WebViews
- **No authentication**: public read-only API. No accounts, passwords, tokens or database, and no secrets in the Worker
- **Security headers** on every response, set by the Worker: HSTS, CSP (no `'unsafe-eval'`), Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options
- **Rate limiting**: Cloudflare Rate Limiting binding, 100 requests per 10 s per IP on the API, 20 per minute on the reader

---

## Data Model

### Article (In-Memory Cache)

Articles are transient cached data, stored in memory only. The structure below is what each source's fetcher normalizes into:

```python
{
    "title": str,               # Article headline
    "summary": str,             # Short description or first paragraph
    "content": str | None,      # Full article content (extracted for reader view)
    "url": str,                 # Original source URL (used as unique identifier)
    "image_url": str | None,    # Thumbnail/hero image
    "source_id": str,           # Source ID from worker/src/sources.ts
    "source_name": str,         # e.g., "Ars Technica", "Good News Network"
    "source_type": str,         # "rss" | "news_api" | "financial_api"
    "category": str,            # Category from source config
    "sentiment": float | None,  # -1.0 to 1.0 (from API, or null if unavailable)
    "published_at": datetime,   # When the article was published
}
```

Source-type fetchers may preserve additional fields from the raw response. The above is the minimum common shape exposed via the API.

### Categories

- `all` — Everything, unfiltered
- `general` — General news (AP News)
- `local` — Local Seattle area news
- `feel_good` — Curated positive/uplifting news
- `science` — Science & discovery
- `tech` — Technology & gadgets
- `entertainment` — Culture, movies, music, gaming
- `finance` — Markets, stocks, business (CNBC, BBC Business, The Guardian Business since Nov 2026)
- `health` — Health & wellness
- `sports` — Sports news
- `offbeat` — Weird, wonderful, unusual stories
- `travel` — Travel news, guides, destinations
- `india` — India news from major English-language outlets

Categories are assigned based on source configuration. A single source maps to one primary category. The category list is `CATEGORIES` in `worker/src/sources.ts`; new categories must be added there.

### Source Configuration

Sources are defined in `worker/src/sources.ts`. Each source has (the TypeScript names differ slightly: `isCuratedPositive`, and one 15 minute refresh interval for all):

```python
{
    "id": str,                      # Unique source identifier
    "name": str,                    # Display name
    "type": str,                    # "rss" | "news_api" | "financial_api"
    "url": str,                     # RSS feed URL or API endpoint
    "category": str,                # Default category for articles from this source
    "is_curated_positive": bool,    # If true, all articles pass sentiment filter
    "enabled": bool,                # Toggle source on/off without removing config
    "api_key_env": str | None,      # Environment variable name for API key (if needed)
    "cache_ttl_minutes": int        # Per-source cache TTL (default: 15)
}
```

---

## Source Registry

Sources are defined in `worker/src/sources.ts`. Adding, removing or disabling a source is a one-line change there plus a deploy.

**Current sources:** 52 RSS feeds enabled across 15 categories (list in CURRENT_STATE.md).

**How they're fetched:** one RSS and Atom path (feedsmith) with normalization for field variations (images, dates, summaries), og:image lookups for items without images, and conditional requests (ETag, Last-Modified).

**Off:** MyNorthwest and The Seattle Times (403 to Cloudflare), KING 5 (redirects Cloudflare to YouTube), Smithsonian (403 to the old droplet), five Google News feeds (each article needed two round trips to resolve), WorldNewsAPI (never built). FMP (financial API) was removed in Nov 2026 when its subscription lapsed.

---

## API Design

### Base URL
```
/api/v1
```

### Article Endpoints

```
GET    /api/v1/articles            # Fetch articles with filters
GET    /api/v1/articles/reader     # Extract clean article content for reader view
```

#### Query Parameters for `GET /api/v1/articles`

| Param | Type | Default | Description |
|-|-|-|-|
| `category` | string | `all` | Filter by category |
| `source` | string | `null` | Filter by specific source ID |
| `search` | string | `null` | Keyword search in title/summary |
| `page` | int | `1` | Pagination |
| `per_page` | int | `20` | Items per page (max 50) |
| `refresh` | bool | `false` | Non-blocking refresh — returns cached data immediately, triggers background refresh |

#### Example Response

```json
{
    "articles": [
        {
            "title": "Scientists Discover New Species in Deep Ocean",
            "summary": "A team of marine biologists...",
            "url": "https://source.com/article",
            "image_url": "https://source.com/image.jpg",
            "source_name": "New Scientist",
            "category": "science",
            "sentiment": 0.7,
            "published_at": "2026-02-10T08:30:00Z"
        }
    ],
    "pagination": {
        "page": 1,
        "per_page": 20,
        "total": 142,
        "total_pages": 8
    },
    "complete": true
}
```

### Source Endpoints

```
GET    /api/v1/sources             # List all configured sources
GET    /api/v1/categories          # List all available categories
```

### Reader View Endpoint

```
GET    /api/v1/articles/reader?url=<encoded-url>    # Extract and return clean article content
```

Uses readability-lxml (primary) with trafilatura fallback to extract clean article content from the source URL. Returns `status: "ok"` with extracted HTML, or `status: "failed"` with reason code (forbidden, timeout, extraction_empty, error). Separate content cache with 60-minute TTL. Falls back gracefully for paywalled sites.

---

## Caching Strategy

Since Nov 1, 2026 (docs/cloudflare-architecture.md section 4):

- **No request-time fetching.** A Cron Trigger runs every minute. It refetches every source whose last check is 15 minutes old, with conditional GETs (ETag, Last-Modified), and retries a failed source after 5 minutes.
- **Stored in Workers KV**: `state` (per source: validators, times, status, normalized articles, og:image lookups) and `feed` (every tab's list, deduped and sorted, built when any source changes).
- **A failed source keeps its last good articles** for up to 24 hours, then they are dropped.
- **Every feed gets a full fetch at least daily**, so a server that keeps answering 304 cannot pin old items.
- **HTTP Cache-Control**: `public, max-age=300` on articles, categories and sources; `no-store` on `refresh=true`, partial pages and errors.

Before the move the backend kept an in-memory stale-while-revalidate cache per source (15 minute TTL, 24 hour stale window), warmed it at startup, and refreshed the stalest source every 25 seconds.

---

## Deduplication

Multiple sources cover the same story. After merging all sources and before sorting, the backend deduplicates using:

1. **URL exact match** (global) — Same article appearing in multiple sources
2. **Title keyword overlap** (bucketed by category) — Extracts significant keywords from titles (after stripping stop words and possessives). If keyword overlap ratio >= 0.6 (relative to the smaller keyword set), treated as duplicate. Title comparison only runs within the same category — articles in different categories are never title-duplicates.
3. **Priority when keeping:** Prefer articles with images > without.

Implementation: `app/articles/service.py` — `_deduplicate()` function. No external dependencies (uses stdlib `re` for keyword extraction). Uses O(1) set-based removal tracking instead of O(n) list scans. Runs in thread pool via `asyncio.to_thread()`.

---

## Article Sorting

Articles use a two-tier sort to ensure diversity at the top of the feed while keeping all articles accessible:

**"All" tab:**
- **Tier 1:** 1 most recent article per source, capped at 3 per category (~30 articles). Sorted by time.
- **Tier 2:** All remaining articles, sorted chronologically.

**Category tabs:**
- **Tier 1:** Top 5 articles per source. Sorted by time.
- **Tier 2:** All remaining articles, sorted chronologically.

No articles are discarded — tier 2 contains everything not promoted to tier 1. This prevents high-volume sources (e.g., India Today at 133 articles, Frommer's at 300) or timezone-ahead regions from dominating the feed.

Implementation: `app/articles/service.py` — `_tiered_sort()` function.

---

## Project Structure

```
news-aggregator/
├── worker/                         # Cloudflare Worker (TypeScript)
│   ├── src/index.ts                # Entry: routing, headers, www redirect, cron
│   ├── src/api.ts                  # /health and /api/v1/* (Hono)
│   ├── src/cron.ts                 # Feed refresh run
│   ├── src/refresher.ts            # Durable Object pinned to Western North America
│   ├── src/sources.ts              # Source registry (categories and sources)
│   ├── src/feeds/                  # Fetch, parse (feedsmith), normalize, dates, text
│   ├── src/pipeline/               # Non-Latin filter, dedup, two-tier sort, output gate
│   ├── src/reader/                 # Reader extraction, sanitizer, SSRF checks
│   ├── test/                       # Vitest in the Workers runtime
│   ├── scripts/                    # deploy, verify, contract-diff, sweep, cutover
│   └── wrangler.jsonc
├── web/                            # Next.js site (static export)
├── ios/ClearNews/                  # SwiftUI iOS app
├── android/ClearNews/              # Kotlin + Jetpack Compose Android app
├── docs/                           # Architecture, runbook, reviews, plans
├── .github/workflows/              # Android release
└── fastlane/, fdroid/              # Android store metadata
```

---

## Environment Variables

None. The Worker has no secrets. The site is built with `NEXT_PUBLIC_API_URL=/api/v1` (same origin). The deploy token lives in `~/.secrets/cloudflare/clearnews.env` on the Mac (docs/deploy-runbook.md).

---

## Deployment

Cloudflare Workers on the OmSpark account, Worker `clearnews`, custom domains `getclearnews.com` and `www.getclearnews.com`. Deploy with `npm run deploy` in `worker/`; it builds the site, runs the tests, scans the upload and deploys. Checks, rollback and the switchover record: [docs/deploy-runbook.md](docs/deploy-runbook.md).

Until Nov 1, 2026 ClearNews ran on a $6 DigitalOcean droplet (Ubuntu, Docker Compose with FastAPI and Next.js, host nginx, Let's Encrypt). That code is in git history before commit `638b95a`.

---

## TBD — To Be Decided

1. **Political news filter** — How aggressive the "hide political news" toggle should be

### Resolved
- **Brand name**: ClearNews (getclearnews.com)
- **Default view**: All categories, two-tier sort (diverse top section + chronological), 20 per page with infinite scroll
- **Financial news**: FMP API — general-latest (WSJ/CNBC/Bloomberg aggregation) + fmp-articles (market analysis). Alpha Vantage removed.
- **Source priority ranking**: Dedup prefers articles with images > without
- **Google News**: Disabled — URL resolution required 2 HTTP round-trips per article (~700 extra requests per refresh). Direct RSS feeds provide better performance.
- **Reader view**: URL-based extraction via readability-lxml + trafilatura, modal overlay on frontend
