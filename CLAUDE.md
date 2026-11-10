# Claude Code Development Guide

---
**Last Updated**: November 9, 2026
**Purpose**: Rules and workflow for working with this codebase
---

## 🎯 Starting a New Session

**Read these docs in order:**

1. **CLAUDE.md** (this file) - Rules & workflow
2. **README.md** - Project overview
3. **PROJECT.md** - Full architecture, tech stack, data model, API design, source registry
4. **CURRENT_STATE.md** - What's built & current status
5. **CHANGELOG.md** - Version history & recent changes
6. **docs/cloudflare-architecture.md** - How the Worker, cron, storage and reader work; the API contract the apps rely on
7. **web/README.md** - Pages, components, hooks
8. **NOW.md** - What to work on next
9. **`git log --oneline -10`** - Recent commits

**Optional** (if relevant to task):
- **ios/README.md** - SwiftUI app structure
- **android/ClearNews/README.md** - Android app architecture
- **worker/src/sources.ts** - News source configuration


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

**This is a personal news aggregator with three clients sharing one Cloudflare Worker.**

```
Next.js Web App    ──┐
iOS SwiftUI App    ──┼──▶  Cloudflare Worker  ──▶  RSS feeds
Android Compose App ─┘     (site, API, cron; KV)
```

**Key architectural decisions:**
- **One Cloudflare Worker** (`worker/`) - serves the site (Next.js static export from `web/`), the API on `/api/v1/*` and `/health`, and a Cron Trigger. No user accounts. Two Worker secrets: `PHOTO_KEY` (reader photo addresses) and `APNS_KEY` (Apple push key, #435).
- **Notifications** (#435, #487) - the iOS app signs up with `POST /api/v1/notifications`; the device list is a table in the Refresher Durable Object's SQLite storage; each minute the cron sends the morning edition and breaking news straight to Apple's push service (`docs/435-notifications-design.md`).
- **Cron refresh** - Every minute the cron refetches sources whose last check is 15 minutes old (conditional GETs), looks up missing og:images, and writes the merged lists to Workers KV. Requests only read KV. Status per source: `GET /api/v1/status`.
- **Fixed by the published apps** - The hostname, the `/api/v1` paths, every JSON field the iOS and Android apps decode, and `/article?url=` must not change (`docs/cloudflare-architecture.md`).
- **Source registry** - All news sources defined in `worker/src/sources.ts`. Adding or removing a source is a one-line change plus a deploy.
- **RSS only** - Free RSS feeds. FMP (financial API) was dropped in Nov 2026.
- **Reader view** - Article extraction (Mozilla Readability) with SSRF checks on every redirect hop and allowlist HTML sanitization (sanitize-html)

**Architecture on Cloudflare: `docs/cloudflare-architecture.md`. Older design history: PROJECT.md**

---

## 🗄️ Tech Stack

| Layer | Technology |
|-|-|
| API and cron | TypeScript / Hono on Cloudflare Workers |
| Storage | Workers KV (written only by the Cron Trigger); the notification device list in the Refresher Durable Object's SQLite |
| Web Frontend | Next.js (React) / Tailwind |
| iOS App | Swift / SwiftUI |
| Android App | Kotlin / Jetpack Compose / Material 3 |
| Deployment | Cloudflare Workers, OmSpark account (ClearNews token) |

---

## 🗄️ Environment Setup

No API keys to set up locally. The deploy token lives in `~/.secrets/cloudflare/clearnews.env`; never use the Mac's default wrangler login. Worker secrets (`PHOTO_KEY`, `APNS_KEY`) live only in Cloudflare; the Apple keys are in `~/.secrets/apple/` (`docs/deploy-runbook.md`). The Android signing key is in `android/ClearNews/keystore/` (gitignored), backed up in `~/.secrets/android/`; GitHub Actions holds a copy it can't give back.

**Starting Dev:**
```bash
# Site (static export), needed by the Worker tests and wrangler dev
cd web && NEXT_PUBLIC_API_URL=/api/v1 npx next build

# Worker: tests, then a local server; GET /__scheduled runs the cron once
cd worker && npm test && npm run dev
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
- **docs/cloudflare-architecture.md** - Architecture on Cloudflare
- **docs/deploy-runbook.md** - Deploy, checks, rollback
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
