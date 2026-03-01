# Backend — FastAPI REST API

The backend serves both the web and iOS frontends via a REST API. It fetches news from RSS feeds and APIs, normalizes them into a common format, caches in memory, and returns filtered, paginated results. Stateless — no database, no user accounts.

## Quick Start

```bash
cd backend
source venv/bin/activate
cp .env.example .env          # Add your API keys
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/articles` | Fetch articles (supports category, source, search, pagination, refresh) |
| GET | `/api/v1/articles/reader` | Extract clean article content for reader view (SSRF-protected) |
| GET | `/api/v1/sources` | List all configured sources |
| GET | `/api/v1/categories` | List categories with source counts |

### Article Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | `all` | Filter: science, tech, feel_good, etc. |
| `source` | string | — | Filter by source ID (e.g., `the-verge`) |
| `search` | string | — | Keyword search in title and summary (case-insensitive) |
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 50) |
| `refresh` | bool | false | Non-blocking refresh — returns cached data instantly, triggers background refresh |

## Folder Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI entry point, lifespan, middleware (timing, Cache-Control)
│   ├── config.py            # Settings from .env via pydantic-settings
│   ├── logging_config.py    # Logging setup (text format, all environments)
│   ├── cache.py             # In-memory SWR article cache (HIT/STALE/MISS)
│   │
│   ├── articles/
│   │   ├── router.py        # GET /api/v1/articles + /articles/reader endpoints
│   │   ├── service.py       # Orchestrates cache + fetching + dedup + merging + background refresh loop
│   │   └── reader.py        # Content extraction with SSRF protection + nh3 HTML sanitization
│   │
│   ├── sources/
│   │   ├── registry.py      # Loads sources.yaml, provides query helpers
│   │   ├── router.py        # GET /api/v1/sources, /categories endpoints
│   │   ├── rss_fetcher.py   # RSS feed fetcher + normalization + og:image backfill + conditional requests
│   │   └── fmp_fetcher.py   # FMP financial API fetcher + conditional requests
│   │
│   └── common/
│       └── schemas.py       # Pydantic models for API responses
│
├── sources.yaml             # Source registry — all news sources configured here
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
└── venv/                    # Python virtual environment (gitignored)
```

## Architecture Notes

### Data Flow

```
Request → Article Service → check SWR cache per source
                          → HIT (fresh): use cached data
                          → STALE: serve cached data + background refresh
                          → MISS: fetch with 3s deadline (progressive — return partial, rest in background)
                          → refresh=true: return cached data + background refresh (non-blocking)
                              → RSS: parse XML → normalize → backfill images
                              → FMP: fetch JSON → normalize (general news or fmp-articles format)
                          → cache result (final, ready-to-serve dicts)
                          → merge all sources
                          → deduplicate (URL match + title keyword overlap)
                          → two-tier sort + paginate → Response
```

### Key Patterns

- **Thread pool offloading**: CPU-bound operations use `asyncio.to_thread()` to avoid blocking the event loop: readability/trafilatura extraction, feedparser XML parsing, article deduplication.
- **SWR caching**: Stale-while-revalidate with 24h stale window (96x TTL) — fresh data served instantly, stale data served immediately with background refresh, expired/missing data triggers deadline-based progressive fetch. Users almost never wait.
- **Background refresh loop**: `asyncio` task refreshes the stalest expired source every ~25 seconds, one at a time. Full cycle ~17 minutes. Exception-safe with 30s timeout per fetch.
- **Conditional HTTP requests**: RSS and FMP fetchers send `If-None-Match`/`If-Modified-Since` headers. Unchanged feeds return 304 — cache TTL extended without re-parsing.
- **Non-blocking refresh**: `?refresh=true` returns cached data instantly with `complete: false`, triggers background refresh. Clients auto-retry after 3s.
- **Two-tier sorting**: "All" tab: 1 per source, capped at 3 per category in tier 1, rest chronological. Category tabs: top 5 per source in tier 1, rest chronological. No articles discarded.
- **Startup warmup**: All sources pre-fetched on server start (~11s). First request always hits warm cache.
- **SSRF protection**: Reader endpoint validates URLs — blocks private IPs, loopback, link-local, reserved addresses, DNS rebinding.
- **HTML sanitization**: nh3 (Rust-powered allowlist sanitizer) replaces regex. Only safe tags/attributes survive.
- **Cache-Control headers**: Middleware sets HTTP headers — articles (5min), categories/sources (5min), refresh (no-store).
- **Text logging**: Human-readable format for all environments. Request timing, cache status, per-source fetch duration.
- **Per-source isolation**: One broken feed never crashes the request. Errors are logged, the source is skipped, other sources still return data.
- **Concurrent fetching**: Multiple stale sources are fetched in parallel via `asyncio.gather`.
- **Shared HTTP client**: A single `httpx.AsyncClient` is created on startup and reused for all outbound requests (connection pooling, browser User-Agent).
- **Deduplication**: Two-layer dedup after merging all sources — URL exact match (global) + title keyword overlap (0.6 threshold, bucketed by category). O(1) set-based removal tracking. Prefers articles with images.
- **Swagger/ReDoc**: Available in development (`/docs`, `/redoc`), disabled in production.

### Adding a New Source

1. Add an entry to `sources.yaml` with `enabled: true`
2. Restart the server
3. That's it — no code changes needed for RSS sources

### Source Types

| Type | Fetcher | Status |
|------|---------|--------|
| `rss` | `rss_fetcher.py` | Working (39 sources) |
| `financial_api` | `fmp_fetcher.py` | Working (2 FMP sources) |
| `news_api` | — | Not yet implemented |

## Dependencies

| Package | Purpose |
|---------|---------|
| fastapi + uvicorn | Web framework + ASGI server |
| pydantic-settings | Typed config from .env |
| feedparser | RSS/Atom feed parsing |
| httpx | Async HTTP client |
| nh3 | HTML sanitization (Rust-powered allowlist) |
| trafilatura + readability-lxml | Article content extraction |
| pyyaml | Load sources.yaml |
| rapidfuzz | Fuzzy string matching (dedup) |
