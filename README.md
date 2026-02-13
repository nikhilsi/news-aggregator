# ClearNews

A personal news aggregator that pulls from 41 sources (RSS feeds + financial APIs) across 13 categories and serves them through a clean, filterable interface with an in-app reader view. No clickbait, no ad overload, no political noise (unless you want it).

**Live at**: [getclearnews.com](https://getclearnews.com)

## Why

Every major news source is drowning in ads, clickbait, and political rage. ClearNews exists to build a personal news experience that surfaces what actually matters — science, tech, entertainment, feel-good stories, and the occasional weird/offbeat gem.

## What It Does

- Aggregates news from 41 sources across 13 categories (39 RSS feeds + 2 financial API endpoints)
- **Reader view** — click any article to read clean, extracted content in-app (modal overlay, no page reload)
- Filter by category: General, Local (Seattle), Feel Good, Science, Technology, Entertainment, Finance, Health, Sports, Offbeat, Travel, India
- Two-tier article sorting — diverse top section (mix of sources/categories), then chronological
- Clean card-based feed with infinite scroll
- Dark mode with OS preference detection
- Keyword search across titles and summaries
- On-demand fetching with SWR caching (stale-while-revalidate) and startup warmup
- Pull-to-refresh / force refresh on both web and iOS (bypasses cache for fresh data)
- Article deduplication — URL match + title keyword overlap across sources
- Image extraction via og:image fallback for feeds without embedded images
- Financial news via FMP API (general news + market analysis)
- Simple email/password authentication

## Tech Stack

- **Backend**: Python 3.12 / FastAPI / SQLite
- **Web**: Next.js 16 (React 19) / Tailwind CSS v4
- **iOS**: SwiftUI (26 files, zero external packages, Dynamic Type, haptics)
- **Deployment**: DigitalOcean Droplet / Docker Compose / Nginx / Let's Encrypt

## Project Structure

```
news-aggregator/
├── backend/           # FastAPI REST API
├── web/               # Next.js web frontend
├── ios/               # SwiftUI iOS app
├── iosplan.md         # iOS architecture & build plan
├── deployment/        # Docker, nginx, setup/deploy scripts
│   ├── docker/        # Dockerfiles + docker-compose.prod.yml
│   ├── nginx/         # Host-level nginx config
│   └── scripts/       # setup.sh, deploy.sh, etc.
├── scripts/           # Local dev restart scripts
├── CLAUDE.md          # Claude Code development guide
├── PROJECT.md         # Full architecture & design documentation
├── CURRENT_STATE.md   # Current build status
├── NOW.md             # Current priorities
└── CHANGELOG.md       # Version history
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Web Frontend

```bash
cd web
npm install
cp .env.example .env.local
npm run dev  # Runs on port 3000
```

### iOS App

Open `ios/ClearNews/ClearNews/ClearNews.xcodeproj` in Xcode and run (Cmd+R). Points to the production API by default — no backend setup needed.

### Deployment

See [deployment/README.md](deployment/README.md) for the full production setup guide.

## Documentation

- **[PROJECT.md](PROJECT.md)** — Full architecture, data models, API contracts, source registry
- **[CLAUDE.md](CLAUDE.md)** — Development guide for Claude Code sessions
- **[CURRENT_STATE.md](CURRENT_STATE.md)** — Current build status
- **[CHANGELOG.md](CHANGELOG.md)** — Version history
- **[deployment/README.md](deployment/README.md)** — Production deployment guide
- **[backend/README.md](backend/README.md)** — API endpoints, services, folder structure
- **[web/README.md](web/README.md)** — Pages, components, hooks
- **[ios/README.md](ios/README.md)** — iOS app structure, services, key patterns
- **[iosplan.md](iosplan.md)** — iOS architecture & build plan

## License

Private project. Not for distribution.
