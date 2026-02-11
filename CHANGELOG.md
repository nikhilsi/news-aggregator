# Changelog

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
