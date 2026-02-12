# Current State

**Last Updated**: February 12, 2026

## Status: Live at getclearnews.com | iOS App built | Performance optimized

Backend, web frontend, deployment, and iOS app are complete. Site is live on DigitalOcean. Backend has structured logging, SWR caching, startup warmup, and thread pool offloading for all CPU-bound operations. Web and iOS have pull-to-refresh with force cache bypass. Deploy script auto-cleans Docker build cache. iOS app pending App Store submission.

## What's Built

### Backend (FastAPI) — v1.3.0
- **Project scaffolding** — directory structure, venv, config, SQLite database
- **Source registry** — 24 sources defined in sources.yaml (21 RSS + 2 FMP enabled, 1 API-based disabled), pydantic models, load/query helpers
- **SWR article cache** — stale-while-revalidate: fresh (< TTL) returns instantly, stale (TTL to 4x TTL) serves immediately + background refresh, expired/missing fetches synchronously. Per-source TTL (default 15 min). Force refresh via `?refresh=true` query param.
- **Startup cache warmup** — all 23 sources pre-fetched as background task on server start (~25s). First user request hits warm cache.
- **Cache-Control headers** — middleware sets HTTP cache headers: articles (5min), categories/sources (24h), refresh requests (no-store)
- **Thread pool offloading** — all CPU-bound operations offloaded to Python thread pool via `asyncio.to_thread()`: reader content extraction (readability + trafilatura), feedparser XML parsing, article deduplication, bcrypt password verification. Event loop stays free for concurrent request handling.
- **Structured logging** — JSON format for production, text for local dev (`LOG_FORMAT` env var). Request timing middleware with unique request IDs. Per-source fetch timing. Cache HIT/STALE/MISS logging.
- **RSS fetcher** — async fetch via httpx, parse with feedparser (thread pool), normalize (images, dates, summaries), concurrent multi-source fetching, og:image fallback for feeds without embedded images, Google News URL resolver (decodes redirect URLs to real article URLs via batchexecute API)
- **FMP fetcher** — fetches financial news from FMP API (general-latest + fmp-articles endpoints), normalizes both response formats, HTML stripping for article content
- **Article service** — orchestration layer: SWR cache checks → concurrent fetch → merge → deduplicate (thread pool) → sort → filter → paginate
- **Reader view** — `GET /api/v1/articles/reader?url=` extracts clean article content using readability-lxml (primary) + trafilatura (fallback) via thread pool, sanitizes HTML, caches for 60 minutes. Graceful failure for paywalled sites.
- **Deduplication** — URL exact match + title keyword overlap (0.6 threshold), O(1) set-based removal tracking, prefers articles with images and direct feeds over Google News (~33 dupes removed per cycle)
- **Keyword search** — case-insensitive search on title/summary, composes with all filters
- **Authentication** — email/password login with JWT (HS256), bcrypt password hashing (thread pool), protected route dependency, seed script for admin/regular users
- **Production-ready** — configurable DB path and CORS origins via env vars

### Web Frontend (Next.js) — v1.2.0
- **Layout** — sticky header (ClearNews logo, search, refresh button, dark mode toggle, user menu), wrapping category pill tabs
- **Article feed** — responsive card grid (1/2/3 cols), infinite scroll, skeleton loading, broken image fallback
- **Refresh button** — header icon triggers force refresh from backend (bypasses cache)
- **Fetch timeout** — 15-second timeout on all API calls via AbortController
- **Error handling** — retry button on errors, timeout-specific messaging ("Taking longer than expected"), slow-loading hint after 3s ("Fetching fresh articles...")
- **Smooth transitions** — category/search changes keep previous articles visible while new data loads (no flash of empty state)
- **Reader view** — in-app article reading via full-screen modal overlay. Feed stays mounted underneath for instant back navigation. Content extraction from backend, skeleton loading, fallback for paywalled sites. Escape key and browser back close the modal.
- **Filters** — category tabs, debounced keyword search (400ms), race condition handling
- **Dark mode** — class-based Tailwind, localStorage persistence, OS preference detection, no flash on load
- **Authentication** — login page, JWT in localStorage, conditional UI (user dropdown with logout)

### iOS App (SwiftUI) — v1.2.0
- **Article feed** — article cards with AsyncImage, LazyVStack, infinite scroll sentinel, pull-to-refresh (sends `refresh=true` to backend for genuinely fresh data), shimmer skeleton loading
- **Categories** — horizontal scroll capsule pills, filter articles by category
- **Search** — `.searchable` with 400ms debounce via `.task(id:)`, composes with category filter
- **Reader view** — WKWebView rendering extracted HTML content, dark mode CSS, responsive images, external links open in Safari, font size control, fallback for paywalled sites with "Read on {source}" button
- **Settings** — theme picker (system/light/dark), reader font size (S/M/L/XL), about page, all persisted via UserDefaults
- **Authentication** — JWT stored in Keychain, login form, auto-validates saved token on launch, sign out
- **Architecture** — @Observable services, .environment() injection, singleton APIClient, zero external packages
- **Polish** — shared ErrorView/EmptyStateView, RelativeTimeText ("2h ago"), 4-state views (loading/success/error/empty), stale request tracking
- **26 Swift files**, 0 external dependencies

### Deployment Infrastructure — v0.3.0
- **Docker** — Dockerfiles for backend (Python 3.12) and frontend (Next.js standalone), docker-compose.prod.yml
- **Nginx** — host-level reverse proxy with SSL termination, rate limiting (auth: 5/min, general: 10/sec)
- **Scripts** — setup.sh, setup-ssl.sh, setup-firewall.sh (UFW + fail2ban), deploy.sh (with auto Docker cleanup), stream-logs.sh
- **Security** — non-root container users, rate limiting, firewall, fail2ban, security headers, HSTS
- **Docker cleanup** — deploy.sh auto-prunes old images and build cache after each deploy to prevent disk bloat

### API Endpoints (all working)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1/articles` | No | Fetch articles (category, source, search, pagination, refresh) |
| GET | `/api/v1/articles/reader` | No | Extract clean article content for reader view |
| GET | `/api/v1/sources` | No | List configured sources |
| GET | `/api/v1/categories` | No | List categories with counts (hides empty) |
| POST | `/api/v1/auth/login` | No | Login, returns JWT |
| POST | `/api/v1/auth/logout` | No | Logout (client-side) |
| GET | `/api/v1/auth/me` | Yes | Current user profile |

### Sources (23 of 24 enabled)
| Category | Sources | Count |
|----------|---------|-------|
| Feel Good | Good News Network, Positive News, Sunny Skyz, BBC Uplifting, DailyGood | 5 |
| Science | Ars Technica Science, NASA, New Scientist, Scientific American, Google News Science | 5 |
| Technology | The Verge, Wired, Ars Technica Tech, Engadget, Google News Tech | 5 |
| Entertainment | A.V. Club, Polygon, Google News Entertainment | 3 |
| Finance | FMP - Financial News, FMP - Market Analysis | 2 |
| Health | Google News Health | 1 |
| Sports | Google News Sports | 1 |
| Offbeat | Atlas Obscura | 1 |

**Disabled** (require API keys): WorldNewsAPI

## What's Next

See NOW.md for current priorities and future enhancements.
