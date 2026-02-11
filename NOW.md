# NOW — Current Priorities

**Last Updated**: February 10, 2026

## Phase 1: Backend Foundation — `done`

Build the FastAPI backend with core functionality.
Start with 3-5 RSS sources to prove the pipeline works end-to-end before adding APIs.

### 1. Project scaffolding — `done`
- [x] Directory structure (backend/app/ tree per PROJECT.md)
- [x] Python venv + requirements.txt
- [x] Config (.env.example, app/config.py with pydantic-settings)
- [x] SQLite database setup (schema.sql + app/database.py — users table only)
- [x] FastAPI entry point with /health (app/main.py, CORS)
- [x] Initial sources.yaml (all 24 sources listed, 4 enabled)

### 2. Source registry + cache + schemas — `done`
- [x] Source config model (pydantic) + load sources.yaml
- [x] Article schema (pydantic — API response shape)
- [x] In-memory article cache (app/cache.py)
- [x] GET /api/v1/sources endpoint
- [x] GET /api/v1/categories endpoint

### 3. RSS fetcher + article endpoint — `done`
- [x] Fetch raw XML via async httpx, parse with feedparser
- [x] Normalize entries (images, dates, summaries with HTML stripping)
- [x] Handle feed errors gracefully (timeouts, malformed XML, per-entry)
- [x] Fetch multiple feeds concurrently (asyncio.gather)
- [x] Article service: orchestrates cache checks + concurrent fetching
- [x] GET /api/v1/articles with category, source, pagination
- [x] Keyword search in title/summary (case-insensitive, composes with category/source filters)

### 4. Authentication — `done`
- [x] User model + SQLite table (schema.sql — users table with email, password_hash, is_admin, is_active, etc.)
- [x] Password hashing with bcrypt via passlib (app/auth/utils.py)
- [x] JWT token creation + validation with pyjwt HS256 (app/auth/utils.py)
- [x] POST /api/v1/auth/login (returns JWT + user info, tracks failed attempts + last_login)
- [x] POST /api/v1/auth/logout (client-side — stateless JWT)
- [x] GET /api/v1/auth/me (returns current user profile)
- [x] JWT middleware for protected routes (app/auth/dependencies.py — get_current_user dependency)
- [x] Create initial admin user (seed_admin.py CLI script)

---

## Phase 2: Web Frontend — `in progress`

Next.js app consuming the backend API. Layout: top nav with horizontal category tabs, responsive article card grid, dark mode from the start.

### 1. Project scaffolding — `done`
- [x] Next.js project (App Router) + Tailwind CSS
- [x] Folder structure, environment config (NEXT_PUBLIC_API_URL)
- [x] Dark mode setup (Tailwind class-based, localStorage persistence, respects prefers-color-scheme, no flash on load)
- [x] API client helper (fetch wrapper for articles, categories, auth)
- [x] TypeScript interfaces matching backend API response shapes

### 2. Layout + navigation — `done`
- [x] Header (logo/name, search bar, dark mode toggle, login button)
- [x] Category tabs (horizontal, scrollable on mobile, fetched from API)
- [x] Responsive shell (mobile-first, max-w-7xl container)

### 3. Article feed — `done`
- [x] Article card component (image, title, summary, source + relative time)
- [x] Responsive card grid (1 col mobile, 2 tablet, 3 desktop)
- [x] Infinite scroll (Intersection Observer, 200px early trigger)
- [x] Loading/empty/error states (skeleton cards, error message, empty message)
- [x] Broken image fallback (gradient placeholder)

### 4. Filters + search — `done`
- [x] Category tab selection (updates feed, resets pagination)
- [x] Search bar (debounced 400ms, keyword search via API)
- [x] Race condition handling (stale request discard)

### 5. Authentication — `done`
- [x] Login page (email + password form, error display, redirect on success)
- [x] Auth context + useAuth hook (JWT in localStorage, validates token on mount)
- [x] Conditional UI (login/logout button, user name display)

### 6. Polish + testing — `pending`
- [ ] Visual review in browser (both light and dark mode)
- [ ] Test all user flows (browse, filter, search, login/logout, dark mode toggle)
- [ ] Mobile responsiveness check
- [ ] Fix any styling or UX issues found

---

## Phase 3: Deployment — `done`

Docker Compose deployment to DigitalOcean with nginx, SSL, and security hardening.

### 1. Deployment infrastructure — `done`
- [x] Dockerfile for backend (Python 3.12, non-root user, health check)
- [x] Dockerfile for frontend (Next.js standalone, multi-stage build, non-root user)
- [x] docker-compose.prod.yml (backend + frontend, localhost-only ports, SQLite bind mount)
- [x] Host-level nginx config (SSL termination, rate limiting, /api/ → backend, / → frontend)
- [x] Setup script (installs Docker/nginx, builds containers, generates SECRET_KEY)
- [x] SSL setup script (Let's Encrypt + auto-renewal)
- [x] Firewall setup script (UFW + fail2ban)
- [x] Deploy script (git pull, rebuild, restart)
- [x] Log streaming script (stream remote Docker logs to local terminal)
- [x] .env.production template
- [x] Deployment README with setup guide + troubleshooting

### 2. Code changes for production — `done`
- [x] DB_PATH configurable via env var (for Docker bind mount)
- [x] CORS origins configurable via env var
- [x] Next.js standalone output mode for Docker builds
- [x] All 21 RSS sources enabled (3 API-based remain disabled)
- [x] Categories endpoint hides empty categories
- [x] Google News URL resolver — decodes opaque redirect URLs to real article URLs via batchexecute API, throttled with Semaphore(10) to avoid rate limits. 100% resolution rate.
- [x] og:image backfill now works for Google News sources (72% image rate on page 1)
- [x] Browser User-Agent on shared HTTP client (sites block bot UAs)
- [x] Article deduplication — URL exact match + title keyword overlap (0.6 threshold), prefers articles with images and direct feeds over Google News. ~33 dupes removed per fetch cycle.

---

## Phase 4: iOS App (future)

---

## Future Enhancements

Deferred until V1 is live and we can evaluate based on real usage.

### Backend
- **~~Reader view~~** — Done. GET /api/v1/articles/reader?url= with readability-lxml + trafilatura fallback. See articles/reader.py.
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI. Decide on approach later.
- **~~Deduplication~~** — Done. URL exact match + title keyword overlap (0.6 threshold). See articles/service.py.
- **~~Financial API fetcher~~** — Done. FMP general-latest + fmp-articles, both enabled. See sources/fmp_fetcher.py.
- **Additional source types** — NewsAPI fetcher (WorldNewsAPI)

### Frontend
- **SSR** — Server-side rendering for SEO and link previews. Not needed for a personal app initially.
- **User settings page** — Preferences, profile editing, source toggles. Build when there's something to configure.
- **Landing page** — Public marketing-style page with value prop, login/signup CTA. Build when ready to share with family/friends.
