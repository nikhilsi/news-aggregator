# Current State

**Last Updated**: April 24, 2026

## Status: Live at getclearnews.com | iOS v2.0 on App Store | Android v1.0.0 | 41 sources across 13 categories

### Infrastructure review: 2026-04-24

Production deployment reviewed for API-key hygiene and general security posture. No changes made. The deployment carries only one legacy API credential (`FMP_API_KEY`), and that subscription is no longer active at the provider -- the RSS-only code path remains the live one. Droplet continues to host the site at getclearnews.com as-is, and the iOS/Android clients continue to point at the same backend. Noting the review here so a future reader knows this was checked on the above date and deliberately left in place, not overlooked.

Backend, web frontend, deployment, iOS app, and Android app are complete. Site is live on DigitalOcean. Three native clients (web, iOS, Android) share one backend API. Authentication removed (no user data, no database). Android app built with Kotlin + Jetpack Compose + Material 3, full feature parity with iOS including reader view, category filtering, search, settings, and smart sharing (articles shared with title, source, and ClearNews reader link). GitHub Actions workflow builds signed APK + AAB on tag push. F-Droid merge request submitted (pending review). Release APK is 1.8MB.

## What's Built

### Backend (FastAPI) — v2.0.0
- **Project scaffolding** — directory structure, venv, config (no database — all data is in-memory cache)
- **Source registry** — 48 sources in sources.yaml (39 RSS + 2 FMP enabled, 7 disabled), pydantic models, load/query helpers. Category list and source list both defined in sources.yaml.
- **SWR article cache** — stale-while-revalidate: fresh (< TTL) returns instantly, stale (TTL to 96x TTL, ~24h) serves immediately + background refresh, expired/missing fetches with 3s deadline (progressive response). Per-source TTL (default 15 min). Non-blocking refresh via `?refresh=true` (returns cached data instantly, refreshes in background).
- **Progressive cold-cache response** — on cache MISS, uses `asyncio.wait` with a 3-second deadline. Returns whatever sources completed within the deadline (`complete: false`), remaining sources continue in background. Clients auto-retry after 3s to get the full set.
- **Non-blocking refresh** — pull-to-refresh returns cached articles immediately with `complete: false` and triggers a background refresh of all sources. Clients auto-retry after 3s to pick up fresh data. No more 10-12s blocking wait.
- **Background refresh loop** — `asyncio` task keeps cache perpetually warm by refreshing the stalest expired source every ~25 seconds (one at a time). Full cycle ~17 minutes. Exception-safe, 30s hard timeout per fetch, respects `is_refreshing` guards. Waits for startup warmup to complete before starting.
- **Conditional HTTP requests** — RSS and FMP fetchers store ETag/Last-Modified headers and send `If-None-Match`/`If-Modified-Since` on subsequent requests. Feeds returning `304 Not Modified` skip XML parsing entirely; cache TTL is extended in place.
- **Startup cache warmup** — all 41 sources pre-fetched as background task on server start (~11s). First user request hits warm cache.
- **Cache-Control headers** — middleware sets HTTP cache headers: articles (5min), categories/sources (5min), refresh requests (no-store)
- **Thread pool offloading** — all CPU-bound operations offloaded to Python thread pool via `asyncio.to_thread()`: reader content extraction (readability + trafilatura), feedparser XML parsing, article deduplication. Event loop stays free for concurrent request handling.
- **Text logging** — human-readable text format for all environments. Request timing middleware with unique request IDs. Per-source fetch timing. Cache HIT/STALE/MISS logging.
- **SSRF protection** — reader endpoint validates URLs before fetching: blocks private/loopback/link-local/reserved IPs, DNS rebinding prevention, HTTP(S)-only schemes
- **HTML sanitization** — allowlist-based via nh3 (Rust-powered). Only safe tags/attributes survive. Replaced regex deny-list approach.
- **RSS fetcher** — async fetch via httpx with conditional headers (ETag/Last-Modified → 304 support), parse with feedparser (thread pool), normalize (images, dates, summaries), concurrent multi-source fetching, og:image fallback for feeds without embedded images, visual stories ad filter
- **FMP fetcher** — fetches financial news from FMP API (general-latest + fmp-articles endpoints) with conditional headers (304 support), normalizes both response formats, HTML stripping for article content. Reads API key from pydantic settings with os.environ fallback.
- **Article service** — orchestration layer: SWR cache checks → concurrent fetch → merge → non-Latin filter → deduplicate (thread pool) → two-tier sort → filter → paginate
- **Two-tier sorting** — "All" tab: 1 per source capped at 3 per category in tier 1, rest chronological. Category tabs: top 5 per source in tier 1, rest chronological. No articles discarded.
- **Reader view** — `GET /api/v1/articles/reader?url=` extracts clean article content using readability-lxml (primary) + trafilatura (fallback) via thread pool, sanitizes HTML, caches for 60 minutes. Graceful failure for paywalled sites.
- **Deduplication** — URL exact match (global) + title keyword overlap (0.6 threshold, bucketed by category). O(1) set-based removal tracking, prefers articles with images (~105 dupes removed per cycle with 41 sources)
- **Keyword search** — case-insensitive search on title/summary, composes with all filters
- **Production-ready** — configurable CORS origins via env vars, Swagger/ReDoc disabled in production, restricted CORS methods/headers

### Web Frontend (Next.js) — v2.0.0
- **Layout** — sticky header (ClearNews logo, search, refresh button, dark mode toggle), wrapping category pill tabs
- **Article feed** — responsive card grid (1/2/3 cols), infinite scroll, skeleton loading, broken image fallback
- **Refresh button** — header icon triggers force refresh from backend (bypasses cache)
- **Fetch timeout** — 15-second timeout on all API calls via AbortController
- **Error handling** — retry button on errors, timeout-specific messaging ("Taking longer than expected"), slow-loading hint after 3s ("Fetching fresh articles...")
- **Smooth transitions** — category/search changes keep previous articles visible while new data loads (no flash of empty state)
- **Reader view** — in-app article reading via full-screen modal overlay with `role="dialog"`, `aria-modal`, focus trapping, and `aria-labelledby`. Feed stays mounted underneath for instant back navigation. Content extraction from backend, client-side DOMPurify sanitization, skeleton loading, fallback for paywalled sites. Escape key and browser back close the modal.
- **Auto-retry on partial data** — when backend returns `complete: false` (cold cache, not manual refresh), useArticles hook silently re-fetches after 3 seconds to get the full article set
- **Filters** — category tabs, debounced keyword search (400ms), race condition handling
- **Dark mode** — class-based Tailwind, localStorage persistence, OS preference detection, no flash on load
- **Error boundary** — `error.tsx` catches unhandled exceptions with user-friendly retry UI
- **Performance** — ArticleCard wrapped with React.memo to prevent unnecessary re-renders during infinite scroll

### iOS App (SwiftUI) — v2.0.0
- **Article feed** — article cards with AsyncImage, LazyVStack, infinite scroll sentinel, pull-to-refresh (sends `refresh=true` to backend for genuinely fresh data), shimmer skeleton loading
- **Categories** — horizontal scroll capsule pills, filter articles by category
- **Search** — `.searchable` with 400ms debounce via `.task(id:)`, composes with category filter
- **Reader view** — WKWebView rendering extracted HTML content with Content Security Policy, dark mode CSS, responsive images, all external navigation opens in Safari, font size control, fallback for paywalled sites with "Read on {source}" button. Prevents redundant reloads, cleans up script message handler on dismiss.
- **Share** — native iOS share sheet from article card footer and reader toolbar (ShareLink with article URL + title)
- **Settings** — theme picker (system/light/dark), reader font size (S/M/L/XL), about page with content attribution and links to privacy/support pages, all persisted via UserDefaults
- **Architecture** — @MainActor @Observable services with private(set) properties, .environment() injection, singleton APIClient, zero external packages
- **Dynamic Type** — all text uses semantic fonts (.headline, .subheadline, .caption), padding/icon sizes scale via @ScaledMetric
- **Haptic feedback** — light impact on article card tap and category pill selection
- **Auto-retry on partial data** — when backend returns `complete: false` (cold cache, not manual refresh), ArticleService silently re-fetches after 3 seconds to get the full article set
- **Accessibility** — labels on share buttons, reader toolbar buttons, combined accessibility elements on error/empty states, decorative icons hidden, article cards announce as buttons with VoiceOver hint, category tabs convey selected state, WebView HTML includes `lang="en"`
- **Privacy manifest** — PrivacyInfo.xcprivacy declares UserDefaults usage (CA92.1), no tracking, no collected data types
- **Polish** — shared ErrorView/EmptyStateView, RelativeTimeText ("2h ago"), 4-state views (loading/success/error/empty), stale request tracking
- **22 Swift files**, 0 external dependencies, deployment target iOS 17.0

### Android App (Kotlin + Jetpack Compose) — v1.0.0
- **Article feed** — article cards with Coil 3 AsyncImage, LazyColumn, infinite scroll sentinel, pull-to-refresh (PullToRefreshBox), shimmer skeleton loading
- **Categories** — horizontal LazyRow with FilterChip pills, filter articles by category
- **Search** — TextField with 400ms coroutine debounce, composes with category filter
- **Reader view** — Android WebView rendering extracted HTML with Content Security Policy, dark mode CSS (computed from theme), responsive images, external links open in browser, font size control, JavaScript height bridge for proper scrolling. Loading skeleton, error retry, and "Read on {source}" fallback for paywalled sites.
- **Smart share** — articles shared with formatted text (title, source, time) and ClearNews reader link instead of raw article URL
- **Settings** — theme picker (system/light/dark) via SegmentedButtonRow, reader font size (S/M/L/XL), about page with version info, content attribution, privacy/support links
- **Architecture** — AndroidViewModel with StateFlow, SharedPreferences for persistence, singleton OkHttp ApiClient with kotlinx.serialization, no Room/Firebase/Retrofit/Hilt
- **Auto-retry on partial data** — when backend returns `complete: false` (cold cache, not manual refresh), ViewModel silently re-fetches after 3 seconds
- **Stale request tracking** — requestId counter pattern discards out-of-order responses
- **Haptic feedback** — VibrationEffect on article card tap and category selection (Android S+ VibratorManager support)
- **Edge-to-edge** — transparent status/navigation bars with proper light/dark bar styling via enableEdgeToEdge
- **Adaptive icon** — generated from iOS source icon at all densities, plus play store 512×512
- **Release pipeline** — GitHub Actions workflow builds signed APK + AAB on tag push, creates GitHub Release. F-Droid merge request submitted ([MR #34426](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/34426)).
- **ProGuard/R8** — minification and shrinking enabled for release builds with rules for kotlinx.serialization + OkHttp
- **22 Kotlin files**, minSdk 26 (Android 8.0+), targetSdk 35

### Deployment Infrastructure — v2.0.0
- **Docker** — Multi-stage Dockerfiles (backend: build + production stages, no gcc in production; frontend: Next.js standalone), docker-compose.prod.yml with container resource limits (512M/0.75 CPU backend, 256M/0.50 CPU frontend), .dockerignore preventing secrets/git from build context, pinned Alpine base images
- **Nginx** — host-level reverse proxy with SSL termination, rate limiting (general: 10/sec), comprehensive security headers (HSTS, CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options), server_tokens off, proxy_hide_header, client_max_body_size 1m, Mozilla intermediate cipher suite, static pages for privacy policy and support
- **Static pages** — privacy policy (`/privacy`) and support/FAQ (`/support`) served directly by nginx as static HTML (dark mode aware)
- **Scripts** — setup.sh, setup-ssl.sh, setup-firewall.sh (UFW + fail2ban), deploy.sh (with auto Docker cleanup), stream-logs.sh
- **Security** — non-root container users, rate limiting, firewall, fail2ban, comprehensive security headers, HSTS, .env.production in .gitignore, restricted directory permissions
- **Docker cleanup** — deploy.sh auto-prunes old images and build cache after each deploy to prevent disk bloat

### API Endpoints (all working)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/articles` | Fetch articles (category, source, search, pagination, refresh) |
| GET | `/api/v1/articles/reader` | Extract clean article content for reader view (SSRF-protected) |
| GET | `/api/v1/sources` | List configured sources |
| GET | `/api/v1/categories` | List categories with counts (hides empty) |

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
