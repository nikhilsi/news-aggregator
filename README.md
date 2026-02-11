# ClearNews

A personal news aggregator that pulls from 21+ RSS sources and serves them through a clean, filterable interface. No clickbait, no ad overload, no political noise (unless you want it).

**Live at**: [getclearnews.com](https://getclearnews.com)

## Why

Every major news source is drowning in ads, clickbait, and political rage. ClearNews exists to build a personal news experience that surfaces what actually matters — science, tech, entertainment, feel-good stories, and the occasional weird/offbeat gem.

## What It Does

- Aggregates news from 21 RSS sources across 8 categories
- Filter by category: Science, Technology, Entertainment, Feel Good, Health, Sports, Offbeat
- Clean card-based feed with infinite scroll
- Dark mode with OS preference detection
- Keyword search across titles and summaries
- On-demand fetching with smart caching (no background jobs)
- Simple email/password authentication

## Tech Stack

- **Backend**: Python 3.12 / FastAPI / SQLite
- **Web**: Next.js 16 (React 19) / Tailwind CSS v4
- **iOS**: SwiftUI (planned)
- **Deployment**: DigitalOcean Droplet / Docker Compose / Nginx / Let's Encrypt

## Project Structure

```
news-aggregator/
├── backend/           # FastAPI REST API
├── web/               # Next.js web frontend
├── ios/               # SwiftUI iOS app (planned)
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

## License

Private project. Not for distribution.
