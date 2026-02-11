# Current State

**Last Updated**: February 10, 2026

## Status: Live at getclearnews.com

Backend, web frontend, and deployment are complete. Site is live on DigitalOcean.

## What's Built

### Backend (FastAPI) — v0.1.0
- **Project scaffolding** — directory structure, venv, config, SQLite database
- **Source registry** — 24 sources defined in sources.yaml (21 RSS + 2 FMP enabled, 1 API-based disabled), pydantic models, load/query helpers
- **In-memory article cache** — per-source TTL (default 15 min), no database storage for articles
- **RSS fetcher** — async fetch via httpx, parse with feedparser, normalize (images, dates, summaries), concurrent multi-source fetching, og:image fallback for feeds without embedded images, Google News URL resolver (decodes redirect URLs to real article URLs via batchexecute API)
- **FMP fetcher** — fetches financial news from FMP API (general-latest + fmp-articles endpoints), normalizes both response formats, HTML stripping for article content
- **Article service** — orchestration layer: cache checks → concurrent fetch → merge → deduplicate → sort → filter → paginate
- **Deduplication** — URL exact match + title keyword overlap (0.6 threshold), prefers articles with images and direct feeds over Google News (~33 dupes removed per cycle)
- **Keyword search** — case-insensitive search on title/summary, composes with all filters
- **Authentication** — email/password login with JWT (HS256), bcrypt password hashing, protected route dependency, seed script for admin/regular users
- **Production-ready** — configurable DB path and CORS origins via env vars

### Web Frontend (Next.js) — v0.2.0
- **Layout** — sticky header (ClearNews logo, search, dark mode toggle, user menu), wrapping category pill tabs
- **Article feed** — responsive card grid (1/2/3 cols), infinite scroll, skeleton loading, broken image fallback
- **Filters** — category tabs, debounced keyword search (400ms), race condition handling
- **Dark mode** — class-based Tailwind, localStorage persistence, OS preference detection, no flash on load
- **Authentication** — login page, JWT in localStorage, conditional UI (user dropdown with logout)

### Deployment Infrastructure — v0.3.0
- **Docker** — Dockerfiles for backend (Python 3.12) and frontend (Next.js standalone), docker-compose.prod.yml
- **Nginx** — host-level reverse proxy with SSL termination, rate limiting (auth: 5/min, general: 10/sec)
- **Scripts** — setup.sh, setup-ssl.sh, setup-firewall.sh (UFW + fail2ban), deploy.sh, stream-logs.sh
- **Security** — non-root container users, rate limiting, firewall, fail2ban, security headers, HSTS

### API Endpoints (all working)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1/articles` | No | Fetch articles (category, source, search, pagination) |
| GET | `/api/v1/sources` | No | List configured sources |
| GET | `/api/v1/categories` | No | List categories with counts (hides empty) |
| POST | `/api/v1/auth/login` | No | Login, returns JWT |
| POST | `/api/v1/auth/logout` | No | Logout (client-side) |
| GET | `/api/v1/auth/me` | Yes | Current user profile |

### Sources (23 of 24 enabled)
| Category | Sources | Count |
|----------|---------|-------|
| Feel Good | Good News Network, Positive News, Sunny Skyz, BBC Uplifting, DailyGood | 5 |
| Science | Ars Technica Science, NASA, New Scientist, Scientific American, Google News Science | 5 |
| Technology | The Verge, Wired, Ars Technica Tech, Engadget, Google News Tech | 5 |
| Entertainment | A.V. Club, Polygon, Google News Entertainment | 3 |
| Finance | FMP - Financial News, FMP - Market Analysis | 2 |
| Health | Google News Health | 1 |
| Sports | Google News Sports | 1 |
| Offbeat | Atlas Obscura | 1 |

**Disabled** (require API keys): WorldNewsAPI

## What's Next

1. **Visual polish** — Review light/dark mode, test all user flows, mobile responsiveness
2. **Future enhancements** — See NOW.md

## Future Enhancements (deferred)

- Reader view (full article content extraction)
- Sentiment filter (HuggingFace / FinBERT)
- Additional source types (NewsAPI, Financial APIs)
- Landing page, user settings, SSR

See NOW.md for details on each.
