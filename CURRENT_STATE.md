# Current State

**Last Updated**: February 10, 2026

## Status: 🟢 Phase 1 — Backend Foundation (in progress)

Backend API is functional with RSS fetching, caching, and authentication. See NOW.md for remaining Phase 1 tasks.

## What's Built

### Backend (FastAPI)
- **Project scaffolding** — directory structure, venv, config, SQLite database
- **Source registry** — 24 sources defined in sources.yaml (4 enabled), pydantic models, load/query helpers
- **In-memory article cache** — per-source TTL (default 15 min), no database storage for articles
- **RSS fetcher** — async fetch via httpx, parse with feedparser, normalize (images, dates, summaries), concurrent multi-source fetching
- **Article service** — orchestration layer: cache checks → concurrent fetch → merge → sort → paginate
- **Authentication** — email/password login with JWT (HS256), bcrypt password hashing, protected route dependency, seed script for admin user

### API Endpoints (all working)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1/articles` | No | Fetch articles (category, source, pagination) |
| GET | `/api/v1/sources` | No | List configured sources |
| GET | `/api/v1/categories` | No | List categories with counts |
| POST | `/api/v1/auth/login` | No | Login, returns JWT |
| POST | `/api/v1/auth/logout` | No | Logout (client-side) |
| GET | `/api/v1/auth/me` | Yes | Current user profile |

## What's Not Built Yet

### Backend (remaining Phase 1)
- GET /api/v1/articles/:id (single article / reader view)
- Sentiment filter parameter
- Keyword search in title/summary
- Deduplication (URL exact match + fuzzy title matching)

### Frontend & Mobile
- Web frontend (Next.js) — Phase 2
- iOS app (SwiftUI) — Phase 3

## What's Next

See NOW.md for current priorities.
