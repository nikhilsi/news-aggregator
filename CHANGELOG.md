# Changelog

## [2.1.0] - 2026-03-07 — Android App + Smart Sharing

### Added
- **Native Android app** — Full-featured Kotlin + Jetpack Compose app with Material 3. Article feed with pull-to-refresh, category filtering, search with debounce, infinite scroll. Reader view with WebView (CSP, dark mode CSS, font scaling, JS height bridge). Settings with theme picker and font size. Adaptive app icon. Edge-to-edge display. Haptic feedback. 22 Kotlin files, minSdk 26.
- **Smart sharing (Android)** — Articles shared with formatted text (title, source, time) and ClearNews reader link (`getclearnews.com/article?url=...`) instead of raw article URL. Recipients get the clean reader experience.
- **GitHub Actions CI/CD** — Tag-triggered workflow builds signed APK + AAB and creates GitHub Release automatically.
- **F-Droid submission** — fastlane metadata (title, descriptions, changelog) and build recipe. [MR #34426](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/34426) submitted (pending review).

### Fixed
- **Web: back button on shared links** — Landing on `/article?url=...` from a shared link now navigates to the homepage instead of doing nothing (no browser history to go back to).

---

## [2.0.1] - 2026-03-01 — iOS App Store Update (v2.0 build 2)

### Fixed
- **Content swap on refresh** — Manual refresh no longer triggers auto-retry, which was causing articles to visibly rearrange 3 seconds after refresh (two-tier sort ran against partially-updated cache). Auto-retry now limited to cold cache (first visit) only. Fixed on both web and iOS.

### Changed
- **iOS version bumped to 2.0** (build 2) — Submitted to App Store with all v2.0.0 security/quality changes.

---

## [2.0.0] - 2026-03-01 — Security Hardening + Auth Removal

### Removed
- **Authentication system** — Removed JWT auth, login, password hashing, SQLite database, users table, seed script. Auth was unused — no endpoints required it, iOS app had already removed it. Eliminated: `backend/app/auth/`, `backend/app/database.py`, `backend/schema.sql`, `backend/seed_admin.py`, `web/src/app/login/`, `web/src/context/AuthContext.tsx`, `web/src/components/UserMenu.tsx`. Removed dependencies: `pyjwt`, `passlib`, `bcrypt`, `email-validator`, `aiosqlite`.

### Security
- **SSRF protection on reader endpoint** — `/api/v1/articles/reader?url=` now validates URLs before fetching: blocks private IPs, loopback, link-local, reserved addresses, non-HTTP schemes. DNS resolution checked to prevent rebinding attacks. Returns 400 for invalid URLs.
- **HTML sanitization replaced** — Switched from regex-based deny-list (bypassable) to `nh3` (Rust-powered allowlist sanitizer). Only explicitly allowed tags and attributes survive. No XSS bypass vectors possible.
- **Client-side HTML sanitization** — Added DOMPurify to web frontend as defense-in-depth. Reader view HTML is sanitized both server-side (nh3) and client-side (DOMPurify) before rendering.
- **iOS WebView CSP** — Added Content-Security-Policy meta tag to WKWebView HTML. Blocks injected scripts from executing. All non-link navigation types intercepted and opened in Safari instead.
- **Swagger/ReDoc disabled in production** — API docs (`/docs`, `/redoc`, `/openapi.json`) no longer exposed on the production server.
- **CORS restricted** — Allowed methods narrowed from `*` to `GET, OPTIONS`. Allowed headers narrowed to `Content-Type`.
- **Nginx hardened** — Added `server_tokens off`, `Referrer-Policy`, `Permissions-Policy`, `client_max_body_size 1m`, `proxy_hide_header X-Powered-By`. Removed deprecated `X-XSS-Protection` (replaced with `0`). Removed `unsafe-eval` from CSP. Tightened SSL cipher suite to Mozilla intermediate recommendation. Added rate limiting to `/health`. Removed auth rate limit zone (no longer needed).
- **Docker hardened** — Created `.dockerignore` to prevent secrets/git history from leaking into build context. Backend Dockerfile converted to multi-stage build (gcc removed from production image). Docker base images pinned to specific Alpine versions. Container resource limits added (512M/0.75 CPU backend, 256M/0.50 CPU frontend).
- **`.env.production` added to `.gitignore`** — Prevents accidental commit of production secrets.
- **Directory permissions fixed** — `chmod 777` replaced with `chmod 750` + proper ownership in setup script.

### Improved
- **Web: React Error Boundary** — Added `error.tsx` for graceful handling of unhandled exceptions.
- **Web: Reader modal accessibility** — Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapping (Tab cycles within modal), and auto-focus on close button.
- **Web: ArticleCard memoized** — Wrapped with `React.memo` to prevent unnecessary re-renders during infinite scroll.
- **Web: Article image alt text** — Thumbnails now use article title as alt text for screen readers.
- **iOS: @MainActor on services** — `ArticleService` and `CategoryService` annotated with `@MainActor` for correct Swift concurrency.
- **iOS: private(set) on service properties** — UI-driving properties (articles, isLoading, error, etc.) no longer writable from outside the service.
- **iOS: WebView reload prevention** — `updateUIView` now only reloads when HTML actually changes, preventing flicker.
- **iOS: WKWebView cleanup** — Script message handler removed in `dismantleUIView` to prevent memory leaks.
- **iOS: Double percent-encoding fixed** — Reader URL no longer double-encoded when passed to URLQueryItem.
- **iOS: Static DateFormatter** — `RelativeTimeText` no longer allocates a new `DateFormatter` on every render.
- **iOS: Accessibility** — Article cards announce as buttons with hint for VoiceOver. Category tabs convey selected state. WebView HTML includes `lang="en"`. Height message handler has bounds validation.
- **iOS: Unused `post` method removed** from APIClient.

---

## [1.9.0] - 2026-03-01 — Refresh Performance Overhaul

### Changed
- **Non-blocking refresh** — Pull-to-refresh no longer blocks on all 41 sources (was 10-12s). Now returns cached articles instantly with `complete: false`, triggers background refresh, and clients auto-retry after 3s to get fresh data. Same user flow, effectively instant perceived refresh.
- **Background refresh loop** — New `asyncio` background task keeps the cache perpetually warm. Picks the stalest expired source every ~25 seconds, fetches it one at a time. Full cycle through all sources ~17 minutes. Waits for startup warmup to complete before starting. Exception-safe (catches everything, never crashes), respects `is_refreshing` guards, 30s hard timeout per fetch.
- **Conditional HTTP requests** — RSS fetcher and FMP fetcher now store `ETag` and `Last-Modified` response headers per source and send `If-None-Match` / `If-Modified-Since` on subsequent requests. Feeds that haven't changed return `304 Not Modified` — skipping XML parsing entirely and just extending the cache TTL. Reduces bandwidth and CPU on the 1-vCPU server.

### Added
- `cache.get_articles()` — returns cached articles regardless of freshness (for non-blocking refresh)
- `cache.is_fresh()` — checks if a source's cache is within TTL (for refresh loop)
- `cache.oldest_source()` — picks stalest source from a list (for refresh loop scheduling)
- `cache.extend_ttl()` — re-validates cache without overwriting articles (for 304 responses)
- `_refresh_loop()` / `start_refresh_loop()` — background refresh loop in service.py, started from main.py lifespan
- `_fetch_and_cache_single()` — single-source fetch for the refresh loop
- `_http_validators` dict in both rss_fetcher.py and fmp_fetcher.py for storing conditional request headers

---

## [1.8.0] - 2026-03-01 — Content Filtering

### Added
- **Non-Latin article filter** — Articles with Hindi/Devanagari titles (>20% non-Latin characters) are now filtered from all tabs except India. Uses `unicodedata` character classification at the service layer so Hindi content is still available when browsing the India category.

### Fixed
- **India Today visual stories filtered** — India Today RSS feed injects sponsored "visual stories" (ad content) with constantly refreshed timestamps, causing them to always appear as the #1 article. URLs containing `/visualstories/` are now filtered out during RSS normalization.

---

## [1.7.0] - 2026-02-17 — App Store Submission

### Removed
- **iOS: Authentication removed entirely** — Login, Keychain, AuthService all removed. No user-facing features depend on auth, and it added unnecessary privacy complexity for App Store review. Backend auth remains for future use. Deleted 4 files: AuthService.swift, Auth.swift, LoginView.swift, KeychainHelper.swift.

### Fixed
- **iOS: Force-unwrap crashes** — Two `URL(string: article.url)!` force-unwraps in ReaderView.swift replaced with safe `if let` unwrapping. Previously, a malformed URL would crash the app.
- **iOS: Deployment target** — Changed IPHONEOS_DEPLOYMENT_TARGET from 26.2 (Xcode default) to 17.0 (minimum for @Observable). App now available to iOS 17+ devices instead of requiring unreleased iOS.

### Added
- **iOS: PrivacyInfo.xcprivacy** — Privacy manifest declaring UserDefaults usage (reason CA92.1), no tracking, no collected data types. Required by Apple since Spring 2024.
- **iOS: Accessibility labels** — ShareLink ("Share article"), reader close/share buttons, ErrorView and EmptyStateView (`.accessibilityElement(children: .combine)`, decorative icons hidden).
- **iOS: Enhanced AboutView** — Added Content Sources section (RSS/API attribution) and Links section (Privacy Policy + Support pointing to getclearnews.com).
- **Privacy policy page** — Static HTML at getclearnews.com/privacy served by nginx. Covers: no data collection, no tracking, device-only storage, network requests, children's privacy.
- **Support page** — Static HTML at getclearnews.com/support served by nginx. FAQ covering article sources, reader limitations, update frequency, offline support, contact.
- **Nginx static page routing** — Two `location =` blocks in nginx config for `/privacy` and `/support`, served directly without proxying to frontend.
- **CFBundleDisplayName** — Set to "ClearNews" so home screen shows "ClearNews" while App Store name is "GetClearNews".
- **App icon** — Added to Assets.xcassets/AppIcon.appiconset/ (1024x1024 PNG, multiple newspapers with magnifying glass on teal background).
- **App Store metadata** — All pushed via App Store Connect API: subtitle ("News Without the Noise"), description, keywords, categories (News/Reference), age rating (12+), copyright, privacy/support/marketing URLs, review notes, export compliance.
- **Screenshots** — 6 iPhone 6.9" + 5 iPad 13" captured from simulators and uploaded via API.
- **TestFlight** — "Family Testers" beta group created with 3 testers, beta review approved, tested on real device.
- **Pricing** — Set to Free via App Store Connect API.
- **App Privacy** — Published "no data collected" declaration in App Store Connect.
- **App Store submission** — Submitted for App Store review (Feb 17), release type: after approval.

---

## [1.6.0] - 2026-02-13 — Cold Cache Performance Overhaul

### Changed
- **SWR stale window extended (1h → 24h)**: Changed `_SWR_MULTIPLIER` from 4 to 96. With a 15min TTL, stale data is now usable for up to 24 hours. Users get instant responses for the full day instead of hitting cold cache after 1 hour of inactivity.
- **Progressive cold-cache response**: On cold cache, backend now uses `asyncio.wait` with a 3-second deadline instead of `asyncio.gather` (which waited for all ~41 sources). Returns whatever sources completed within the deadline (`complete: false` in response), while remaining sources continue fetching in a background task. Next request picks up the rest from cache. Typical first response: ~900 articles in 3-4s instead of ~1700 in 10-12s.
- **Client auto-retry on partial data**: Web (useArticles hook) and iOS (ArticleService) both detect `complete: false` and silently re-fetch after 3 seconds to get the full article set. Users see partial content fast, then the feed fills in seamlessly.
- **Dedup bucketed by category**: Title keyword overlap comparison now only runs within the same category (e.g., India Today won't dupe CBS Sports). URL dedup remains global. Reduces comparison work significantly with 13 categories.
- **Categories moved to sources.yaml**: Category list (id + display name) is now defined in `sources.yaml` alongside sources, instead of a hardcoded `CATEGORIES` dict in `registry.py`. Single source of truth.
- **Categories/sources Cache-Control fixed (24h → 5min)**: The 24-hour browser cache for `/categories` and `/sources` meant changes took a full day to appear. Reduced to 5 minutes.

### Added
- `complete` field on `ArticleListResponse` (backend schema, TypeScript type, Swift model) — `false` when some sources are still loading in background.
- `_fetch_with_deadline()` and `_complete_pending_fetches()` functions in article service for deadline-based progressive fetching.

---

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
