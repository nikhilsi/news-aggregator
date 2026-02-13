# Current State

**Last Updated**: February 13, 2026

## Status: Live at getclearnews.com | iOS build in TestFlight beta review | 41 sources across 13 categories

Backend, web frontend, deployment, and iOS app are complete. Site is live on DigitalOcean. Backend has text logging, SWR caching (24h stale window), progressive cold-cache response (3s deadline), startup warmup (~11s), thread pool offloading, two-tier article sorting, and 41 enabled sources across 13 categories. Web and iOS have pull-to-refresh with force cache bypass and auto-retry on partial data. Deploy script auto-cleans Docker build cache. iOS app hardened for App Store (auth removed, privacy manifest added, accessibility labels, force-unwrap crashes fixed). Privacy policy and support pages live at getclearnews.com. Build v1.0 uploaded to App Store Connect as "GetClearNews", all metadata pushed via API, TestFlight submitted for beta review with 3 testers.

## What's Built

### Backend (FastAPI) — v1.6.0
- **Project scaffolding** — directory structure, venv, config, SQLite database
- **Source registry** — 48 sources in sources.yaml (39 RSS + 2 FMP enabled, 7 disabled), pydantic models, load/query helpers. Category list and source list both defined in sources.yaml.
- **SWR article cache** — stale-while-revalidate: fresh (< TTL) returns instantly, stale (TTL to 96x TTL, ~24h) serves immediately + background refresh, expired/missing fetches with 3s deadline (progressive response). Per-source TTL (default 15 min). Force refresh via `?refresh=true` query param.
- **Progressive cold-cache response** — on cache MISS, uses `asyncio.wait` with a 3-second deadline. Returns whatever sources completed within the deadline (`complete: false`), remaining sources continue in background. Clients auto-retry after 3s to get the full set.
- **Startup cache warmup** — all 41 sources pre-fetched as background task on server start (~11s). First user request hits warm cache.
- **Cache-Control headers** — middleware sets HTTP cache headers: articles (5min), categories/sources (5min), refresh requests (no-store)
- **Thread pool offloading** — all CPU-bound operations offloaded to Python thread pool via `asyncio.to_thread()`: reader content extraction (readability + trafilatura), feedparser XML parsing, article deduplication, bcrypt password verification. Event loop stays free for concurrent request handling.
- **Text logging** — human-readable text format for all environments. Request timing middleware with unique request IDs. Per-source fetch timing. Cache HIT/STALE/MISS logging.
- **RSS fetcher** — async fetch via httpx, parse with feedparser (thread pool), normalize (images, dates, summaries), concurrent multi-source fetching, og:image fallback for feeds without embedded images
- **FMP fetcher** — fetches financial news from FMP API (general-latest + fmp-articles endpoints), normalizes both response formats, HTML stripping for article content. Reads API key from pydantic settings with os.environ fallback.
- **Article service** — orchestration layer: SWR cache checks → concurrent fetch → merge → deduplicate (thread pool) → two-tier sort → filter → paginate
- **Two-tier sorting** — "All" tab: 1 per source capped at 3 per category in tier 1, rest chronological. Category tabs: top 5 per source in tier 1, rest chronological. No articles discarded.
- **Reader view** — `GET /api/v1/articles/reader?url=` extracts clean article content using readability-lxml (primary) + trafilatura (fallback) via thread pool, sanitizes HTML, caches for 60 minutes. Graceful failure for paywalled sites.
- **Deduplication** — URL exact match (global) + title keyword overlap (0.6 threshold, bucketed by category). O(1) set-based removal tracking, prefers articles with images (~105 dupes removed per cycle with 41 sources)
- **Keyword search** — case-insensitive search on title/summary, composes with all filters
- **Authentication** — email/password login with JWT (HS256), bcrypt password hashing (thread pool), protected route dependency, seed script for admin/regular users
- **Production-ready** — configurable DB path and CORS origins via env vars

### Web Frontend (Next.js) — v1.6.0
- **Layout** — sticky header (ClearNews logo, search, refresh button, dark mode toggle, user menu), wrapping category pill tabs
- **Article feed** — responsive card grid (1/2/3 cols), infinite scroll, skeleton loading, broken image fallback
- **Refresh button** — header icon triggers force refresh from backend (bypasses cache)
- **Fetch timeout** — 15-second timeout on all API calls via AbortController
- **Error handling** — retry button on errors, timeout-specific messaging ("Taking longer than expected"), slow-loading hint after 3s ("Fetching fresh articles...")
- **Smooth transitions** — category/search changes keep previous articles visible while new data loads (no flash of empty state)
- **Reader view** — in-app article reading via full-screen modal overlay. Feed stays mounted underneath for instant back navigation. Content extraction from backend, skeleton loading, fallback for paywalled sites. Escape key and browser back close the modal.
- **Auto-retry on partial data** — when backend returns `complete: false` (cold cache), useArticles hook silently re-fetches after 3 seconds to get the full article set
- **Filters** — category tabs, debounced keyword search (400ms), race condition handling
- **Dark mode** — class-based Tailwind, localStorage persistence, OS preference detection, no flash on load
- **Authentication** — login page, JWT in localStorage, conditional UI (user dropdown with logout)

### iOS App (SwiftUI) — v1.7.0
- **Article feed** — article cards with AsyncImage, LazyVStack, infinite scroll sentinel, pull-to-refresh (sends `refresh=true` to backend for genuinely fresh data), shimmer skeleton loading
- **Categories** — horizontal scroll capsule pills, filter articles by category
- **Search** — `.searchable` with 400ms debounce via `.task(id:)`, composes with category filter
- **Reader view** — WKWebView rendering extracted HTML content, dark mode CSS, responsive images, external links open in Safari, font size control, fallback for paywalled sites with "Read on {source}" button
- **Share** — native iOS share sheet from article card footer and reader toolbar (ShareLink with article URL + title)
- **Settings** — theme picker (system/light/dark), reader font size (S/M/L/XL), about page with content attribution and links to privacy/support pages, all persisted via UserDefaults
- **Architecture** — @Observable services, .environment() injection, singleton APIClient, zero external packages
- **Dynamic Type** — all text uses semantic fonts (.headline, .subheadline, .caption), padding/icon sizes scale via @ScaledMetric
- **Haptic feedback** — light impact on article card tap and category pill selection
- **Auto-retry on partial data** — when backend returns `complete: false` (cold cache), ArticleService silently re-fetches after 3 seconds to get the full article set
- **Accessibility** — labels on share buttons, reader toolbar buttons, combined accessibility elements on error/empty states, decorative icons hidden
- **Privacy manifest** — PrivacyInfo.xcprivacy declares UserDefaults usage (CA92.1), no tracking, no collected data types
- **Polish** — shared ErrorView/EmptyStateView, RelativeTimeText ("2h ago"), 4-state views (loading/success/error/empty), stale request tracking
- **22 Swift files**, 0 external dependencies, deployment target iOS 17.0

### Deployment Infrastructure — v0.3.0
- **Docker** — Dockerfiles for backend (Python 3.12) and frontend (Next.js standalone), docker-compose.prod.yml
- **Nginx** — host-level reverse proxy with SSL termination, rate limiting (auth: 5/min, general: 10/sec), static pages for privacy policy and support
- **Static pages** — privacy policy (`/privacy`) and support/FAQ (`/support`) served directly by nginx as static HTML (dark mode aware)
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

### Sources (41 of 48 enabled)
| Category | Sources | Count |
|----------|---------|-------|
| General | AP News, Fox News | 2 |
| Local (Seattle) | GeekWire, Seattle Eater, MyNorthwest, Crosscut | 4 |
| Feel Good | Good News Network, Positive News, Sunny Skyz, BBC Uplifting, DailyGood | 5 |
| Science | Ars Technica Science, NASA, New Scientist, Scientific American | 4 |
| Technology | The Verge, Wired, Ars Technica Tech, Engadget | 4 |
| Entertainment | A.V. Club, Polygon, Variety, Kotaku | 4 |
| Finance | FMP - Financial News, FMP - Market Analysis | 2 |
| Health | NPR Health, BBC Health | 2 |
| Sports | CBS Sports | 1 |
| Offbeat | Atlas Obscura, Mental Floss, UPI Odd News | 3 |
| Travel | Condé Nast Traveler, The Guardian Travel, Matador Network, Frommer's | 4 |
| India | BBC News India, NDTV, Times of India, India Today, Scroll.in, The Hindu | 6 |

**Disabled:** WorldNewsAPI (not implemented), 5 Google News feeds (performance — URL resolution too slow), Smithsonian Magazine (403 from production IP)

## What's Next

See NOW.md for current priorities and future enhancements.
