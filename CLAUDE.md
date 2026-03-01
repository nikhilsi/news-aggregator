# Claude Code Development Guide

---
**Last Updated**: February 10, 2026
**Purpose**: Rules and workflow for working with this codebase
---

## 🎯 Starting a New Session

**Read these docs in order:**

1. **CLAUDE.md** (this file) - Rules & workflow
2. **README.md** - Project overview
3. **PROJECT.md** - Full architecture, tech stack, data model, API design, source registry
4. **CURRENT_STATE.md** - What's built & current status
5. **CHANGELOG.md** - Version history & recent changes
6. **backend/README.md** - API endpoints, services, folder structure
7. **web/README.md** - Pages, components, hooks
8. **NOW.md** - What to work on next
9. **`git log --oneline -10`** - Recent commits

**Optional** (if relevant to task):
- **ios/README.md** - SwiftUI app structure
- **backend/sources.yaml** - News source configuration

---

## 🚨 Critical Rules

### Critical Rules (Non-Negotiable)
1. **Unauthorized commits** - NEVER commit without explicit approval
2. **Unauthorized deploys** - NEVER deploy to production unless explicitly told
3. **Over-engineering** - KISS principle always
4. **Not reading requirements** - Full attention to specs, read PROJECT.md thoroughly
5. **Being lazy** - Read ALL the docs before starting
6. **Lying or pretending** - Say "I don't know" if unsure
7. **Not thinking critically** - Question things that don't make sense
8. **Background jobs** - NO cron jobs, no external scheduled tasks. The only background work is the in-process asyncio refresh loop (keeps cache warm) and startup warmup.

### How to Be a True Partner
- **Thoughtful design first** - Discuss before coding
- **One piece at a time** - Complete, review, then proceed
- **KISS principle** - Simple > clever
- **Explicit permission** - Get approval before every commit
- **Challenge bad ideas** - Don't just agree
- **Ask clarifying questions** - Don't assume
- **Think consequences** - Maintenance, performance, edge cases

---

## 💻 Development Standards

### Code Quality
- **Python**: Type hints, async/await, proper error handling
- **TypeScript**: NO `any` types, proper interfaces
- **Frontend**: Follow Prettier (single quotes, semicolons)
- **Testing**: Write tests before committing
- **Documentation**: Keep docs current with code

### Git Workflow
- **Atomic commits** - One logical change per commit
- **Clear messages** - Descriptive, explain the why
- **NO attribution** - Never include "Generated with Claude"
- **Working state** - Every commit leaves code functional

### Core Development Principles
1. **No Shortcuts** - Build properly from ground up
2. **Work Slowly** - Understand before implementing
3. **No Assumptions** - Verify against existing code
4. **Production Mindset** - Build as if going to production

---

## 🏗️ Architecture Summary

**This is a personal news aggregator with three clients sharing one backend.**

```
Next.js Web App  ──┐
                    ├──▶  FastAPI Backend  ──▶  RSS Feeds / News APIs / Financial APIs
iOS SwiftUI App ───┘     (in-memory cache)
```

**Key architectural decisions:**
- **Stateless backend** - No database. All data is transient in-memory article cache. No user accounts.
- **SWR caching + background refresh** - In-memory cache with 15min TTL and 24h stale window. Background asyncio loop refreshes stalest source every ~25s to keep cache warm. Conditional HTTP requests (ETag/Last-Modified) skip unchanged feeds.
- **Non-blocking refresh** - Pull-to-refresh returns cached data instantly, refreshes in background. Clients auto-retry after 3s.
- **Source registry** - All news sources defined in `sources.yaml`. Add/remove sources without code changes
- **Hybrid sources** - RSS feeds (free, unlimited) + News APIs (WorldNewsAPI for sentiment) + Financial APIs (FMP, premium subscription)
- **Reader view** - Clean article content extraction with SSRF protection and allowlist HTML sanitization (nh3)

**For full architecture details, data models, API contracts, and source list, see PROJECT.md**

---

## 🗄️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12+ / FastAPI |
| Cache | In-memory (Python dict) |
| Web Frontend | Next.js (React) / Tailwind |
| iOS App | Swift / SwiftUI |
| Deployment | DigitalOcean Droplet / Docker Compose |

---

## 🗄️ Environment Setup

**Python Virtual Environment:**
```bash
source venv/bin/activate
which python  # Should show ./venv/bin/python
```

**API Keys** (in `.env`):
- `WORLD_NEWS_API_KEY` - https://worldnewsapi.com (Free tier, 500 req/day)
- `FMP_API_KEY` - https://financialmodelingprep.com (Premium subscription)

**Starting Dev:**
```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Web Frontend
cd web && npm run dev  # Port 3000
```

---

## 📚 Documentation Structure

**Root Level:**
- **CLAUDE.md** - Rules & workflow (this file)
- **PROJECT.md** - Full architecture, design, API contracts, source registry
- **README.md** - Project overview
- **CURRENT_STATE.md** - What's built, feature status
- **NOW.md** - Current priorities
- **CHANGELOG.md** - Version history

**Folder READMEs:**
- **backend/README.md** - API endpoints, services, folder structure
- **web/README.md** - Pages, components, hooks, styling
- **ios/README.md** - SwiftUI app structure

---

## 📂 Build Order

The recommended build sequence:

1. **Backend** - FastAPI with a few RSS sources, caching, article endpoint. Get data flowing.
2. **Web Frontend** - Next.js consuming the API. Feed rendering with category/sentiment filters.
3. **iOS App** - SwiftUI consuming the same API. Full feature parity with web.

Start with 3-5 sources, get end-to-end working, then expand.

---

**Project**: News Aggregator
**GitHub**: https://github.com/nikhilsi/news-aggregator
