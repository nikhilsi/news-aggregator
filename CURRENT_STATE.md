# Current State

**Last Updated**: November 1, 2026

## Status: Live on Cloudflare at getclearnews.com | iOS v2.0 on App Store | Android v1.0.0 (APK) | 42 sources across 13 categories

### Move to Cloudflare (Nov 1, 2026, task #400)

The site and API moved off the DigitalOcean droplet onto one Cloudflare Worker, `clearnews`, on the OmSpark account. The switchover ran at 17:02 UTC; the droplet and its DigitalOcean project were deleted the same day. The apps needed no change: the hostname, paths and JSON are the same, checked by a decoder sweep built from the iOS app's own model files (3,065 articles, 0 failures) and a contract diff against the droplet (0 unexpected differences). Architecture: [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md). Commands: [docs/deploy-runbook.md](docs/deploy-runbook.md).

Decisions made with the move (Nikhil): Google Analytics removed (it never worked: the CSP blocked it); a Cron Trigger refreshes feeds (the old no-cron rule is gone); FMP dropped (its subscription had lapsed) and Finance refilled with RSS; TypeScript rewrite in one Worker; DKIM and DMARC for the getclearnews.com mail domain.

## What's Built

### Worker (`worker/`, TypeScript on Cloudflare Workers)
- **One Worker** serves the static site, the API on `/api/v1/*` and `/health`, and the feed refresh. `run_worker_first`, so security headers and the www redirect live in code.
- **Feed refresh**: a Cron Trigger every minute calls a Durable Object (`Refresher`) pinned to Western North America (runs report SEA), so publishers always see requests from one US region. Each run refetches sources whose last check is 15 minutes old (conditional GETs, 10 s timeout, 5 MB cap), looks up missing og:images through a pool of six with carry-over by URL, passes every article through an output gate (dates exactly `YYYY-MM-DDTHH:MM:SSZ`, well-formed strings, required fields), and writes the merged lists to Workers KV. A failed source keeps its last good articles for up to 24 hours and is retried after 5 minutes.
- **API**: the same paths, parameters, JSON field names, key order, 422 bodies and Cache-Control the apps rely on. Requests only read KV (a couple of milliseconds). `GET /api/v1/status` shows when the feed was built and, per source, the last success, status and data center.
- **Pipeline**: a line-by-line port of the Python normalization, non-Latin filter, dedup and two-tier sort. On 43 recorded feeds it matched the Python output exactly except three fixes (a UTF-8 feed labeled ISO-8859-1, NDTV photo captions taken as summaries, summaries lost near a bare "&").
- **Reader**: Mozilla Readability on linkedom, sanitize-html with the old nh3 allowlist, SSRF checks on every redirect hop (DNS over HTTPS, private and special ranges blocked), 3 MB cap, rate limited.
- **Rate limits**: 100 requests per 10 s per IP on the API, 20 per minute on the reader (Rate Limiting binding).
- **Tests**: 70 in the Workers runtime (`npm test`), plus `verify.mjs` (live checks), `contract-diff.mjs`, the Swift decoder sweep and `cutover.mjs` (switchover and rollback, rehearsed).

### Web Frontend (`web/`, Next.js 16.4.3 static export)
- Static files only (`output: 'export'`), served by the Worker. No Next server runs.
- Same features as before: card feed with infinite scroll, category tabs, debounced search, reader modal with DOMPurify, dark mode, `/article?url=` for shared links, `/about`.
- Google Analytics removed. The API base is `/api/v1` on the same origin.
- `/privacy` and `/support` are static pages in `web/public/` (opened from both apps).

### iOS App (SwiftUI): v2.0, live on the App Store
- Unchanged by the move; it calls `https://getclearnews.com` as before. Full feature list in [ios/README.md](ios/README.md).

### Android App (Kotlin + Jetpack Compose): v1.0.0
- Unchanged by the move. Ships as a signed APK on GitHub Releases (GitHub Actions on tag push). The F-Droid merge request (#34426) was closed on May 8, 2026 without merging; ClearNews is not on F-Droid.

### API Endpoints
| Method | Endpoint | Description |
|-|-|-|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/api/v1/articles` | Articles (category, source, search, page, per_page up to 50, refresh) |
| GET | `/api/v1/articles/reader` | Clean article content for the reader view (SSRF-protected) |
| GET | `/api/v1/sources` | Configured sources |
| GET | `/api/v1/categories` | Categories with enabled source counts (empty ones hidden) |
| GET | `/api/v1/status` | Feed build time and per-source status (no client uses it) |

### Sources (42 enabled, `worker/src/sources.ts`)
| Category | Sources | Count |
|-|-|-|
| General | AP News, Fox News | 2 |
| Local (Seattle) | GeekWire, Seattle Eater, Crosscut, KIRO 7 | 4 |
| Feel Good | Good News Network, Positive News, Sunny Skyz, BBC Uplifting, DailyGood | 5 |
| Science | Ars Technica Science, NASA, New Scientist, Scientific American | 4 |
| Technology | The Verge, Wired, Ars Technica Tech, Engadget | 4 |
| Entertainment | A.V. Club, Polygon, Variety, Kotaku | 4 |
| Finance | CNBC, BBC Business, The Guardian Business | 3 |
| Health | NPR Health, BBC Health | 2 |
| Sports | CBS Sports | 1 |
| Offbeat | Atlas Obscura, Mental Floss, UPI Odd News | 3 |
| Travel | Condé Nast Traveler, The Guardian Travel, Matador Network, Frommer's | 4 |
| India | BBC News India, NDTV, Times of India, India Today, Scroll.in, The Hindu | 6 |

Good News Network, AP News, Seattle Eater and Frommer's were blocked on the droplet and work from Cloudflare.

**Off:** MyNorthwest and The Seattle Times (403 to Cloudflare), KING 5 (redirects Cloudflare to its YouTube channel), Smithsonian (403 to the droplet; not retested), five Google News feeds (URL resolution too slow), WorldNewsAPI (never built).

## Known Issues
- **India tab noise** (#413): the same story from several outlets, old and off-topic items, roundups. First change after the move.
- **Frommer's** sends about 300 items; the per-source cap in #413 trims it.
- **The apps' About screens** say "financial news APIs" until their next release.

## What's Next

See NOW.md.
