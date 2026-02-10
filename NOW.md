# NOW — Current Priorities

**Last Updated**: February 10, 2026

## Phase 1: Backend Foundation

Build the FastAPI backend with core functionality:

1. **Project scaffolding** — FastAPI app, SQLite setup, project structure per PROJECT.md
2. **Source registry** — Load sources from `sources.yaml`, support RSS and API types
3. **RSS fetcher** — Parse RSS feeds, normalize into article schema
4. **Caching layer** — SQLite-based cache with configurable TTL
5. **Article endpoint** — `GET /api/v1/articles` with category and pagination support
6. **Authentication** — Simple username/password with JWT
7. **Deduplication** — URL match + fuzzy title matching

Start with 3-5 RSS sources to prove the pipeline works end-to-end before adding APIs.

## Phase 2: Web Frontend (after Phase 1)

## Phase 3: iOS App (after Phase 2)
