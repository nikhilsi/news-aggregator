# ClearNews

A personal news aggregator that pulls from 41 sources (RSS feeds + financial APIs) across 13 categories and serves them through a clean, filterable interface with an in-app reader view. No clickbait, no ad overload, no political noise (unless you want it).

**Live at**: [getclearnews.com](https://getclearnews.com)

## Why

Every major news source is drowning in ads, clickbait, and political rage. ClearNews exists to build a personal news experience that surfaces what actually matters — science, tech, entertainment, feel-good stories, and the occasional weird/offbeat gem.

## What It Does

- Aggregates news from **41 sources** across **13 categories** (39 RSS feeds + 2 financial API endpoints)
- **Reader view** — clean, extracted article content with dark mode CSS, font scaling, and CSP
- Filter by category: General, Local (Seattle), Feel Good, Science, Technology, Entertainment, Finance, Health, Sports, Offbeat, Travel, India
- Two-tier article sorting — diverse top section (mix of sources/categories), then chronological
- Clean card-based feed with infinite scroll
- Dark mode with OS preference detection
- Keyword search across titles and summaries
- SWR caching (24h stale window), background refresh loop, conditional HTTP requests (ETag/Last-Modified → 304)
- Non-blocking pull-to-refresh (returns cached data instantly, refreshes in background)
- Article deduplication — URL match + title keyword overlap across sources
- Smart sharing — articles shared with title, source, and ClearNews reader link
- Security hardened — SSRF protection, allowlist HTML sanitization (nh3 + DOMPurify), CSP headers

## Download

| Platform | Status | Link |
|----------|--------|------|
| **Web** | Live | [getclearnews.com](https://getclearnews.com) |
| **iOS** | v2.0 on App Store | [App Store](https://apps.apple.com/app/id6759177704) |
| **Android** | v1.0.0 | [APK from GitHub Releases](https://github.com/nikhilsi/news-aggregator/releases) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 / FastAPI |
| Cache | In-memory (SWR with 24h stale window) |
| Web | Next.js 16 (React 19) / Tailwind CSS v4 |
| iOS | SwiftUI (26 files, zero external packages) |
| Android | Kotlin 2.1 / Jetpack Compose / Material 3 |
| Images | Coil 3 (Android) |
| HTTP | OkHttp 4 (Android), URLSession (iOS) |
| Deployment | DigitalOcean / Docker Compose / Nginx / Let's Encrypt |
| CI/CD | GitHub Actions (Android release on tag push) |

## Project Structure

```
news-aggregator/
├── backend/              # FastAPI REST API
├── web/                  # Next.js web frontend
├── ios/                  # SwiftUI iOS app
├── android/ClearNews/    # Kotlin + Jetpack Compose Android app
├── deployment/           # Docker, nginx, setup/deploy scripts
│   ├── docker/           # Dockerfiles + docker-compose.prod.yml
│   ├── nginx/            # Host-level nginx config
│   └── scripts/          # setup.sh, deploy.sh, etc.
├── .github/workflows/    # CI/CD (Android release)
├── fastlane/             # F-Droid metadata
├── fdroid/               # F-Droid build recipe
├── scripts/              # Local dev restart scripts
├── docs/                 # Architecture & planning docs
├── CLAUDE.md             # Claude Code development guide
├── PROJECT.md            # Full architecture & design documentation
├── CURRENT_STATE.md      # Current build status
├── NOW.md                # Current priorities
└── CHANGELOG.md          # Version history
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Android Studio (for Android development)

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

### Android App

Open `android/ClearNews/` in Android Studio and run on emulator or device. Points to the production API by default — no backend setup needed.

```bash
# Or build from command line
cd android/ClearNews
./gradlew assembleDebug
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
- **[ios/README.md](ios/README.md)** — iOS app structure, services, key patterns
- **[android/ClearNews/README.md](android/ClearNews/README.md)** — Android app architecture, build instructions
- **[docs/android-app.md](docs/android-app.md)** — Android implementation plan

## License

MIT License — see [LICENSE](LICENSE) for details.
