# News Aggregator - Project Documentation

## Overview

A personal news aggregator that pulls from multiple sources (RSS feeds, News APIs, Financial APIs) and presents them through a clean, filterable interface. Built for personal use by the owner and shared with family and friends.

The core idea: a single place to consume news without clickbait, ad overload, and political noise — with the ability to filter by category, sentiment, and source type.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | Python 3.12+ / FastAPI | REST API serving both web and mobile clients |
| **Database** | SQLite | Users and persistent data only |
| **Article Cache** | In-memory (Python dict) | Transient article cache with per-source TTL |
| **Web Frontend** | Next.js 16 (React 19) / Tailwind CSS v4 | Standalone output for Docker, dark mode, infinite scroll |
| **iOS App** | Swift / SwiftUI | Native iOS app with full feature parity to web |
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
       │  ┌───────────┐  │
       │  │  SQLite    │  │
       │  │  (users)   │  │
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
4. **If cache is stale or empty** — backend fetches from configured sources (RSS feeds, News APIs, Financial APIs)
5. **Backend normalizes** all responses into a common article structure
6. **For Google News sources**: backend resolves opaque redirect URLs to real article URLs via Google's batchexecute API
7. **Backend backfills missing images** by fetching og:image from article pages
8. **Backend caches** the fully enriched articles in memory with a timestamp
9. **Backend applies deduplication** (URL exact match + title keyword overlap at 0.6 threshold)
10. **Backend returns** filtered, sorted articles to the client

**No background jobs.** All fetching is on-demand, triggered by user requests. Cache TTL is configurable per-source (default: 15 minutes). On server restart, cache is empty — first request triggers fresh fetches.

---

## Authentication

Email/password authentication with JWT tokens.

- Backend issues a JWT token on successful login
- Token is sent with every subsequent request via `Authorization: Bearer <token>` header
- Both web and iOS clients store the token locally (httpOnly cookie for web, Keychain for iOS)
- Single user initially, with the ability to add more users later (family/friends)
- Registration is invite-only or admin-created (no public signup)
- User table tracks: email, password_hash, full_name, is_admin, is_active, failed_login_attempts, last_login

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
- `feel_good` — Curated positive/uplifting news
- `science` — Science & discovery
- `tech` — Technology & gadgets
- `entertainment` — Culture, movies, music, gaming
- `finance` — Markets, stocks, business (powered by FMP)
- `health` — Health & wellness
- `sports` — Sports news
- `offbeat` — Weird, wonderful, unusual stories

Categories are assigned based on source configuration. A single source maps to one primary category.

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

### User (SQLite — Persistent)

```sql
users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_admin BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    failed_login_attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
)
```

---

## Source Registry

Sources are defined in `backend/sources.yaml`. This makes it easy to add, remove, or toggle sources without code changes.

**Current sources:** 24 total (21 RSS feeds, 1 News API, 2 Financial APIs). 23 enabled, 1 disabled (WorldNewsAPI). See `backend/sources.yaml` for the full list with URLs.

**Source types and how they're fetched:**
- **RSS** (`type: rss`) — Parsed with `feedparser`. One fetcher handles all RSS feeds with normalization for field variations (images, dates, summaries differ across feeds).
- **News API** (`type: news_api`) — WorldNewsAPI. Not yet implemented (disabled).
- **Financial API** (`type: financial_api`) — FMP (Financial Modeling Prep). Two endpoints: general-latest (aggregated news from WSJ, CNBC, Bloomberg) and fmp-articles (FMP's own market analysis). Dedicated fetcher (`fmp_fetcher.py`).

---

## API Design

### Base URL
```
/api/v1
```

### Authentication Endpoints

```
POST   /api/v1/auth/login          # Login, returns JWT
POST   /api/v1/auth/logout         # Invalidate token
GET    /api/v1/auth/me             # Get current user info
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
| `sentiment` | string | `null` | `positive`, `negative`, `neutral`, or null for all |
| `source` | string | `null` | Filter by specific source ID |
| `search` | string | `null` | Keyword search in title/summary |
| `page` | int | `1` | Pagination |
| `per_page` | int | `20` | Items per page (max 50) |
| `sort` | string | `published_at` | Sort field |
| `order` | string | `desc` | `asc` or `desc` |

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
    }
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

- **Cache layer:** In-memory Python dict (not SQLite — articles are transient)
- **Cache key:** Source ID
- **Default TTL:** 15 minutes (configurable per-source in `sources.yaml`)
- **On request:**
  1. Find enabled sources for the requested category
  2. For each source, check if cached articles exist and are fresh
  3. If fresh, use cached data
  4. If stale/missing, fetch from source, normalize, cache, return
- **No eviction logic needed** — stale entries are overwritten on next fetch
- **Server restart** = empty cache = first request fetches fresh data
- **No background jobs** — all fetching and cache management is triggered by user requests

---

## Deduplication

Multiple sources cover the same story (especially Google News, which aggregates articles from publishers we also follow directly). After merging all sources and before sorting, the backend deduplicates using:

1. **URL exact match** — Same article from multiple sources (e.g., Ars Technica direct feed + Google News both resolve to the same URL)
2. **Title keyword overlap** — Extracts significant keywords from titles (after stripping stop words and possessives). If keyword overlap ratio >= 0.6 (relative to the smaller keyword set), treated as duplicate.
3. **Priority when keeping:** Prefer articles with images > without. Prefer direct feeds > Google News aggregates.

Implementation: `app/articles/service.py` — `_deduplicate()` function. No external dependencies (uses stdlib `re` for keyword extraction).

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
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # App configuration, env vars
│   │   ├── database.py             # SQLite connection and setup (users only)
│   │   ├── cache.py                # In-memory article cache
│   │   │
│   │   ├── auth/
│   │   │   ├── router.py           # Auth endpoints
│   │   │   ├── models.py           # User model
│   │   │   └── utils.py            # JWT, password hashing
│   │   │
│   │   ├── articles/
│   │   │   ├── router.py           # Article endpoints
│   │   │   ├── service.py          # Business logic — fetch, cache, filter
│   │   │   └── reader.py           # Content extraction for reader view
│   │   │
│   │   ├── sources/
│   │   │   ├── router.py           # Source/category endpoints
│   │   │   ├── registry.py         # Load and manage source configs
│   │   │   ├── rss_fetcher.py      # RSS feed parser + Google News URL resolver + og:image backfill
│   │   │   └── fmp_fetcher.py      # FMP financial API fetcher (general news + market analysis)
│   │   │
│   │   └── common/
│   │       └── schemas.py          # Pydantic schemas (API response shapes)
│   │
│   ├── schema.sql                  # SQLite schema (users table only)
│   ├── sources.yaml                # Source registry configuration
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── web/                            # Next.js web frontend
├── ios/                            # SwiftUI iOS app (planned)
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
SECRET_KEY=<jwt-secret-key>
DATABASE_URL=sqlite:///./news_aggregator.db
FMP_API_KEY=<your-key>
WORLD_NEWS_API_KEY=<your-key>              # Optional — not yet integrated
CACHE_TTL_MINUTES=15

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
- **Database**: SQLite bind-mounted to `/opt/app/data/` for persistence
- **Security**: UFW firewall, fail2ban, rate limiting, non-root container users, security headers

```
Internet → Nginx (SSL + rate limiting)
              ├── /api/* → Backend container (port 8000)
              └── /*     → Frontend container (port 3000)
```

See [deployment/README.md](deployment/README.md) for setup and deploy instructions.

### iOS App (planned)

- Built and tested locally via Xcode
- Distributed via TestFlight for family/friends (requires Apple Developer account — $99/year)
- Points to the same backend API as the web app

---

## TBD — To Be Decided

1. **Political news filter** — How aggressive the "hide political news" toggle should be

### Resolved
- **Brand name**: ClearNews (getclearnews.com)
- **Default view**: All categories, sorted by published_at descending, 20 per page with infinite scroll
- **Financial news**: FMP API — general-latest (WSJ/CNBC/Bloomberg aggregation) + fmp-articles (market analysis). Alpha Vantage removed.
- **Source priority ranking**: Dedup prefers articles with images > without, direct feeds > Google News aggregates
- **Reader view**: URL-based extraction via readability-lxml + trafilatura, modal overlay on frontend
