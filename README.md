# ClearNews

A personal news reader that pulls from 53 RSS sources across 15 categories and serves them through a clean, filterable interface with an in-app reader view. No clickbait, no ad overload, no political noise (unless you want it).

**Live at**: [getclearnews.com](https://getclearnews.com)

## Why

Every major news source is drowning in ads, clickbait, and political rage. ClearNews is a calmer place to read: science, tech, entertainment, feel-good stories, local Seattle news, and the occasional weird gem.

## What It Does

- Aggregates **53 RSS sources** across **15 categories**: AI, Physical AI, Space, Technology, Science, General, Local (Seattle), India, Finance, Feel Good, Entertainment, Health, Sports, Offbeat, Travel
- **Today**: a brief of about 10 stories, picked every hour with Workers AI; **Latest** has everything
- One card per story: the same news from several outlets is grouped; deals, betting, quizzes, listicles and celebrity gossip are filtered out
- Every headline, summary and image is the publisher's; AI only labels, groups and ranks
- **Reader view**: clean extracted article text, dark mode, font scaling
- Two-tier sorting in Latest: a varied top section (a mix of sources and categories), then newest first
- Keyword search, infinite scroll, dark mode
- Feeds refresh every minute in the background; pages and the apps read stored results, so they load in milliseconds
- No accounts, no analytics, no tracking

## Download

| Platform | Status | Link |
|-|-|-|
| **Web** | Live | [getclearnews.com](https://getclearnews.com) |
| **iOS** | v2.0 on App Store | [App Store](https://apps.apple.com/app/id6759177704) |
| **Android** | v1.0.0 | [APK from GitHub Releases](https://github.com/nikhilsi/news-aggregator/releases) |

## Tech Stack

| Layer | Technology |
|-|-|
| API and feed refresh | TypeScript / Hono on a Cloudflare Worker, Cron Trigger, Durable Object |
| Storage | Workers KV |
| Web | Next.js 16 (React 19) static export / Tailwind CSS v4 |
| iOS | SwiftUI (zero external packages) |
| Android | Kotlin / Jetpack Compose / Material 3 |
| Hosting | Cloudflare Workers |
| CI/CD | GitHub Actions (Android release on tag push) |

## Project Structure

```
news-aggregator/
├── worker/               # Cloudflare Worker: API, feed refresh, reader (TypeScript)
│   ├── src/sources.ts    # Every news source and category
│   ├── test/             # Tests in the Workers runtime
│   └── scripts/          # deploy, verify, contract diff, decoder sweep, cutover
├── web/                  # Next.js site (static export served by the Worker)
├── ios/                  # SwiftUI iOS app
├── android/ClearNews/    # Kotlin + Jetpack Compose Android app
├── docs/                 # Architecture, runbook, reviews, plans
├── .github/workflows/    # Android release
├── fastlane/, fdroid/    # Android store metadata
├── CLAUDE.md             # Claude Code development guide
├── CURRENT_STATE.md      # Current build status
├── NOW.md                # Current priorities
└── CHANGELOG.md          # Version history
```

## Getting Started

Prerequisites: Node.js 20 or later. Android Studio or Xcode for the apps.

```bash
# Site (static export)
cd web && npm install && NEXT_PUBLIC_API_URL=/api/v1 npx next build

# Worker: tests, then a local server (GET /__scheduled runs one feed refresh)
cd ../worker && npm install && npm test && npm run dev
```

The iOS and Android apps point to the production API by default; no local server is needed for them.

Deploying needs the ClearNews Cloudflare token; see [docs/deploy-runbook.md](docs/deploy-runbook.md).

## Documentation

- **[docs/cloudflare-architecture.md](docs/cloudflare-architecture.md)**: how the Worker, cron, storage and reader work, and the API contract the apps rely on
- **[docs/deploy-runbook.md](docs/deploy-runbook.md)**: deploy, checks, rollback
- **[CURRENT_STATE.md](CURRENT_STATE.md)**: what's built
- **[NOW.md](NOW.md)**: what's next
- **[CHANGELOG.md](CHANGELOG.md)**: version history
- **[PROJECT.md](PROJECT.md)**: original design and history
- **[web/README.md](web/README.md)**, **[ios/README.md](ios/README.md)**, **[android/ClearNews/README.md](android/ClearNews/README.md)**: clients

## License

MIT License. See [LICENSE](LICENSE).
