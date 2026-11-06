# Current State

**Last Updated**: November 5, 2026

## Status: Live on Cloudflare at getclearnews.com | iOS v2.0 on App Store | Android v1.0.0 (APK) | 53 sources across 15 categories

### Move to Cloudflare (Nov 1, 2026, task #400)

The site and API moved off the DigitalOcean droplet onto one Cloudflare Worker, `clearnews`, on the OmSpark account. The switchover ran at 17:02 UTC; the droplet and its DigitalOcean project were deleted the same day. The apps needed no change: the hostname, paths and JSON are the same, checked by a decoder sweep built from the iOS app's own model files (3,065 articles, 0 failures) and a contract diff against the droplet (0 unexpected differences). Architecture: [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md). Commands: [docs/deploy-runbook.md](docs/deploy-runbook.md).

Decisions made with the move (Nikhil): Google Analytics removed (it never worked: the CSP blocked it); a Cron Trigger refreshes feeds (the old no-cron rule is gone); FMP dropped (its subscription had lapsed) and Finance refilled with RSS; TypeScript rewrite in one Worker; DKIM and DMARC for the getclearnews.com mail domain.

## What's Built

### Worker (`worker/`, TypeScript on Cloudflare Workers)
- **One Worker** serves the static site, the API on `/api/v1/*` and `/health`, and the feed refresh. `run_worker_first`, so security headers and the www redirect live in code.
- **Feed refresh**: a Cron Trigger every minute calls a Durable Object (`Refresher`) pinned to Western North America (runs report SEA), so publishers always see requests from one US region. Each run refetches sources whose last check is 15 minutes old (conditional GETs, 10 s timeout, 5 MB cap), looks up missing og:images through a pool of six with carry-over by URL, passes every article through an output gate (dates exactly `YYYY-MM-DDTHH:MM:SSZ`, well-formed strings, required fields), and writes the merged lists to Workers KV. A failed source keeps its last good articles for up to 24 hours and is retried after 5 minutes.
- **Today and the AI step** (#414, 3.3.0): each cron run labels new articles with Gemma 4 26B on Workers AI (kind, topics, importance), embeds recent ones with bge-m3, and once an hour picks the Today brief (about 10 stories: a score makes a shortlist of 40, one editor call orders them). Deals, betting, quizzes, listicles and celebrity items are dropped everywhere; each tab shows one card per story; AI, Physical AI and Space also take matching stories from other sources. If Workers AI fails, Today keeps its brief for up to 6 hours, then shows the full list. About 1,200 Neurons a day, inside the free 10,000. Details: `docs/cloudflare-architecture.md` section 4.
- **API**: the same paths, parameters, JSON field names, key order, 422 bodies and Cache-Control the apps rely on. The first tab (`all`) is named Today; `latest` holds the full list; a search with no tab covers Latest. Articles carry two extra fields for the web, `topics` and `coverage`, after the apps' fields; the apps ignore unknown keys. Requests only read KV (a couple of milliseconds). `GET /api/v1/status` shows when the feed was built and, per source, the last success, status and data center.
- **Pipeline**: a line-by-line port of the Python normalization, non-Latin filter, dedup and two-tier sort. On 43 recorded feeds it matched the Python output exactly except three fixes (a UTF-8 feed labeled ISO-8859-1, NDTV photo captions taken as summaries, summaries lost near a bare "&").
- **Reader** (#423, 3.5.0): Defuddle with Mozilla Readability as the fallback, on linkedom; sanitize-html with the old nh3 allowlist; a cleanup pass for page furniture, repeated photos and captions, bylines and empty blocks; results kept in KV for 6 hours and Today's stories read ahead after each brief; video pages answer reason `video`; photos served resized from `getclearnews.com/img` with signed addresses (3.5.1). SSRF checks on every redirect hop (DNS over HTTPS, private and special ranges blocked), 3 MB cap, rate limited.
- **Rate limits**: 100 requests per 10 s per IP on the API, 20 per minute on the reader (Rate Limiting binding).
- **Tests**: 106 in the Workers runtime (Workers AI is mocked) (`npm test`), plus `verify.mjs` (live checks), `replay-brief.mjs` (Today rebuilt from production data with the real models, before a prompt change), `measure-reader.mjs` (the reader measured on production, before and after a change, #436), `contract-diff.mjs`, the Swift decoder sweep and `cutover.mjs` (switchover and rollback, rehearsed).

### Web Frontend (`web/`, Next.js 16.4.3 static export)
- Static files only (`output: 'export'`), served by the Worker. No Next server runs.
- **Today page** (#414 step 3, 3.4.0): the hourly brief as numbered rows with a finish line, "Covered by N outlets" lists, Fox and NPR marks on US politics stories, "New" marks since your last visit, and topic sections you pick (kept in the browser). Without a brief the first tab shows the full list with a note.
- Every other tab: card grid with infinite scroll (cards carry the same marks and outlet lists), category tabs (one scrolling row on phones), debounced search, reader modal with DOMPurify (links open in a new tab, long links wrap, a message per failure reason), dark mode, `/article?url=` for shared links, `/about`.
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

### Sources (53 enabled, `worker/src/sources.ts`; each shows its newest 30 items from the last 7 days)
Tabs in the order the apps show them, after Today and Latest:

| Category | Sources | Count |
|-|-|-|
| AI | The Decoder, Ars Technica AI, Latent Space, Simon Willison, Google DeepMind | 5 |
| Physical AI | The Robot Report, IEEE Spectrum Robotics, TechCrunch Robotics | 3 |
| Space | NASASpaceflight, Ars Technica Space, Universe Today, NASA | 4 |
| Technology | The Verge, Wired (deals and buying guides skipped), Ars Technica Tech | 3 |
| Science | Ars Technica Science, New Scientist, Scientific American, Quanta Magazine | 4 |
| General | Fox News (politics feed), NPR News (kept balanced right and left), BBC World (world news), 10 each | 3 |
| Local (Seattle) | GeekWire, KIRO 7, Cascade PBS | 3 |
| India | BBC News India, NDTV, Times of India, India Today, Scroll.in, The Hindu | 6 |
| Finance | CNBC (Business feed), BBC Business, The Guardian Business (US edition) | 3 |
| Feel Good | Good News Network, Positive News, Sunny Skyz, BBC Uplifting, DailyGood | 5 |
| Entertainment | A.V. Club, Polygon, Variety, Kotaku | 4 |
| Health | NPR Health, BBC Health | 2 |
| Sports | CBS Sports (betting items skipped) | 1 |
| Offbeat | Atlas Obscura, UPI Odd News, Smithsonian Magazine | 3 |
| Travel | Condé Nast Traveler, The Guardian Travel, Matador Network, Frommer's | 4 |

Good News Network and Frommer's were blocked on the droplet and work from Cloudflare. Hindi headlines are hidden in every tab. The apps build their tabs from `/api/v1/categories`, so new tabs need no release.

**Off:** AP News (a feedx copy that stopped in September), MyNorthwest and The Seattle Times (403 to Cloudflare), KING 5 (redirects Cloudflare to its YouTube channel), Crosscut (its feed became PBS national video; Cascade PBS replaces it), Engadget (mostly how-to pieces), Seattle Eater (evergreen guides), Mental Floss (lists and quizzes; Smithsonian replaces it), five Google News feeds (URL resolution too slow), WorldNewsAPI (never built).

## Known Issues
- **Some repeats stay two cards:** stories group at cosine 0.75, which misses some (the Alaska Senate ruling from CNBC and NPR measured 0.69). Lower thresholds merged unrelated stories.
- **Today can still show one saga twice** (the Binance hack, then withdrawals resuming, measured under 0.60); the editor prompt is what keeps them apart. To watch in the first days of briefs.
- **The apps' About screens** say "financial news APIs" until their next release.
- **Physical AI was thin** (about 19 stories a week, 15 from The Robot Report); since 3.3.0 it also takes robotics stories from every source. To check after a few days.
- **Reader gaps** (#423): NDTV and UPI Odd News block the reader (403; the app shows "doesn't allow reader view" and a link). Since Nov 1, BBC (all five feeds) and Smithsonian refuse the reader from Cloudflare too, though their pages load from a home connection (measured Nov 5, `docs/reviews/2026-11-01-reader-investigation.md` section 8). A lead paragraph is missing on some Atlas Obscura place pages and the odd Substack or Scientific American post. First opens take about 0.8 s at the median since two extractors run; second opens and Today's stories come from the cache.
- **Today can drop to 9 stories** late in the hour when a picked story falls out of its source's newest 30; the next hourly edition refills it.
- **Web topic picker:** unticking a topic moves it to the other list, so keyboard focus drops to the page.
- **A new edition reaches the web up to 5 minutes late**: article lists are cached in the browser for 5 minutes (`max-age=300`, unchanged from before); the refresh button bypasses it.

## What's Next

See NOW.md.
