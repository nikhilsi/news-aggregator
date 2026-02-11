# Changelog

## [0.1.0] - 2026-02-10 — Backend V1

### Added
- **Project scaffolding**: FastAPI entry point, SQLite database, pydantic-settings config, CORS middleware
- **Source registry**: 24 news sources in sources.yaml (4 enabled), pydantic config models, load/query helpers
- **In-memory article cache**: per-source TTL (default 15 min), no DB storage for articles
- **RSS fetcher**: async fetch via httpx, parse with feedparser, normalize entries (images, dates, summaries with HTML stripping), concurrent multi-source fetching with per-source error isolation
- **Article endpoint**: GET /api/v1/articles with category, source, keyword search, and pagination filters
- **Source/category endpoints**: GET /api/v1/sources, GET /api/v1/categories
- **Authentication**: email/password login with JWT (HS256), bcrypt password hashing, get_current_user dependency for route protection, failed login tracking
- **Auth endpoints**: POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me
- **Seed script**: seed_admin.py for creating the initial admin user
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
