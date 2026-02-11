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
| GET | `/api/v1/sources` | List all configured sources |
| GET | `/api/v1/categories` | List categories with source counts |
| POST | `/api/v1/auth/login` | Login, returns JWT *(not yet implemented)* |
| GET | `/api/v1/auth/me` | Get current user *(not yet implemented)* |

### Article Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | `all` | Filter: science, tech, feel_good, etc. |
| `source` | string | — | Filter by source ID (e.g., `the-verge`) |
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 50) |

## Folder Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI entry point, lifespan, router wiring
│   ├── config.py            # Settings from .env via pydantic-settings
│   ├── database.py          # SQLite connection (users only)
│   ├── cache.py             # In-memory article cache with per-source TTL
│   │
│   ├── articles/
│   │   ├── router.py        # GET /api/v1/articles endpoint
│   │   └── service.py       # Orchestrates cache + fetching + merging
│   │
│   ├── sources/
│   │   ├── registry.py      # Loads sources.yaml, provides query helpers
│   │   ├── router.py        # GET /api/v1/sources, /categories endpoints
│   │   └── rss_fetcher.py   # RSS feed fetcher + normalization
│   │
│   ├── common/
│   │   └── schemas.py       # Pydantic models for API responses
│   │
│   └── auth/                # Authentication (not yet implemented)
│
├── schema.sql               # SQLite schema (users table)
├── sources.yaml             # Source registry — all news sources configured here
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
└── venv/                    # Python virtual environment (gitignored)
```

## Architecture Notes

### Data Flow

```
Request → Article Service → check cache per source
                          → if stale: fetch via rss_fetcher (concurrent)
                          → cache result
                          → merge + sort + paginate → Response
```

### Key Patterns

- **On-demand fetching**: No background jobs. Articles are fetched when a user requests them.
- **In-memory cache**: Articles are transient — cached in a Python dict with per-source TTL (default 15 min). No database storage for articles.
- **SQLite for persistent data only**: Currently just the users table. Articles don't touch the database.
- **Per-source isolation**: One broken feed never crashes the request. Errors are logged, the source is skipped, other sources still return data.
- **Concurrent fetching**: Multiple stale sources are fetched in parallel via `asyncio.gather`.
- **Shared HTTP client**: A single `httpx.AsyncClient` is created on startup and reused for all outbound requests (connection pooling).

### Adding a New Source

1. Add an entry to `sources.yaml` with `enabled: true`
2. Restart the server
3. That's it — no code changes needed for RSS sources

### Source Types

| Type | Fetcher | Status |
|------|---------|--------|
| `rss` | `rss_fetcher.py` | Working |
| `news_api` | `news_api_fetcher.py` | Not yet implemented |
| `financial_api` | `finance_fetcher.py` | Not yet implemented |

## Dependencies

| Package | Purpose |
|---------|---------|
| fastapi + uvicorn | Web framework + ASGI server |
| pydantic-settings | Typed config from .env |
| aiosqlite | Async SQLite (users table) |
| feedparser | RSS/Atom feed parsing |
| httpx | Async HTTP client |
| pyjwt + passlib | JWT auth + password hashing |
| rapidfuzz | Fuzzy string matching (deduplication) |
| pyyaml | Load sources.yaml |
