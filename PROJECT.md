# News Aggregator - Project Documentation

## Overview

A personal news aggregator that pulls from multiple sources (RSS feeds, News APIs, Financial APIs) and presents them through a clean, filterable interface. Built for personal use by the owner and shared with family and friends.

The core idea: a single place to consume news without clickbait, ad overload, and political noise — with the ability to filter by category, sentiment, and source type.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | Python 3.12+ / FastAPI | REST API serving both web and mobile clients |
| **Database/Cache** | SQLite | Lightweight, zero-infrastructure. Used for caching fetched articles and user data |
| **Web Frontend** | Next.js (React) | SSR for link preview support, image optimization, category-based routing |
| **iOS App** | Swift / SwiftUI | Native iOS app with full feature parity to web. Learning exercise — Claude Code does the heavy lifting |
| **Deployment** | DigitalOcean Droplet | Backend deployed alongside other existing projects |

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
       │  │  Cache     │  │
       │  │  (SQLite)  │  │
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
2. **Client requests articles** from FastAPI backend (e.g., `GET /articles?category=tech&sentiment=positive`)
3. **Backend checks cache** — if cached articles exist and TTL has not expired, return cached data
4. **If cache is stale or empty** — backend fetches from configured sources (RSS feeds, News APIs, Financial APIs)
5. **Backend normalizes** all responses into a common article schema
6. **Backend applies deduplication** (URL match + fuzzy title matching)
7. **Backend caches** the normalized articles in SQLite with a timestamp
8. **Backend returns** filtered, sorted articles to the client

**No background jobs.** All fetching is on-demand, triggered by user requests. Cache TTL is configurable (default: 15 minutes).

---

## Authentication

Simple username/password authentication.

- Backend issues a JWT token on successful login
- Token is sent with every subsequent request via `Authorization: Bearer <token>` header
- Both web and iOS clients store the token locally (httpOnly cookie for web, Keychain for iOS)
- Single user initially, with the ability to add more users later (family/friends)
- Registration is invite-only or admin-created (no public signup)

---

## Data Model

### Article (Core Entity)

```python
{
    "id": str,                  # Unique identifier (generated hash of URL)
    "title": str,               # Article headline
    "summary": str,             # Short description or first paragraph
    "content": str | None,      # Full article content (extracted for reader view)
    "url": str,                 # Original source URL
    "image_url": str | None,    # Thumbnail/hero image
    "source_name": str,         # e.g., "Ars Technica", "Good News Network"
    "source_type": str,         # "rss" | "api" | "financial"
    "category": str,            # See categories below
    "sentiment": float | None,  # -1.0 to 1.0 (from API, or null if unavailable)
    "tags": list[str],          # Keywords, tickers, etc.
    "published_at": datetime,   # When the article was published
    "cached_at": datetime       # When we fetched/cached it
}
```

### Categories

- `all` — Everything, unfiltered
- `feel_good` — Curated positive/uplifting news
- `science` — Science & discovery
- `tech` — Technology & gadgets
- `entertainment` — Culture, movies, music, gaming
- `finance` — Markets, stocks, business (powered by AV/FMP)
- `health` — Health & wellness
- `sports` — Sports news
- `offbeat` — Weird, wonderful, unusual stories

Categories are assigned based on source configuration. A single source maps to one primary category. Articles from general news APIs may be tagged based on API-provided categories.

### Source Configuration

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
    "cache_ttl_minutes": int        # Per-source cache TTL override (default: 15)
}
```

### User

```python
{
    "id": str,
    "username": str,
    "password_hash": str,
    "created_at": datetime
}
```

---

## Source Registry

Sources are defined in a YAML configuration file (`sources.yaml`). This makes it easy to add, remove, or toggle sources without code changes.

### Initial Sources

#### RSS Feeds — Curated Positive/Good News
| Source | RSS URL | Category |
|--------|---------|----------|
| Good News Network | `https://www.goodnewsnetwork.org/feed/` | feel_good |
| Positive News | `https://positive.news/feed` | feel_good |
| Sunny Skyz | `https://www.sunnyskyz.com/feed/rss` | feel_good |
| BBC Uplifting | `https://feeds.bbci.co.uk/news/topics/cx2pk703/rss.xml` | feel_good |
| DailyGood | `https://www.dailygood.org/rss/dgood.xml` | feel_good |

#### RSS Feeds — Science & Discovery
| Source | RSS URL | Category |
|--------|---------|----------|
| Ars Technica - Science | `https://feeds.arstechnica.com/arstechnica/science` | science |
| NASA Breaking News | `https://www.nasa.gov/rss/dyn/breaking_news.rss` | science |
| New Scientist | `https://www.newscientist.com/feed/home/` | science |
| Scientific American | `https://rss.sciam.com/ScientificAmerican-Global` | science |

#### RSS Feeds — Technology
| Source | RSS URL | Category |
|--------|---------|----------|
| The Verge | `https://www.theverge.com/rss/index.xml` | tech |
| Wired | `https://www.wired.com/feed/rss` | tech |
| Ars Technica - Tech | `https://feeds.arstechnica.com/arstechnica/technology-lab` | tech |
| Engadget | `https://www.engadget.com/rss.xml` | tech |

#### RSS Feeds — Offbeat / Weird / Fun
| Source | RSS URL | Category |
|--------|---------|----------|
| Atlas Obscura | `https://www.atlasobscura.com/feeds/latest` | offbeat |

#### RSS Feeds — Entertainment
| Source | RSS URL | Category |
|--------|---------|----------|
| A.V. Club | `https://www.avclub.com/rss` | entertainment |
| Polygon | `https://www.polygon.com/rss/index.xml` | entertainment |

#### RSS Feeds — Google News (Free, Unlimited, No API Key)
| Source | RSS URL | Category |
|--------|---------|----------|
| Google News - Science | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en` | science |
| Google News - Technology | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pIUWlnQVAB?hl=en-US&gl=US&ceid=US:en` | tech |
| Google News - Entertainment | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en` | entertainment |
| Google News - Health | `https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en` | health |
| Google News - Sports | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en` | sports |

#### News APIs
| Source | API | Category | Free Tier |
|--------|-----|----------|-----------|
| WorldNewsAPI | `https://api.worldnewsapi.com/search-news` | all (sentiment-filterable) | 500 req/day |

WorldNewsAPI is the primary API source because of its built-in sentiment scoring (`min-sentiment` parameter). This powers the "feel good" filter for mainstream news sources.

#### Financial APIs (Existing Subscriptions)
| Source | API | Category | Notes |
|--------|-----|----------|-------|
| Alpha Vantage | Various endpoints | finance | Premium subscription — stock news, market data |
| Financial Modeling Prep | Various endpoints | finance | Premium subscription — financial news, company data |

**Note:** Specific AV and FMP endpoints and data presentation (headlines only, with tickers, watchlist support, etc.) are TBD — to be refined during development.

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
GET    /api/v1/articles/:id        # Get single article with full content (reader view)
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
            "id": "abc123",
            "title": "Scientists Discover New Species in Deep Ocean",
            "summary": "A team of marine biologists...",
            "url": "https://source.com/article",
            "image_url": "https://source.com/image.jpg",
            "source_name": "New Scientist",
            "category": "science",
            "sentiment": 0.7,
            "tags": ["marine biology", "discovery"],
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
GET    /api/v1/articles/:id/content    # Extract and return clean article content
```

This endpoint uses content extraction (e.g., `newspaper3k` or `readability-lxml`) to fetch the full article from the source URL and return a clean, readable version stripped of ads, navigation, and clutter.

---

## Reader View

When a user taps/clicks an article, instead of opening the original (often ad-heavy) source URL, the app renders a clean reading experience within the app itself.

**How it works:**
1. User selects an article
2. Client calls `GET /api/v1/articles/:id/content`
3. Backend fetches the full page from the article's source URL
4. Backend extracts the main article content using a content extraction library
5. Returns clean HTML/text content, along with metadata (title, author, publish date, estimated read time)
6. Client renders the content in a clean, distraction-free reading layout

**Fallback:** If content extraction fails (paywalled, anti-scraping, etc.), the app falls back to opening the original URL in an in-app browser.

---

## Caching Strategy

- **Cache layer:** SQLite table storing normalized articles with a `cached_at` timestamp
- **Default TTL:** 15 minutes (configurable per-source in `sources.yaml`)
- **Cache key:** Combination of source ID + category + any filter parameters
- **On request:**
  1. Check if cached results exist for the requested filters
  2. If `cached_at + ttl > now`, return cached data
  3. If stale, fetch fresh data from sources, normalize, deduplicate, cache, and return
- **Cache eviction:** Articles older than 24 hours are purged on next fetch cycle (lazy cleanup)
- **No background jobs** — all fetching and cache management is triggered by user requests

---

## Deduplication

Multiple sources will cover the same story. Before caching, the backend deduplicates using:

1. **URL match** — Exact URL comparison (primary check)
2. **Fuzzy title match** — If titles are >85% similar (using a string similarity library like `rapidfuzz`), treat as duplicate
3. **On duplicate:** Keep the version from the higher-priority source (source priority defined in `sources.yaml`)

---

## Project Structure

```
news-aggregator/
├── README.md
├── PROJECT.md                      # This file
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # App configuration, env vars
│   │   ├── database.py             # SQLite connection and setup
│   │   │
│   │   ├── auth/
│   │   │   ├── __init__.py
│   │   │   ├── router.py           # Auth endpoints
│   │   │   ├── models.py           # User model
│   │   │   └── utils.py            # JWT, password hashing
│   │   │
│   │   ├── articles/
│   │   │   ├── __init__.py
│   │   │   ├── router.py           # Article endpoints
│   │   │   ├── models.py           # Article model
│   │   │   ├── service.py          # Business logic — fetch, cache, filter
│   │   │   └── reader.py           # Content extraction for reader view
│   │   │
│   │   ├── sources/
│   │   │   ├── __init__.py
│   │   │   ├── router.py           # Source/category endpoints
│   │   │   ├── registry.py         # Load and manage source configs
│   │   │   ├── rss_fetcher.py      # RSS feed parser
│   │   │   ├── news_api_fetcher.py # WorldNewsAPI client
│   │   │   └── finance_fetcher.py  # Alpha Vantage + FMP client
│   │   │
│   │   └── common/
│   │       ├── __init__.py
│   │       ├── schemas.py          # Pydantic schemas (shared)
│   │       └── dedup.py            # Deduplication logic
│   │
│   ├── sources.yaml                # Source registry configuration
│   ├── requirements.txt
│   ├── .env.example                # Template for environment variables
│   └── Dockerfile
│
├── web/
│   ├── src/
│   │   ├── app/                    # Next.js app router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Home / article feed
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── article/
│   │   │       └── [id]/
│   │   │           └── page.tsx    # Reader view
│   │   │
│   │   ├── components/
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── ArticleFeed.tsx
│   │   │   ├── CategoryFilter.tsx
│   │   │   ├── SentimentToggle.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── ReaderView.tsx
│   │   │   └── Navbar.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts              # API client for FastAPI backend
│   │   │   └── auth.ts             # Auth helpers, token management
│   │   │
│   │   └── types/
│   │       └── index.ts            # TypeScript type definitions
│   │
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
│
├── ios/
│   ├── NewsAggregator/
│   │   ├── NewsAggregatorApp.swift     # App entry point
│   │   ├── ContentView.swift
│   │   │
│   │   ├── Models/
│   │   │   ├── Article.swift
│   │   │   ├── Category.swift
│   │   │   └── User.swift
│   │   │
│   │   ├── Views/
│   │   │   ├── Feed/
│   │   │   │   ├── ArticleFeedView.swift
│   │   │   │   ├── ArticleCardView.swift
│   │   │   │   └── CategoryFilterView.swift
│   │   │   │
│   │   │   ├── Reader/
│   │   │   │   └── ReaderView.swift
│   │   │   │
│   │   │   ├── Auth/
│   │   │   │   └── LoginView.swift
│   │   │   │
│   │   │   └── Components/
│   │   │       ├── SentimentToggle.swift
│   │   │       └── SearchBar.swift
│   │   │
│   │   ├── Services/
│   │   │   ├── APIClient.swift         # HTTP client for FastAPI backend
│   │   │   ├── AuthService.swift       # Login, token storage (Keychain)
│   │   │   └── ArticleService.swift    # Article fetching and caching
│   │   │
│   │   └── Utilities/
│   │       └── Constants.swift         # API base URL, config
│   │
│   └── NewsAggregator.xcodeproj/
│
└── docker-compose.yml              # Backend + Web for deployment
```

---

## Environment Variables

```bash
# Backend
SECRET_KEY=<jwt-secret-key>
DATABASE_URL=sqlite:///./news_aggregator.db
WORLD_NEWS_API_KEY=<your-key>
ALPHA_VANTAGE_API_KEY=<your-key>
FMP_API_KEY=<your-key>
CACHE_TTL_MINUTES=15

# Web Frontend
NEXT_PUBLIC_API_URL=https://your-api-domain.com/api/v1
```

---

## Deployment

### Backend + Web (DigitalOcean Droplet)

- **Backend:** FastAPI running via `uvicorn`, behind a reverse proxy (nginx or caddy)
- **Web:** Next.js running via `next start`, behind the same reverse proxy
- **Docker Compose** orchestrates both services
- SQLite database file lives on the droplet's filesystem
- API keys stored as environment variables on the droplet

### iOS App

- Built and tested locally via Xcode
- Distributed via TestFlight for family/friends (requires Apple Developer account — $99/year)
- Points to the same backend API as the web app

---

## TBD — To Be Decided During Development

These items were deliberately left open to be figured out during the build:

1. **Default view / sorting** — What the user sees when they first open the app (all news sorted by recency? top stories? curated mix?)
2. **Financial news specifics** — Which AV and FMP endpoints to use, what data to display (headlines only, stock price alongside, watchlist of tickers, etc.)
3. **Political news filter** — How aggressive the "hide political news" toggle should be (keyword blocklist, sentiment-based, or something smarter)
4. **App/website brand name** — Project is `news-aggregator` for now. Brand name, domain, and App Store name TBD
5. **Source priority ranking** — When duplicates are found, which source wins? Needs a priority order.
6. **Additional sources** — The initial source list is a starting point. More can be added to `sources.yaml` at any time.

---

## Development Approach

- **Claude Code** will be the primary development tool, used from VS Code terminal on macOS
- Build order recommendation:
  1. **Backend first** — FastAPI with a few RSS sources, caching, and article endpoint. Get data flowing.
  2. **Web frontend** — Next.js consuming the backend API. Get the feed rendering with filters.
  3. **iOS app** — SwiftUI consuming the same backend API. Full feature parity with web.
- Iterate: start with 3-5 sources, get end-to-end working, then expand sources and features
