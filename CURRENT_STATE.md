# Current State

**Last Updated**: February 10, 2026

## Status: 🟢 Phase 1 Complete — Ready for Phase 2 (Web Frontend)

Backend V1 is fully functional with RSS fetching, caching, search, and authentication.

## What's Built

### Backend (FastAPI) — v0.1.0
- **Project scaffolding** — directory structure, venv, config, SQLite database
- **Source registry** — 24 sources defined in sources.yaml (4 enabled), pydantic models, load/query helpers
- **In-memory article cache** — per-source TTL (default 15 min), no database storage for articles
- **RSS fetcher** — async fetch via httpx, parse with feedparser, normalize (images, dates, summaries), concurrent multi-source fetching
- **Article service** — orchestration layer: cache checks → concurrent fetch → merge → sort → filter → paginate
- **Keyword search** — case-insensitive search on title/summary, composes with all filters
- **Authentication** — email/password login with JWT (HS256), bcrypt password hashing, protected route dependency, seed script for admin user

### API Endpoints (all working)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1/articles` | No | Fetch articles (category, source, search, pagination) |
| GET | `/api/v1/sources` | No | List configured sources |
| GET | `/api/v1/categories` | No | List categories with counts |
| POST | `/api/v1/auth/login` | No | Login, returns JWT |
| POST | `/api/v1/auth/logout` | No | Logout (client-side) |
| GET | `/api/v1/auth/me` | Yes | Current user profile |

## What's Next

**Phase 2: Web Frontend** — Next.js app consuming the backend API. See NOW.md.

## Future Enhancements (deferred)

- Reader view (full article content extraction)
- Sentiment filter (HuggingFace / FinBERT)
- Deduplication (URL match + fuzzy title matching)
- Additional source types (NewsAPI, Financial APIs)
- Enable more sources (4 of 24 currently active)

See NOW.md for details on each.
