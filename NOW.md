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

### 3. RSS fetcher — `pending`
- [ ] Parse RSS feeds with feedparser
- [ ] Normalize RSS entries into article schema
- [ ] Handle feed errors gracefully (timeouts, malformed XML)
- [ ] Fetch multiple feeds concurrently (async)

### 4. Article endpoint — `pending`
- [ ] GET /api/v1/articles with category, pagination, sort/order
- [ ] GET /api/v1/articles/:id for single article
- [ ] Sentiment filter parameter
- [ ] Source filter parameter
- [ ] Keyword search in title/summary

### 5. Authentication — `pending`
- [ ] User model + SQLite table
- [ ] POST /api/v1/auth/login (returns JWT)
- [ ] POST /api/v1/auth/logout
- [ ] GET /api/v1/auth/me
- [ ] JWT middleware for protected routes
- [ ] Create initial admin user (CLI or seed script)

### 6. Deduplication — `pending`
- [ ] URL exact match
- [ ] Fuzzy title matching with rapidfuzz (>85% similarity)
- [ ] Source priority ranking (higher priority source wins)

---

## Phase 2: Web Frontend (after Phase 1)

## Phase 3: iOS App (after Phase 2)
