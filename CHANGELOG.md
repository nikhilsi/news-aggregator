# Changelog

## [1.5.0] - 2026-02-12 — iOS Share, Dynamic Type, Haptics

### Added
- **iOS: Share button**: ShareLink on article card footer and reader view toolbar. Shares article URL with title via native iOS share sheet.
- **iOS: Dynamic Type support**: All padding and icon sizes now scale with accessibility text size settings via `@ScaledMetric` (ArticleCardView, CategoryTabsView, EmptyStateView, ErrorView). Text already used semantic fonts.
- **iOS: Haptic feedback**: Light impact feedback on article card tap and category pill selection.
- **iOS: README**: Added `ios/README.md` documenting architecture, folder structure, services, and key patterns.

---

## [1.4.0] - 2026-02-12 — Source Expansion + Two-Tier Sorting

### Added
- **20 new RSS sources**: AP News (general), NPR Health, BBC Health (health), CBS Sports (sports), Variety, Kotaku (entertainment), Mental Floss, UPI Odd News (offbeat), GeekWire, Seattle Eater, MyNorthwest, Crosscut (local/Seattle), Condé Nast Traveler, The Guardian Travel, Matador Network, Frommer's (travel), BBC News India, NDTV, Times of India, India Today, Scroll.in, The Hindu (india). Total: 40 enabled sources across 13 categories.
- **5 new categories**: General, Local (Seattle), Travel, India, plus Offbeat expanded from 1 to 3 sources.
- **Two-tier article sorting**: "All" tab shows a diverse top section (1 per source, capped at 3 per category) followed by everything else chronologically. Category tabs show top 5 per source then the rest. No articles discarded.

### Changed
- **Logging simplified**: Removed `python-json-logger` dependency. All environments now use human-readable text format. No more `LOG_FORMAT` env var.
- **FMP API key loading**: Reads from pydantic settings first, falls back to `os.environ`. Previously only checked `os.environ`, which missed keys loaded from `.env` by pydantic-settings.

### Removed
- **Google News feeds disabled** (5 sources): Each article required 2 HTTP round-trips to resolve redirect URLs via Google's batchexecute API (~700 extra HTTP calls per refresh). Warmup dropped from ~25s to ~11s.
- **Smithsonian Magazine disabled**: Returns 403 from production server IP (datacenter bot detection).
- **Seattle Times removed**: Returns empty 202 response from production server IP.

---

## [1.3.0] - 2026-02-12 — Async Performance + Docker Cleanup

### Fixed
- **Event loop blocking**: Offloaded all CPU-bound operations to Python's thread pool via `asyncio.to_thread()`. Previously, these operations blocked the single-threaded event loop, freezing all concurrent requests:
  - Reader content extraction (readability-lxml + trafilatura): 500ms-2s per request
  - RSS feed parsing (feedparser): 50-150ms per feed
  - Article deduplication: 50-200ms per request
  - Bcrypt password verification: 200-400ms per login
- **Dedup algorithm**: Replaced O(n) `list.remove()` calls with O(1) set-based tracking via `removed_ids`. Single filter pass at the end instead of per-removal list scans.

### Changed
- **Deploy script**: Now auto-cleans Docker build cache and old images after every deploy (`docker system prune -af` + `docker builder prune -af`). Cleanup runs after containers start so running images are protected. Reclaimed 12GB on first run.

---

## [1.2.0] - 2026-02-12 — Pull-to-Refresh + Client UX

### Added
- **Force refresh API**: `GET /api/v1/articles?refresh=true` bypasses SWR cache and fetches all sources fresh. Both web and iOS clients use this for user-initiated refresh.
- **Cache-Control headers**: Backend middleware sets `Cache-Control` on all API responses — articles (5min), categories/sources (24h), refresh requests (no-store). Browsers and URLSession cache responses natively.
- **Web: refresh button**: Circular arrow icon in the header (next to theme toggle) triggers a force refresh.
- **Web: fetch timeout**: All API calls timeout after 15 seconds via AbortController. Previously, requests could hang indefinitely.
- **Web: retry button on errors**: Error state now shows a "Try again" button. Timeout errors get a distinct "Taking longer than expected" message.
- **Web: slow-loading hint**: After 3 seconds of loading with no articles, shows "Fetching fresh articles..." below the skeleton cards.
- **iOS: pull-to-refresh sends `refresh=true`**: The existing pull-to-refresh gesture now passes `refresh=true` to the backend, ensuring genuinely fresh data instead of cached responses.

### Fixed
- **Web: flash of empty state**: Switching categories no longer flashes empty skeleton cards. Previous articles stay visible while new ones load.

---

## [1.1.0] - 2026-02-12 — Backend Instrumentation + Cold Cache Fix

### Added
- **Structured logging**: Request timing middleware with unique request IDs, per-source fetch timing, cache status logging. (Note: JSON logging was later removed in v1.4.0 — all environments now use text format.)
- **Request timing middleware**: Every API request logged with unique request ID, method, path, status code, and duration in milliseconds.
- **Per-source fetch timing**: Each RSS/FMP source fetch logged with source name, article count, and duration.
- **Stale-while-revalidate (SWR) cache**: Three-state cache — HIT (fresh, < TTL), STALE (expired but within 4x TTL window, serves immediately + background refresh), MISS (no data, fetches synchronously). Users almost never wait for cold fetches.
- **Startup cache warmup**: All 23 sources pre-fetched as a background task on server start. First user request hits warm cache (~200ms) instead of cold fetches (~20s).
- **Cache status logging**: Every request logs cache HIT/STALE/MISS counts, dedup stats, and background refresh activity.
- **Reader cache hit logging**: Reader view logs cache hits at INFO level for observability.

### Changed
- Suppressed noisy `httpx`/`httpcore` loggers (set to WARNING level).

---

## [1.0.0] - 2026-02-11 — iOS App

### Added
- **Native iOS app** (SwiftUI): Full feature parity with the web frontend. 26 Swift files, zero external dependencies.
- **Article feed**: Article cards with AsyncImage, LazyVStack infinite scroll, pull-to-refresh, shimmer skeleton loading.
- **Category filtering**: Horizontal scroll capsule pills, filters articles via API.
- **Search**: `.searchable` with 400ms debounce via `.task(id:)`.
- **Reader view**: WKWebView rendering extracted HTML content with dark mode CSS, responsive images, configurable font size. External links open in Safari. Fallback for paywalled sites.
- **Settings**: Theme picker (system/light/dark), reader font size (S/M/L/XL), about page. All persisted via UserDefaults.
- **Authentication**: JWT stored in Keychain via Security framework. Login form, auto-validates saved token on launch.
- **Shared components**: ErrorView, EmptyStateView, RelativeTimeText ("2h ago"), SkeletonView with shimmer animation.

### Architecture
- `@Observable` services (ArticleService, CategoryService, AuthService, AppSettings) injected via `.environment()`.
- Singleton `APIClient` wrapping URLSession with generic `get<T>`/`post<Body,T>`, JWT injection, flexible ISO 8601 date decoding, FastAPI error detail extraction.
- Stale request tracking via `currentRequestId` counter (same pattern as web).
- Network-first design: every screen has 4 states (loading, success, error, empty).

---

## [0.7.0] - 2026-02-10 — Reader View Modal Overlay

### Changed
- **Reader view is now a modal overlay**: Clicking an article opens a full-screen overlay instead of navigating to a new page. The feed stays mounted underneath, so closing the reader (Back button, Escape key, or browser back) returns instantly to the feed with scroll position preserved.
- **Invisible history entry**: Uses `pushState` without a URL change to support browser back button without conflicting with Next.js App Router routing.
- **Escape key hint**: `Esc` keyboard shortcut badge shown next to the Back button (hidden on mobile).

### Technical
- New `ReaderModal.tsx` component with body scroll lock, popstate listener, and keyboard handling.
- `ArticleCard` changed from `<Link>` navigation to `<button>` with onClick callback.
- `ArticleGrid` and home page wired with `onArticleClick` → modal state management.
- Standalone `/article` page kept as fallback for direct URL access.

---

## [0.6.0] - 2026-02-10 — Reader View

### Added
- **Reader view**: In-app article reading with clean, extracted content. Clicking an article card opens a reader view page instead of the source site. Back button + "View Original" link always available.
- **Content extraction backend**: `reader.py` service using readability-lxml (primary) with trafilatura fallback. HTML sanitization for XSS prevention. Separate content cache with 60-minute TTL.
- **Reader API endpoint**: `GET /api/v1/articles/reader?url=<url>` — returns `status: "ok"` with extracted HTML content, or `status: "failed"` with reason (forbidden, timeout, extraction_empty, error).
- **Failure fallback**: When extraction fails (paywalled sites like NYT, Reuters), shows a clean fallback with "Read on {source}" button to open the original URL.
- **Tailwind Typography**: `@tailwindcss/typography` plugin for styled prose content in reader view.
- **Article metadata passthrough**: Reader page shows title, source, author, date, and hero image immediately via URL params while content loads.

---

## [0.5.0] - 2026-02-10 — FMP Financial News

### Added
- **FMP financial news sources**: Two FMP (Financial Modeling Prep) endpoints — general-latest (aggregated news from WSJ, CNBC, Bloomberg) and fmp-articles (FMP's own market analysis). Both enabled with 20 articles each.
- **FMP fetcher** (`fmp_fetcher.py`): Normalizers for both FMP response formats, HTML stripping for article content, timeout and error handling.
- **Finance category**: Now visible in UI with 2 sources and ~20 articles.

### Changed
- Removed Alpha Vantage from sources (replaced by FMP).
- Source count: 23 enabled (21 RSS + 2 Financial API), 1 disabled (WorldNewsAPI).

---

## [0.4.0] - 2026-02-10 — Google News Fix + Deduplication

### Added
- **Google News URL resolver**: Decodes opaque `news.google.com/rss/articles/CBMi...` redirect URLs to real article URLs using Google's batchexecute API. Runs at fetch time, before caching. Throttled with `asyncio.Semaphore(10)` to avoid rate limits. 100% resolution rate across all 5 Google News sources.
- **Article deduplication**: Two-layer dedup in article service — URL exact match + title keyword overlap (0.6 threshold). Prefers articles with images and direct feeds over Google News aggregates. Removes ~33 dupes per fetch cycle (780 → 747 articles).
- **Browser User-Agent**: Switched shared HTTP client from `NewsAggregator/0.1` to a Chrome-like User-Agent. Many news sites block bot UAs, which prevented og:image extraction. Image rate improved from ~52% to ~72%.

---

## [0.3.0] - 2026-02-10 — Deployment Infrastructure + All Sources

### Added
- **Deployment infrastructure**: Dockerfiles (backend + Next.js standalone frontend), docker-compose.prod.yml, host-level nginx config with SSL and rate limiting
- **Setup scripts**: setup.sh (server provisioning), setup-ssl.sh (Let's Encrypt), setup-firewall.sh (UFW + fail2ban), deploy.sh (recurring deploys), stream-logs.sh (remote log streaming)
- **Production config**: .env.production template, configurable DB_PATH and CORS_ORIGINS via env vars
- **All 21 RSS sources enabled**: Positive News, Sunny Skyz, BBC Uplifting, DailyGood, NASA, New Scientist, Scientific American, Wired, Ars Technica Tech, Engadget, Atlas Obscura, Polygon, Google News (Science, Tech, Entertainment, Health, Sports)
- **Categories endpoint**: now hides categories with zero enabled sources
- **Next.js standalone output**: for efficient Docker builds
- **Deployment README**: full setup guide, useful commands, troubleshooting

---

## [0.2.0] - 2026-02-10 — Web Frontend

### Added
- **Next.js web frontend**: App Router, Tailwind CSS v4, TypeScript
- **Layout**: sticky header with ClearNews logo, search bar, dark mode toggle, user dropdown menu
- **Category tabs**: wrapping pill-style tabs fetched from API, responsive sizing
- **Article feed**: responsive card grid (1/2/3 cols), infinite scroll (Intersection Observer), skeleton loading, broken image fallback
- **Search**: debounced keyword search (400ms) with race condition handling
- **Dark mode**: class-based Tailwind, localStorage persistence, OS preference detection, no flash on load
- **Authentication**: login page, JWT in localStorage, auth context with token validation on mount, user dropdown with logout
- **API client**: typed fetch wrapper for all backend endpoints
- **og:image fallback**: fetches article page og:image meta tag for feeds without embedded images
- **Restart scripts**: backend and frontend dev server restart scripts with PID management

### Fixed
- Duplicate "All" category tab (API already includes it)
- Missing cursor-pointer on category tab buttons
- Category tabs not wrapping on narrow screens (switched to flex-wrap pills)

---

## [0.1.0] - 2026-02-10 — Backend V1

### Added
- **Project scaffolding**: FastAPI entry point, SQLite database, pydantic-settings config, CORS middleware
- **Source registry**: 24 news sources in sources.yaml, pydantic config models, load/query helpers
- **In-memory article cache**: per-source TTL (default 15 min), no DB storage for articles
- **RSS fetcher**: async fetch via httpx, parse with feedparser, normalize entries (images, dates, summaries with HTML stripping), concurrent multi-source fetching with per-source error isolation
- **Article endpoint**: GET /api/v1/articles with category, source, keyword search, and pagination filters
- **Source/category endpoints**: GET /api/v1/sources, GET /api/v1/categories
- **Authentication**: email/password login with JWT (HS256), bcrypt password hashing, get_current_user dependency for route protection, failed login tracking
- **Auth endpoints**: POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me
- **Seed script**: seed_admin.py for creating admin or regular users
- **Documentation**: CLAUDE.md, PROJECT.md, README.md, backend/README.md, CURRENT_STATE.md, NOW.md

### Fixed
- 4 broken RSS feed URLs (Sunny Skyz, BBC Uplifting, DailyGood, Scientific American)
- bcrypt/passlib compatibility (pinned bcrypt <4.1.0)

---

## [0.0.1] - 2026-02-10

### Added
- Initial project documentation (PROJECT.md, CLAUDE.md, README.md)
- Development workflow and standards
- Architecture design and API contracts
- Source registry design with initial source list
