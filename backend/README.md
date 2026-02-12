# Backend — FastAPI REST API

The backend serves both the web and iOS frontends via a REST API. It fetches news from RSS feeds and APIs, normalizes them into a common format, caches in memory, and returns filtered, paginated results.

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
| GET | `/api/v1/articles` | Fetch articles (supports category, source, pagination) |
| GET | `/api/v1/articles/reader` | Extract clean article content for reader view |
| GET | `/api/v1/sources` | List all configured sources |
| GET | `/api/v1/categories` | List categories with source counts |
| POST | `/api/v1/auth/login` | Login with email + password, returns JWT |
| POST | `/api/v1/auth/logout` | Logout (client-side — JWT is stateless) |
| GET | `/api/v1/auth/me` | Get current user profile (requires JWT) |

### Article Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | `all` | Filter: science, tech, feel_good, etc. |
| `source` | string | — | Filter by source ID (e.g., `the-verge`) |
| `search` | string | — | Keyword search in title and summary (case-insensitive) |
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 50) |
| `refresh` | bool | false | Force fresh fetch — bypasses SWR cache, fetches all sources |

## Folder Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI entry point, lifespan, middleware (timing, Cache-Control)
│   ├── config.py            # Settings from .env via pydantic-settings
│   ├── logging_config.py    # Structured logging (JSON for prod, text for dev)
│   ├── database.py          # SQLite connection (users only)
│   ├── cache.py             # In-memory SWR article cache (HIT/STALE/MISS)
│   │
│   ├── articles/
│   │   ├── router.py        # GET /api/v1/articles + /articles/reader endpoints
│   │   ├── service.py       # Orchestrates cache + fetching + dedup + merging
│   │   └── reader.py        # Content extraction for reader view (readability + trafilatura)
│   │
│   ├── sources/
│   │   ├── registry.py      # Loads sources.yaml, provides query helpers
│   │   ├── router.py        # GET /api/v1/sources, /categories endpoints
│   │   ├── rss_fetcher.py   # RSS feed fetcher + normalization + Google News URL resolver + og:image backfill
│   │   └── fmp_fetcher.py   # FMP financial API fetcher (general news + market analysis)
│   │
│   ├── common/
│   │   └── schemas.py       # Pydantic models for API responses
│   │
│   └── auth/
│       ├── utils.py         # Password hashing (bcrypt) + JWT encode/decode
│       ├── dependencies.py  # get_current_user FastAPI dependency
│       └── router.py        # POST /login, POST /logout, GET /me
│
├── schema.sql               # SQLite schema (users table)
├── seed_admin.py            # CLI script to create the initial admin user
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
                          → MISS (or refresh=true): fetch via appropriate fetcher (concurrent)
                              → RSS: parse XML → normalize → resolve Google News URLs → backfill images
                              → FMP: fetch JSON → normalize (general news or fmp-articles format)
                          → cache result (final, ready-to-serve dicts)
                          → merge all sources
                          → deduplicate (URL match + title keyword overlap)
                          → sort + paginate → Response
```

### Key Patterns

- **SWR caching**: Stale-while-revalidate — fresh data served instantly, stale data served immediately with background refresh, expired data triggers synchronous fetch. Users almost never wait.
- **Startup warmup**: All sources pre-fetched on server start (~25s). First request always hits warm cache.
- **Force refresh**: `?refresh=true` bypasses SWR cache entirely — fetches all sources synchronously.
- **Cache-Control headers**: Middleware sets HTTP headers — articles (5min), categories/sources (24h), refresh (no-store).
- **Structured logging**: JSON for production, text for local dev. Request timing, cache status, per-source fetch duration.
- **In-memory cache**: Articles are transient — cached in a Python dict with per-source TTL (default 15 min). No database storage for articles.
- **SQLite for persistent data only**: Currently just the users table. Articles don't touch the database.
- **Per-source isolation**: One broken feed never crashes the request. Errors are logged, the source is skipped, other sources still return data.
- **Concurrent fetching**: Multiple stale sources are fetched in parallel via `asyncio.gather`.
- **Shared HTTP client**: A single `httpx.AsyncClient` is created on startup and reused for all outbound requests (connection pooling, browser User-Agent).
- **Google News URL resolution**: Google News RSS provides opaque redirect URLs. We decode them to real article URLs via Google's batchexecute API at fetch time, throttled with `asyncio.Semaphore(10)`.
- **Deduplication**: Two-layer dedup after merging all sources — URL exact match + title keyword overlap (0.6 threshold). Prefers articles with images and direct feeds over Google News.

### Adding a New Source

1. Add an entry to `sources.yaml` with `enabled: true`
2. Restart the server
3. That's it — no code changes needed for RSS sources

### Authentication

JWT-based auth with email + password login. Tokens use HS256 (symmetric HMAC) and expire after 24 hours (configurable via `JWT_EXPIRE_MINUTES` in `.env`).

**Creating a user (admin or regular):**
```bash
cd backend
source venv/bin/activate
python seed_admin.py      # Prompts for role, email, name, password
```

**Login flow:**
```
POST /api/v1/auth/login  { email, password }
  → validates credentials
  → tracks failed_login_attempts + last_login
  → returns { access_token, token_type, user }

GET /api/v1/auth/me  (Authorization: Bearer <token>)
  → validates JWT, looks up user, checks is_active
  → returns { id, email, full_name, is_admin }
```

**Protecting routes:** Use the `get_current_user` dependency:
```python
from app.auth.dependencies import get_current_user

@router.get("/protected")
async def protected_route(user: dict = Depends(get_current_user)):
    return {"email": user["email"]}
```

### Source Types

| Type | Fetcher | Status |
|------|---------|--------|
| `rss` | `rss_fetcher.py` | Working (21 sources) |
| `financial_api` | `fmp_fetcher.py` | Working (2 FMP sources) |
| `news_api` | — | Not yet implemented |

## Dependencies

| Package | Purpose |
|---------|---------|
| fastapi + uvicorn | Web framework + ASGI server |
| pydantic-settings | Typed config from .env |
| aiosqlite | Async SQLite (users table) |
| feedparser | RSS/Atom feed parsing |
| httpx | Async HTTP client |
| pyjwt + passlib | JWT auth + password hashing |
| pyyaml | Load sources.yaml |
| python-json-logger | Structured JSON logging for production |
