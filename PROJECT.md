# News Aggregator - Project Documentation

## Overview

A personal news aggregator that pulls from multiple sources (RSS feeds, News APIs, Financial APIs) and presents them through a clean, filterable interface. Built for personal use by the owner and shared with family and friends.

The core idea: a single place to consume news without clickbait, ad overload, and political noise — with the ability to filter by category, sentiment, and source type.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | Python 3.12+ / FastAPI | REST API serving both web and mobile clients |
| **Database** | None (stateless) | All data is in-memory article cache — no persistent storage needed |
| **Article Cache** | In-memory (Python dict) | Transient article cache with per-source TTL |
| **Web Frontend** | Next.js 16 (React 19) / Tailwind CSS v4 | Standalone output for Docker, dark mode, infinite scroll |
| **iOS App** | Swift / SwiftUI | Native iOS app, 26 files, zero packages, @Observable + .environment() |
| **Deployment** | DigitalOcean Droplet / Docker Compose | Dedicated droplet, nginx reverse proxy, Let's Encrypt SSL |

---

## Architecture

### High-Level Diagram

```
┌──────────────┐     ┌──────────────┐
│   Next.js    │     │   iOS App    │
│   Web App    │     │   (SwiftUI)  │
└──────┬───────┘     └──────┬───────┘
       │                    │
       └────────┬───────────┘
                │
                ▼
       ┌────────────────┐
       │   FastAPI       │
       │   Backend       │
       │                 │
       │  ┌───────────┐  │
       │  │ In-Memory  │  │
       │  │  Cache     │  │
       │  └───────────┘  │
       └────────┬────────┘
                │
        ┌───────┼───────────────┐
        │       │               │
        ▼       ▼               ▼
   ┌────────┐ ┌──────────┐ ┌──────────┐
   │  RSS   │ │  News    │ │ Financial│
   │ Feeds  │ │  APIs    │ │   APIs   │
   └────────┘ └──────────┘ └──────────┘
```

### Data Flow

1. **User opens app** (web or iOS)
2. **Client requests articles** from FastAPI backend (e.g., `GET /articles?category=tech`)
3. **Backend checks in-memory cache** — if cached articles exist for the source and TTL has not expired, return cached data
4. **If cache is stale or empty** — backend fetches from configured sources (RSS feeds, Financial APIs). Cold cache uses a 3-second deadline: returns whatever sources completed, remaining continue in background.
5. **Backend normalizes** all responses into a common article structure
6. **Backend backfills missing images** by fetching og:image from article pages
7. **Backend caches** the fully enriched articles in memory with a timestamp
8. **Backend applies deduplication** (URL exact match + title keyword overlap at 0.6 threshold)
9. **Backend applies two-tier sorting** — diverse top section, then chronological (see Sorting section)
10. **Backend returns** filtered, sorted articles to the client

**Background tasks**: Two `asyncio` tasks run in the app lifespan alongside user requests:
1. **Startup warmup** — pre-fetches all 41 sources on server start (~11s). One-time task.
2. **Background refresh loop** — continuously refreshes the stalest expired source every ~25 seconds, one at a time. Full cycle through all sources ~17 minutes. Keeps cache perpetually warm so user requests always hit fresh data. Exception-safe with 30s hard timeout per fetch.

Cache TTL is configurable per-source (default: 15 minutes). SWR caching (24h stale window) ensures users almost never wait for cold fetches. When they do (>24h gap), the progressive response returns partial data in ~3s instead of blocking for all sources.

**Conditional HTTP requests**: RSS and FMP fetchers store `ETag` and `Last-Modified` response headers per source. On subsequent fetches, they send `If-None-Match` / `If-Modified-Since` headers. Feeds that haven't changed return `304 Not Modified` — the cache TTL is extended without re-parsing XML, saving CPU and bandwidth.

**Thread pool offloading**: CPU-bound operations (feedparser XML parsing, readability/trafilatura content extraction, article deduplication) are offloaded to Python's thread pool via `asyncio.to_thread()`. This keeps the async event loop free to handle concurrent requests on the single-vCPU production server.

---

## Security

- **SSRF protection** — reader endpoint validates URLs before fetching: blocks private IPs, loopback, link-local, reserved addresses, DNS rebinding prevention, HTTP(S)-only schemes
- **HTML sanitization** — two-layer defense: backend uses nh3 (Rust-powered allowlist sanitizer), web frontend adds DOMPurify client-side, iOS uses Content Security Policy in WKWebView
- **No authentication** — public read-only API. No user accounts, no passwords, no tokens, no database. All data is transient article cache.
- **Nginx security headers** — HSTS, CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options, server_tokens off
- **Docker hardening** — non-root users, multi-stage builds, .dockerignore, pinned base images, container resource limits
- **Rate limiting** — nginx rate limits on all API endpoints (10 req/s per IP)

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
    "source_id": str,           # Source ID from sources.yaml
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
- `finance` — Markets, stocks, business (powered by FMP)
- `health` — Health & wellness
- `sports` — Sports news
- `offbeat` — Weird, wonderful, unusual stories
- `travel` — Travel news, guides, destinations
- `india` — India news from major English-language outlets

Categories are assigned based on source configuration. A single source maps to one primary category. The category list is defined in the `categories` section of `backend/sources.yaml` — new categories must be added there.

### Source Configuration

Sources are defined in `backend/sources.yaml`. See that file for the full list. Each source has:

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

Sources are defined in `backend/sources.yaml`. This makes it easy to add, remove, or toggle sources without code changes.

**Current sources:** 48 total (39 RSS + 2 Financial API enabled, 7 disabled). See `backend/sources.yaml` for the full list with URLs.

**Source types and how they're fetched:**
- **RSS** (`type: rss`) — Parsed with `feedparser`. One fetcher handles all RSS feeds with normalization for field variations (images, dates, summaries differ across feeds). Includes og:image backfill for feeds without embedded images. Supports conditional requests (ETag/Last-Modified → 304 Not Modified).
- **News API** (`type: news_api`) — WorldNewsAPI. Not yet implemented (disabled).
- **Financial API** (`type: financial_api`) — FMP (Financial Modeling Prep). Two endpoints: general-latest (aggregated news from WSJ, CNBC, Bloomberg) and fmp-articles (FMP's own market analysis). Dedicated fetcher (`fmp_fetcher.py`). Supports conditional requests.

**Disabled sources:** WorldNewsAPI (not implemented), 5 Google News feeds (disabled for performance — each article required 2 HTTP round-trips to resolve redirect URLs), Smithsonian Magazine (403 from production server IP).

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
|-------|------|---------|-------------|
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

- **Cache layer:** In-memory Python dict (no database — articles are transient)
- **Cache key:** Source ID
- **Default TTL:** 15 minutes (configurable per-source in `sources.yaml`)
- **Stale-while-revalidate (SWR):** Three-state cache with background refresh
  - **HIT** (fresh, < TTL): return immediately
  - **STALE** (TTL to 96x TTL, e.g., 15min-24h): serve stale data instantly, kick off background refresh via `asyncio.create_task()`
  - **MISS** (> 96x TTL or never fetched): fetch with 3s deadline (progressive response)
- **Progressive cold-cache response:** On MISS, uses `asyncio.wait` with a 3-second deadline instead of blocking for all sources. Returns whatever is ready (`complete: false`), remaining sources continue in a fire-and-forget background task. Clients auto-retry after 3s. Typical: ~900 articles in 3-4s vs ~1700 in 10-12s.
- **Non-blocking refresh:** `?refresh=true` returns cached articles immediately with `complete: false` and triggers a background refresh of all sources. Clients auto-retry after 3s to pick up fresh data. Decouples "serve to user" from "fetch from upstream" — same pattern used by Feedly, Apple News, and other production aggregators.
- **Background refresh loop:** `asyncio` task picks the stalest expired source every ~25 seconds and refreshes it one at a time. Full cycle ~17 minutes. Keeps cache perpetually warm so user requests always hit fresh data. Exception-safe (catches all errors, never crashes), 30s hard timeout per fetch, waits for warmup to complete before starting.
- **Conditional HTTP requests:** RSS and FMP fetchers store `ETag` / `Last-Modified` response headers per source. On subsequent requests, send `If-None-Match` / `If-Modified-Since`. Feeds returning `304 Not Modified` skip parsing entirely — cache TTL is extended in place. Reduces bandwidth and CPU.
- **Startup warmup:** On server start, all enabled sources pre-fetched as background task (~11s). First user request hits warm cache.
- **HTTP Cache-Control:** Backend middleware sets response headers — articles (5min), categories/sources (5min), refresh requests (no-store). Browsers and URLSession cache natively.
- **No eviction logic needed** — stale entries are overwritten on next fetch

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
├── README.md
├── PROJECT.md                      # This file
├── CLAUDE.md                       # Claude Code development guide
├── CURRENT_STATE.md                # Build status tracker
├── NOW.md                          # Current priorities
├── CHANGELOG.md                    # Version history
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point, middleware, lifespan
│   │   ├── config.py               # App configuration, env vars
│   │   ├── logging_config.py       # Logging setup (text format)
│   │   ├── cache.py                # In-memory SWR article cache
│   │   │
│   │   ├── articles/
│   │   │   ├── router.py           # Article endpoints
│   │   │   ├── service.py          # Business logic — fetch, cache, filter
│   │   │   └── reader.py           # Content extraction for reader view (SSRF-protected, nh3 sanitization)
│   │   │
│   │   ├── sources/
│   │   │   ├── router.py           # Source/category endpoints
│   │   │   ├── registry.py         # Load and manage source configs
│   │   │   ├── rss_fetcher.py      # RSS feed parser + og:image backfill
│   │   │   └── fmp_fetcher.py      # FMP financial API fetcher (general news + market analysis)
│   │   │
│   │   └── common/
│   │       └── schemas.py          # Pydantic schemas (API response shapes)
│   │
│   ├── sources.yaml                # Source registry configuration
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── web/                            # Next.js web frontend
├── ios/                            # SwiftUI iOS app
│   └── ClearNews/ClearNews/ClearNews/
│       ├── ClearNewsApp.swift      # @main entry, services, .environment()
│       ├── ContentView.swift       # TabView (Home + Settings)
│       ├── Models/                 # Article, ReaderContent, Category
│       ├── Services/               # APIClient, ArticleService, CategoryService
│       ├── Settings/               # AppSettings (appearance, font scale)
│       ├── Views/Home/             # HomeView, ArticleListView, ArticleCardView, CategoryTabsView
│       ├── Views/Reader/           # ReaderView, ReaderWebView (WKWebView)
│       ├── Views/Settings/         # SettingsView, AboutView
│       ├── Views/Shared/           # ErrorView, EmptyStateView, RelativeTimeText, SkeletonView
│       └── Utilities/              # Constants
├── iosplan.md                      # iOS architecture & build plan
├── deployment/
│   ├── docker/                     # Dockerfiles + docker-compose.prod.yml
│   ├── nginx/                      # Host-level nginx config
│   ├── scripts/                    # setup.sh, deploy.sh, etc.
│   └── .env.production.example     # Production env template
└── scripts/                        # Local dev restart scripts
```

---

## Environment Variables

```bash
# Backend
FMP_API_KEY=<your-key>
WORLD_NEWS_API_KEY=<your-key>              # Optional — not yet integrated
CACHE_TTL_MINUTES=15
CORS_ORIGINS=https://getclearnews.com      # Production only

# Web Frontend
NEXT_PUBLIC_API_URL=https://your-api-domain.com/api/v1
```

---

## Deployment

### Production (DigitalOcean Droplet)

- **Domain**: getclearnews.com
- **Host**: DigitalOcean Droplet (Ubuntu 24.04, $6/mo, sfo3)
- **Reverse proxy**: Nginx (host-level) handles SSL termination, rate limiting, routing
- **Containers**: Docker Compose with two services
  - Backend: FastAPI on Uvicorn (port 8000, localhost only)
  - Frontend: Next.js standalone (port 3000, localhost only)
- **SSL**: Let's Encrypt with certbot auto-renewal
- **Stateless**: No database — all data is in-memory article cache. Logs bind-mounted to `/opt/app/logs/`
- **Security**: UFW firewall, fail2ban, rate limiting, non-root container users, comprehensive security headers, container resource limits, multi-stage builds, .dockerignore
- **Deploy script**: Auto-cleans Docker build cache and old images after every deploy to prevent disk bloat

```
Internet → Nginx (SSL + rate limiting)
              ├── /api/* → Backend container (port 8000)
              └── /*     → Frontend container (port 3000)
```

See [deployment/README.md](deployment/README.md) for setup and deploy instructions.

### iOS App (built)

- Native SwiftUI app, 26 Swift files, zero external dependencies
- Built and tested locally via Xcode
- Points to production API (https://getclearnews.com/api/v1) by default
- Distributed via TestFlight for family/friends (requires Apple Developer account — $99/year)
- See [iosplan.md](iosplan.md) for full architecture and build plan

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
