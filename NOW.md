# NOW — Current Priorities

**Last Updated**: February 10, 2026

## Phase 1: Backend Foundation

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
- [ ] GET /api/v1/articles/:id for single article (reader view — later)
- [ ] Sentiment filter parameter
- [ ] Keyword search in title/summary

### 5. Authentication — `done`
- [x] User model + SQLite table (schema.sql — users table with email, password_hash, is_admin, is_active, etc.)
- [x] Password hashing with bcrypt via passlib (app/auth/utils.py)
- [x] JWT token creation + validation with pyjwt HS256 (app/auth/utils.py)
- [x] POST /api/v1/auth/login (returns JWT + user info, tracks failed attempts + last_login)
- [x] POST /api/v1/auth/logout (client-side — stateless JWT)
- [x] GET /api/v1/auth/me (returns current user profile)
- [x] JWT middleware for protected routes (app/auth/dependencies.py — get_current_user dependency)
- [x] Create initial admin user (seed_admin.py CLI script)

### 6. Deduplication — `pending`
- [ ] URL exact match
- [ ] Fuzzy title matching with rapidfuzz (>85% similarity)
- [ ] Source priority ranking (higher priority source wins)

---

## Phase 2: Web Frontend (after Phase 1)

## Phase 3: iOS App (after Phase 2)
