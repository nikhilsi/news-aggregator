# News Aggregator

A personal news aggregator that pulls from multiple sources — RSS feeds, news APIs, and financial APIs — and serves them through a clean, filterable interface. No clickbait, no ad overload, no political noise (unless you want it).

## Why

Every major news source is drowning in ads, clickbait, and political rage. This project exists to build a personal news experience that surfaces what actually matters — science, tech, entertainment, feel-good stories, financial news, and the occasional weird/offbeat gem.

## What It Does

- Aggregates news from 20+ sources (RSS feeds, WorldNewsAPI, Alpha Vantage, Financial Modeling Prep)
- Filter by category: Science, Tech, Entertainment, Finance, Feel Good, Offbeat, Sports, Health
- Sentiment filtering — toggle to see only positive/uplifting news
- Clean reader view — read articles without visiting ad-heavy source sites
- On-demand fetching with smart caching (no background jobs)
- Simple username/password authentication

## Tech Stack

- **Backend**: Python / FastAPI / SQLite
- **Web**: Next.js (React)
- **iOS**: SwiftUI
- **Deployment**: DigitalOcean Droplet / Docker Compose

## Project Structure

```
news-aggregator/
├── backend/          # FastAPI REST API
├── web/              # Next.js web frontend
├── ios/              # SwiftUI iOS app
├── CLAUDE.md         # Claude Code development guide
├── PROJECT.md        # Full architecture & design documentation
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Xcode 16+ (for iOS development)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
uvicorn app.main:app --reload --port 8000
```

### Web Frontend

```bash
cd web
npm install
npm run dev  # Runs on port 3000
```

### iOS App

Open `ios/NewsAggregator.xcodeproj` in Xcode and run.

## Documentation

- **[PROJECT.md](PROJECT.md)** — Full architecture, data models, API contracts, source registry
- **[CLAUDE.md](CLAUDE.md)** — Development guide for Claude Code sessions
- **[CURRENT_STATE.md](CURRENT_STATE.md)** — Current build status
- **[CHANGELOG.md](CHANGELOG.md)** — Version history

## API Keys Required

| Service | Purpose | Tier |
|---------|---------|------|
| [WorldNewsAPI](https://worldnewsapi.com) | Sentiment-filtered news | Free (500 req/day) |
| [Alpha Vantage](https://www.alphavantage.co) | Financial/stock news | Premium |
| [Financial Modeling Prep](https://financialmodelingprep.com) | Financial news & data | Premium |

## License

Private project. Not for distribution.
