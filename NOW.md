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

## Phase 2: Web Frontend — `up next`

Next.js app consuming the backend API.

- [ ] Project scaffolding (Next.js + Tailwind)
- [ ] Layout (header, nav, responsive shell)
- [ ] Article feed page (card grid, infinite scroll or pagination)
- [ ] Category/source filters
- [ ] Keyword search
- [ ] Login page + auth context (JWT storage, protected routes)
- [ ] User profile / settings page

---

## Phase 3: iOS App (after Phase 2)

---

## Future Enhancements

Deferred until V1 frontend is live and we can evaluate based on real usage.

### Backend
- **Reader view** — GET /api/v1/articles/:id with full content extraction (readability-lxml or trafilatura). Decide once FE is built and we see if in-app reading is wanted.
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI. Decide on approach later.
- **Deduplication** — URL exact match + fuzzy title matching with rapidfuzz (>85% similarity) + source priority ranking. Build once we see actual overlap in the frontend.
- **Additional source types** — NewsAPI fetcher, Financial API fetcher (Alpha Vantage, FMP)
- **Enable more sources** — Currently 4 of 24 enabled. Scale up after dedup is in place.
