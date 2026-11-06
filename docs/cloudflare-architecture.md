# Architecture: ClearNews on Cloudflare

**Status:** live on getclearnews.com since Nov 1, 2026, 17:02 UTC (task #400, the move off DigitalOcean). Spec revised the same day after the independent review (`docs/reviews/2026-11-01-spec-review.md`, 16 findings, responses in that file). Runbook: [deploy-runbook.md](deploy-runbook.md).  
**Decided by Nikhil, Nov 1, 2026:** move to the OmSpark Cloudflare account to retire the $6 droplet; remove Google Analytics; drop the repo's no-cron rule and refresh feeds with a Cron Trigger; drop FMP and refill Finance with free RSS feeds; rewrite the API in TypeScript in one Worker; add DKIM and DMARC after the switchover. He also agreed to the design calls in section 11.  
**Inputs:** inventory `docs/reviews/2026-11-01-inventory.md`, research `docs/reviews/2026-11-01-research-cloudflare.md`. References such as "O8" and "inventory 2.7" point into the inventory; "R5" points into the review.  
**Fixed by the published apps:** the hostname `https://getclearnews.com`, the paths `/api/v1/articles`, `/api/v1/articles/reader`, `/api/v1/categories`, `/health`, `/privacy`, `/support`, the web route `/article?url=`, and every JSON field name and type the apps decode (inventory 6.2). iOS 2.1 (#425, built Nov 5, 2026, not released yet) also reads `topics`, `coverage` and `brief_at`, leniently: without them it still loads. Once 2.1 is on the App Store, keep them.


## 1. What changes

| Droplet (until the switchover) | Cloudflare |
|-|-|
| nginx: TLS, http and www redirects, routing, 10 r/s rate limit, security headers, static `/privacy` and `/support` | One Worker, `clearnews`, with `run_worker_first: true`: the Worker sees every request and does the www redirect, routing, rate limits and headers in one file. Cloudflare does TLS; the zone's Always Use HTTPS does http to https |
| FastAPI on uvicorn (Python 3.12, `backend/`) | The same five routes on Hono in the same Worker (`worker/src/`), plus a status route |
| In-memory cache, startup warmup, refresh loop every 25 s | A Cron Trigger every minute refreshes due feeds into Workers KV. Requests only read KV |
| Next.js 16.1.6 standalone server | Next.js 16.4.3 static export (`output: 'export'`), served as the Worker's static assets. No Next server runs |
| Docker Compose, UFW, fail2ban, Let's Encrypt, deploy over SSH | Nothing to patch. Deploys with wrangler from the Mac using the ClearNews token |
| FMP API key on the droplet | No secrets at all |

Cost: about $0 a month extra. The account already pays Workers Paid ($5 a month for all Workers); cron runs, API requests and KV use fit inside the included amounts (research 8). The $6 droplet goes away.

## 2. The parts

```
apps and browsers ──HTTPS──> getclearnews.com, www.getclearnews.com   (Worker "clearnews", custom domains)
                                │
                                └─ worker/src/index.ts  (run_worker_first: every request)
                                     ├─ host www.*            301 to https://getclearnews.com, path and query kept
                                     ├─ /health, /api/v1/*    Hono API ──reads──> KV "feed", "state"
                                     │                          ├─ reader ──fetch──> article page (SSRF checked)
                                     │                          └─ API_LIMITER, READER_LIMITER (Rate Limiting)
                                     └─ everything else       env.ASSETS (web/out), security headers added

Cron "* * * * *" ──> scheduled()  ──fetch──> RSS feeds and og:image pages
                                   ──writes─> KV "feed" (merged lists), then KV "state" (per source)
```

- **One Worker** for site, API and cron. One deploy, one config, one set of headers.
- **`run_worker_first: true`** (as Recurate). Static assets are otherwise served before the Worker, so `www` would serve the whole site and headers would need a separate `_headers` file. Running the Worker first costs one Worker request per page or asset load; at today's traffic (inventory 9.3) that is far inside the 10 million requests a month included.
- **The page path cannot take the site down (R13).** For anything that is not `/api/*` or `/health`, the Worker fetches the asset and copies headers onto it. If anything in that step throws, it returns the unmodified `env.ASSETS.fetch(request)` response. `/privacy` and `/support` (opened from both apps' About screens) stay up even if header code breaks.
- **Bindings** (`worker/wrangler.jsonc`): `CACHE` (KV namespace `clearnews-cache`), `API_LIMITER` (namespace id 4001) and `READER_LIMITER` (4002) for Rate Limiting (TourGraph uses 3001, Recurate 2001 and 2002), `ASSETS` (directory `../web/out`, `not_found_handling: "404-page"`, `html_handling: "auto-trailing-slash"`). No secrets, no environment variables.
- **Observability on** (`"observability": { "enabled": true }`), so cron and request logs are kept, not only visible in a live tail (R3).
- **Workers Caching stays off.** Its cache key leaves out the hostname, so a cached `www` redirect could loop on the apex (R13).
- **Flags:** `nodejs_compat`, `global_fetch_strictly_public`; a compatibility date from late October 2026.
- **Layout in the repo:** `worker/` (new: Worker code, `wrangler.jsonc`, tests, scripts), `web/` (static export). `backend/` and `deployment/` stay untouched until Nikhil deletes the droplet, then are removed.

## 3. API contract

Kept exactly, checked by the tests in section 9:

- Paths, methods (GET, and HEAD), query parameters and their defaults, bounds and validation (inventory 1.4), including FastAPI's 422 body shape for the cases the inventory recorded (`page` and `per_page` bounds and parse errors, `refresh` parse errors, missing reader `url`) and the 400 reader messages (`URL scheme not allowed`, `Invalid URL`, `URL not allowed`).
- Every response field, its key order, its type and its null behavior (inventory 1.2 and 6.2). Null fields are sent as `null`, never omitted. `sentiment` stays `null`. `source_type` stays `"rss"`.
- `published_at` as `YYYY-MM-DDTHH:MM:SSZ` (UTC, second precision, `Z`), the format the apps receive today.
- Pagination math, `total_pages` at least 1, past-the-end pages empty (inventory 1.4).
- `/health` body exactly `{"status":"ok"}`.
- `/api/v1/categories`: bare array in `sources` file order, `all` first with the enabled source count, categories with no enabled source hidden.
- `/api/v1/sources`: bare array of every configured source in file order.
- Query decoding: standard form decoding (`+` becomes a space, inventory 6.6).
- `Cache-Control: public, max-age=300` on 2xx articles, categories and sources; `no-store` when `refresh=true`.
- Pipeline semantics (inventory 2.3 to 2.9): RSS field mapping, the image order, the summary cut at 500 characters, `strip_html` spacing as today, the visual stories ad filter, the non-Latin filter (20 percent, skipped for `india`), dedup by URL then title keywords (0.6 overlap, same category, image preferred, first seen in `sources` order wins ties), two-tier sort, search on lowercased title and summary after sort, og:image lookups on the first 15,000 characters with today's two patterns.

**Every article passes one output gate before it is stored (R2).** Required fields are non-empty strings; `image_url` is an absolute http(s) address or null (anything else, such as NPR's `undefined` placeholder, becomes null; #453); `published_at` is null or matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`; every string is well formed (`toWellFormed()`, so no lone surrogate reaches iOS); summaries are cut by code points (`Array.from`), not UTF-16 units. Dates come from one function that returns null unless the date is valid with a year from 1 to 9999; zone names V8 does not know (`IST`, `CEST`, `CET`, `BST`, `AEST`, `JST`) are mapped from a small table first. An article that fails the gate is dropped and logged.

Deliberate differences (none breaks a client; each is on the test allow list):

| Before | Now | Why |
|-|-|-|
| One undated article, or a zone-less date, makes `/api/v1/articles` return 500 | Undated articles sort last; every date is normalized to UTC | O1, O29 |
| A failed feed fetch empties that source for 15 minutes | The source keeps its last good articles for up to 24 hours (today's stale window), then they are dropped and logged | O2, R6 |
| A feed that keeps answering 304 serves the same items forever | Conditional headers are sent only if the last full fetch is under 24 hours old, so every feed gets at least one full fetch a day | O3 |
| Feeds decoded by the charset in the header, so a UTF-8 feed labeled ISO-8859-1 shows `Toddlerâ€™s` (Sunny Skyz, live today) | Bodies that are valid UTF-8 are decoded as UTF-8; otherwise the declared charset | R10 |
| feedparser took a photo caption (`<media:description>` inside `<media:content>`) as the summary when it came before `<description>` (NDTV, 19 of 20 items on Nov 1) | The item's `<description>` | parity run Nov 1 |
| A summary whose last 34 characters held a bare `&` ("Alabama A&M") came out empty: Python's HTMLParser held the text back and `strip_html` never closed the parser | The full summary | parity run Nov 1 |
| `refresh=true` starts a background refresh and answers `complete: false` | Answers the newest stored feed with `complete: true` and `no-store`. The cron keeps feeds fresh; clients never retry after a refresh (inventory 6.4), so nothing changes for them | research 9 |
| `complete: false` partial pages were cached for 5 minutes | `complete: false` happens only before the first cron run fills KV; such responses get `no-store` | O5 |
| `public, max-age=300` also on 422 and other errors | `no-store` on every 4xx and 5xx, including the new 429 | O6, R13 |
| HEAD on API paths: 405 | HEAD answers like GET without a body | O20 |
| `/api/v1/categories/` redirects 307 to `http://...` | 301 to the same path without the slash, on https | O19 |
| A repeated query key: the last value wins | The first value wins (Hono and `URLSearchParams`); no client repeats a key | R11 |
| CORS headers for `https://getclearnews.com` | No CORS headers: the site calls its own origin and the apps send no Origin (inventory 1.5) | not exercised |
| nginx rate limit: 10 r/s per IP, burst 20, answered 503 | Rate Limiting binding, approximate and per Cloudflare location: 100 requests per 10 s per IP on `/api/*` and `/health`; 20 per 60 s per IP on the reader. Answer 429 `{"detail":"Too Many Requests"}` | research 5 |
| Reader: readability-lxml, trafilatura fallback, nh3 | Defuddle with Readability as the fallback, both on linkedom (with `<base href>` set to the final URL), sanitize-html with the same allowlist, then a cleanup pass (#423, section 6) | research 1.1, 1.2, #423 |
| Reader results cached 60 minutes, failures too | Cached in KV since #423 (6 hours; 30 minutes for a block or timeout), and Today's stories read ahead hourly | R14, #423 |
| Reader: any content type is handed to the extractors | Only `text/html` and `application/xhtml+xml`; anything else fails as `extraction_empty`, the reason a non-article page gets today | R12 |
| Reader input checks as Python's `urlparse` | WHATWG `URL` parsing: a few odd inputs (for example `https:example.com`) are now accepted or rejected differently; responses keep the same three 400 messages | R12 |
| Reader SSRF checks | Hardened (section 6) | O8 |
| `source_type` could be `financial_api` | Always `rss` (FMP dropped) | decision 3 |
| Response headers `Server: nginx/1.24.0`, `X-Powered-By: Next.js`, `X-XSS-Protection: 1; mode=block`, CSP with `'unsafe-eval'` | The repo's intended header set (section 7) | O30 |
| `/about/` 308 to `/about` (Next) | 307 to `/about` (Workers assets) | platform default |
| Reader `extracted_at` with microseconds (`.ffffffZ`) | Milliseconds (`.mmmZ`) | no client reads it (inventory 6.2) |
| (none) | `GET /api/v1/status`: when `feed` was built and, per source, the last success and last status. No client calls it | R3 |

Deferred from the move and shipped with #413 (3.1.0): the `strip_html` spacing fix (O17), and a per-source limit of the newest 30 items within 7 days.

## 4. Feeds: the Cron Trigger

**Schedule:** `* * * * *` (every minute, UTC). The cron hands each run to a Durable Object, `Refresher`, created with location hint `wnam`, so every feed and og:image fetch leaves from Western North America (SEA on Nov 1, 2026). Added after the switchover: cron runs otherwise execute anywhere (DFW, IAD, HKG, MAD, MEL, NRT, OTP were seen in the first hour), and The Seattle Times refused every non-US run. Each run:

1. **Read `state`** from KV: one JSON value, about 1 MB, with a schema version `v`, `run_seq`, `written_at`, and per source the validators, `checked_at`, `ok_at`, `full_at`, last status, failure count and normalized articles. The run logs how old the `state` it read is (`now - written_at`). If `state` is missing, unreadable or has another `v` (first deploy, a wrong binding, a rollback to older code), this run is a **full run**: every enabled source is fetched, and if a `feed` exists the run logs an error (R5).
2. **Pick due sources:** every enabled source with `now - checked_at >= 15 min`, or whose last attempt failed and `now - checked_at >= 5 min`. No cap per run: a normal run has 1 to 4 due sources, and a full run measured 39 feeds in 1.3 s (research 2).
3. **Fetch them all at once** (the platform queues past six open connections). Per source, inside its own `try`/`catch`: `cache: 'no-store'`, the browser User-Agent used today, `If-None-Match` and `If-Modified-Since` when known and `full_at` is under 24 hours old, a 10 s timeout, and the body read as a stream with a 5 MB cap (ten times the largest feed today; R4).
   - 304: keep articles, update `checked_at`.
   - 2xx: decode (UTF-8 if valid, else the declared charset), parse with feedsmith (entity expansion limits on), normalize (section 3). For articles **without a feed image**, carry over the previous og:image result by URL, and look up new ones through a pool of six requests, each with its own 5 s timer started when it is sent, reading the first 15,000 characters. An article is marked "og checked" only on a definite answer (a parsed 2xx, or 404 or 410), so timeouts are retried on the next full fetch (R7). Update validators, `ok_at`, `full_at`.
   - Error, timeout or over the cap: keep articles, record status and failure count.
4. **Age limit:** a source whose `ok_at` is over 24 hours old loses its articles (logged), as an entry turned into a MISS after 24 hours today (R6).
5. **Output gate** on every new or changed article (section 3).
6. **Rebuild `feed`** if any source's articles changed: for `all` and each category, the non-Latin filter (not for `india`), dedup and two-tier sort over that category's sources in `sources` order, as a request does today. Stored as one JSON value with `v` and `built_at`: the unique articles once, keyed by `source_id` and `url` (the same URL from two sources stays two articles, R11), plus per category an ordered index array.
7. **Write order:** `ai` (when the AI step changed it, below), then `feed`, then `state` (with `run_seq` + 1 and `written_at`). If the `feed` write fails, `state` is not written, so the next run sees the same change and rebuilds (R7).
8. **Run deadline:** 40 s. Work still pending then is dropped and the run goes to step 6 with what it has.
9. **Log** one line per run: `run_seq`, `state` age, sources fetched with status and item counts, articles dropped by the gate, CPU used.

**AI step (#414, added Nov 1, 2026).** Between steps 5 and 6, `src/ai/enrich.ts` runs on the articles the cron holds. It never fails the run.

- **Labels:** `@cf/google/gemma-4-26b-a4b-it` with thinking off and a JSON schema labels each new article, newest first, in batches of 25 (up to 8 at once): kind (news, analysis, feature, how-to, deals, betting, quiz, listicle, celebrity, opinion), up to three topics (main first) and importance 1 to 5. US politics means the United States only; a story labeled India never also counts as US politics.
- **Embeddings:** `@cf/baai/bge-m3` on title and summary, for labeled articles from the last 48 hours, stored 8-bit.
- **Storage:** both kept by article URL in the KV key `ai` (version `v`; a new version redoes every label), with the Today brief; pruned to the articles in `state`.
- **Brief, hourly:** once the last 30 hours are labeled and embedded, stories (articles grouped at cosine 0.75) are scored, the top 40 go to one editor call that orders 14, and the first 10 that are not near repeats (0.70) and stay within 2 India stories, 2 US politics stories and 2 per outlet become Today. Prompts and the measurements behind each number: `src/ai/*.ts` and `docs/414-worth-opening.md` section 7.
- **Time:** each call has a limit inside the run's 40 s deadline (labels need 20 s left, the editor 8 s); unfinished work waits for the next run.
- **Failure:** unlabeled articles count as news; Today keeps its brief for up to 6 hours, then shows the full list.
- **Cost:** about 1,200 Neurons a day (labels and 24 briefs) against 10,000 free.

**Step 6 with the AI step:** deals, betting, quizzes, listicles and celebrity items are dropped from every list; each list keeps one card per story; AI, Physical AI and Space add matching stories from other sources (topic `ai` first, or `physical_ai` or `space` anywhere); `latest` is the merged list `all` used to be; `all` is the brief while it is under 6 hours old, else the `latest` list. Each served article carries `topics` and `coverage` (the other outlets' articles in its story: one entry per outlet and URL, never the card's own URL, since one article can sit in two feeds; #453).

Limits per run (Workers Paid): 30 s CPU, 15 min wall, 10,000 subrequests. Measured locally: all 39 feeds in 1.3 s wall and 60 ms parse CPU; 170 og:image pages in 2.9 s; dedup 11 to 15 ms (research 1.2, 2).

**KV consistency.** KV is eventually consistent (up to about 60 s between locations). A run can read a `state` that misses the previous minute's write. Since every due source is fetched (no cap), it picks the same sources again, fetches them a second time with conditional headers and writes them, so nothing is lost; the cost is a redundant fetch. The `state` age in the log line measures how often this happens. If it shows up often, `state` moves to D1 and `feed` stays in KV (research 3). With the 40 s deadline, one run ends before the next starts.

**Sources file.** `backend/sources.yaml` becomes `worker/src/sources.ts`: the same categories and sources, typed, with comments kept. Adding or removing a source stays a one-line data change plus a deploy. Changes now: the two FMP sources removed; two or three free finance RSS feeds added (Nikhil approves the list; they must run on `workers.dev` through the gate day, R9); the five Google News sources and WorldNewsAPI stay listed and disabled. The Google News resolver is not ported (O35).

## 5. Requests

- **`/api/v1/articles`:** reads `feed` from KV (default `cacheTtl`, 60 s, one value for every read; R14), picks the category's index array, applies search, paginates. About 2 ms of CPU for a 0.7 MB value (research 1.2). Every lookup keyed by user input uses a `Map` or `Object.hasOwn`, so `?category=constructor` returns an empty page as today, not a 500 (R11). `source=<id>` (no client sends it) reads `state` and runs the same pipeline on that one source, so its output matches today's (O16). If `feed` is missing, answers an empty page with `complete: false` and `no-store`; clients retry after 3 s. On a brand new namespace that miss can be cached at the edge for up to 60 s, so the first deploy is warmed by a full cron run before anyone uses it (R5).
- **Today and Latest (#414):** `all` keeps its id, since every app opens it first, and is named "Today": the brief. `latest` ("Latest", second) holds the full list. A search with no category (the first tab in all three apps) covers `latest`, so search still finds every article. The first tab without a search also answers `brief_at` after `complete`: when its brief was built, or null while it shows the full list (for the web's Today page, step 3; the apps ignore unknown keys). Other tabs and searches keep exactly `articles`, `pagination`, `complete`.
- **`/api/v1/categories`, `/api/v1/sources`:** built from `sources.ts`; no KV read.
- **`/health`:** `{"status":"ok"}`, no KV read (as today: it reports the process, not the feeds).
- **`/api/v1/status`:** `feed.built_at`, when the Today brief was picked and its size, and per source `ok_at`, `checked_at`, last status and article count, read from KV (R3).
- **Unknown `/api/*` paths:** 404 `{"detail":"Not Found"}`. Other methods: 405 `{"detail":"Method Not Allowed"}`. Every 4xx and 5xx gets `no-store`.

## 6. Reader

1. Parse with WHATWG `URL`. Scheme must be `http` or `https` (400 `URL scheme not allowed`); hostname must be present and the URL must carry no username or password (400 `Invalid URL`).
2. SSRF check, applied to the first URL and to every redirect hop (400 `URL not allowed` on the first URL; a failed hop ends as `failed` with reason `error`). With the hostname lowercased and a trailing dot removed, reject:
   - IP literal hosts in any form WHATWG normalizes (`2130706433`, `0x7f.1`, `[::ffff:7f00:1]`);
   - `localhost`, single-label names, `.local`, `.internal`, `.localhost`, `getclearnews.com`, `www.getclearnews.com` and the Worker's `workers.dev` name;
   - names whose A or AAAA answers (DNS over HTTPS, `https://cloudflare-dns.com/dns-query`, JSON, 3 s timeout, only type 1 and 28 answers) include an address in: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`, `::/128`, `::1/128`, `fc00::/7`, `fe80::/10`, `ff00::/8`, and IPv6 forms that embed IPv4 (`::ffff:0:0/96`, `64:ff9b::/96`, `64:ff9b:1::/48`, `2002::/16`, `2001::/32`), whose embedded address is checked against the IPv4 list;
   - names that do not resolve, as today.
   The edge resolves the name again when it connects, so this check is best effort; the per-hop checks, the rate limit, the byte cap and the timeout carry the rest (research 4).
3. Fetch with `redirect: 'manual'`, at most 5 hops; 15 s total for the whole call; `text/html` or `application/xhtml+xml` only; stop reading at 3 MB; decode as for feeds.
4. A URL whose path has `/video/` or `/videos/` answers `failed` with reason `video` without fetching (#423). Otherwise extract twice on linkedom after inserting `<base href="<final URL>">` and giving lazy-loaded photos their address (`data-src`, `data-url` as DW's, or the widest `srcset` candidate as The Conversation's; #453): Defuddle and Readability. Each result is sanitized (step 5) and cleaned: whole-line page furniture ("Skip to content", sign-up and app lines, "N Comments", "Follow topics…"), support pitches (checked twice, since removing a pitch can leave the rest of its box), blocks repeated word for word or with only a trailing photo credit added (a subtitle that repeats a paragraph goes, the paragraph stays; #453), tracking pixels, the first address of a comma-joined `srcset`, the photo that repeats `image_url` with its caption (matched by file name, or by the original photo an image service names in a `url=` parameter, as NPR's do, or by DW's numeric photo id; further copies too while at most 60 words come before them; #453), the byline and the bio line after it, photo credits whose photo is gone, figures left with only a caption (their video or embed was removed; #453), and empty wrappers. Defuddle's result is used unless Readability's has 25% more words in paragraphs of 12+ words, or Defuddle's has under 50 words. Success needs 50 words, as today. Author from the same two meta tags, else Defuddle's, with entities decoded and URLs or "Sponsored" dropped. Measured on 250 articles from all 53 sources (Nov 1, 2026): articles missing 30% or more of their text went from 24 of 220 to about 12 by the yardstick (most of those are the yardstick counting subtitles and pitches; real misses are a lead paragraph on a few Atlas Obscura, Latent Space and Scientific American pages), junk lines 46 to 8, the repeated photo 40 to 2. Findings: `docs/reviews/2026-11-01-reader-investigation.md`.
5. Sanitize (before the cleanup in step 4) with sanitize-html configured as the nh3 allowlist (inventory 4.4): the same tags, attributes and URL schemes; every link gets `rel="noopener noreferrer"`; `script`, `style`, `iframe`, `video` and `audio` dropped with their content (a video's "Your browser does not support the video tag" fallback, #453).
6. Response fields and reasons exactly as inventory 4.5. Metadata (`image_url`, `source_name`, `published_at`) comes from the stored feed when the URL is in it.
7. Photos (in the text and `image_url`) are rewritten to `https://getclearnews.com/img?w=1200&u=<original>&s=<signature>`; the signature is an HMAC of the width and URL with the Worker secret `PHOTO_KEY`. `/img` checks it (404 otherwise), fetches the original with `cf.image` (width 1200, `scale-down`, AVIF or WebP by the `Accept` header), caches a week, and redirects to the original if resizing fails (#423, 3.5.1).
8. Results are kept in KV under `reader:v5:<sha256 of the URL>`: 6 hours, or 30 minutes for a block, timeout or error (#423; the version changes when extraction or photo addresses do). After each new Today brief, the cron reads its stories ahead into the same keys, five at a time, inside the run's time budget. `global_fetch_strictly_public` is on, and the reader has its own rate limit (section 3).

The trafilatura fallback is not ported. Locally the JS extractor got more text than the Python reader on the Verge and BBC pages and about the same on the Guardian and The Hindu (research 1.2). The gate in section 9 runs the reader on articles from every source and compares success with the droplet.

## 7. The site

- **Next.js 16.4.3** (the fix floor for the Oct 14, 2026 advisories is 16.4.1; research 6), `output: 'export'`, `images.unoptimized` as today, `export const dynamic = 'force-static'` in `robots.ts` and `sitemap.ts`, `NEXT_PUBLIC_API_URL=/api/v1` at build so `workers.dev` calls its own API. The fallback in `web/src/lib/api.ts` changes from `http://localhost:8000/api/v1` to `/api/v1` (R16).
- **Google Analytics removed** (decision 1): the gtag block leaves `layout.tsx`. The privacy page keeps "We do not use analytics".
- **`/privacy` and `/support`:** `deployment/static/privacy.html` and `support.html` move to `web/public/`. The one line on each page that says the app uses financial news APIs is corrected to RSS feeds, and the privacy page's "Last updated" date changes with it (R16). Served at the extensionless paths by `html_handling`.
- **Copy:** "41 sources across 13 categories" in `layout.tsx`, `about/page.tsx` and `public/social-card.html` updated to the final count once the finance list is approved. The shipped iOS and Android About screens still say "financial news APIs" until their next release; that text is out of scope here (no app release, per the approval line).
- **Not served:** `public/social-card.html` and `public/.gitkeep`, through `.assetsignore` (research 5).
- **Security headers, set by the Worker on every response** (pages, assets, API, errors, redirects), the repo's v2.0.0 intent (inventory 8.1, O30):
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'` (no `'unsafe-eval'`; the static export does not need it, research 5)
  - `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- **Caching:** `/_next/static/*` gets `public, max-age=31536000, immutable`; HTML gets `public, max-age=0, must-revalidate`.
- **Zone settings** (getclearnews.com), set **before** the attach (they do nothing to DNS-only names, so there is no window; R1). Read on Nov 1, 2026 and the target:

| Setting | Nov 1 | Target | Why |
|-|-|-|-|
| Bot Fight Mode | off | off | cannot be skipped by rules and "may challenge API or mobile app traffic" (R1). Read through the Cloudflare connector; the ClearNews token cannot read or write it |
| Security Level | medium | essentially off | challenges carrier and CGNAT addresses the apps use; a read-only API with a rate limit has nothing for it to protect |
| Browser Integrity Check | on | off | acts on non-browser clients such as the apps' URLSession and OkHttp |
| Always Use HTTPS | off | on | http to https, as TourGraph |
| Email Obfuscation | on | off | it injects a script into pages |
| Rocket Loader | off | off | |
| Minimum TLS | 1.0 | 1.2 | as nginx |
| SSL mode | full | full | |

## 8. Security

- No secrets in the Worker. The deploy token lives in `~/.secrets/cloudflare/clearnews.env` (chmod 600), scoped to the OmSpark account and the `getclearnews.com` zone. The Mac's default wrangler login (ParkPro) is never used.
- The deploy script builds from files git tracks, then scans the upload for `.env` files and key-like strings, and refuses a bundle that contains `localhost:8000` (TourGraph's and Recurate's pattern; R16).
- The zone carries Microsoft 365 mail (MX, SPF, autodiscover, two enrollment CNAMEs, a Google site verification TXT). The switchover touches only the apex and `www` records. DKIM and DMARC come after, as their own step (decision 4).
- `docs/reviews/` is committed after the droplet is gone (R15).

## 9. Testing and the gate before switchover

All tests run with `TZ=UTC` (R10).

- **Unit tests** (`worker/test/`, Vitest in the Workers runtime): normalization, the output gate with R2's vectors (an emoji at the cut, `IST`, `CEST`, `2026-13-45`, `25:61`, year 10000, `undefined` fields), `strip_html`, filters, dedup, sort, pagination, validation bodies, prototype-key categories, the rate limit path, redirects, headers, the page fallback when header code throws, SSRF cases (one per rule in section 6), the sanitizer allowlist, the 5 MB cap, a missing or old-version `state`.
- **Parity with Python on recorded feeds:** record every enabled feed once (with headers) and the og:image page heads into fixtures. Run the Python pipeline with fetching mocked, warming its cache with `warmup_cache()` so results pair with sources in `sources.yaml` order (avoids O14's completion order), then call `get_articles` per category. Run the TypeScript pipeline on the same fixtures. Compare every field of every article in `all` and each category. Allowed differences: only the rows of section 3 (dates, charset).
- **Swift decoder sweep** (R10): a small command line tool built from the app's own `Article.swift`, `Category.swift`, `ReaderContent.swift` and the decoder setup in `APIClient.swift`. It decodes every page of every category on `workers.dev` (`per_page=50`) and the reader sample, several times during the gate day, and checks every `published_at` against the regex in section 3.
- **Contract diff** (`worker/scripts/contract-diff.mjs`, read-only, from TourGraph's): every call the apps and site make, against the droplet and `workers.dev`, compared on shape, types, status codes and headers. Lists are compared on shape and per-source counts, since two live systems never hold the same items.
- **A day on `workers.dev`** with the cron on: per-source article counts compared with the droplet (`?source=<id>` totals on both) and per-source status from `/api/v1/status`. Publishers may block Cloudflare egress (research 2); any source that works on the droplet and fails on Cloudflare goes to Nikhil before switchover.
- **Finance feeds** approved by Nikhil and running on `workers.dev` for the gate day (R9). No switchover without them, or the Finance tab disappears from the App Store app.
- **Reader sample:** one article URL per source through both readers; success rate and word counts compared.
- **iOS app in the Xcode simulator** pointed at `workers.dev` (a local build with the base URL changed, not committed, no App Store involvement): feed, categories, search, pull to refresh, reader, privacy and support links.
- **Live checks** (`verify.mjs`): headers, redirects, the three app paths called with the iOS (CFNetwork) and Android (`okhttp/4.12.0`) user agents and no browser headers, expecting JSON (R1); fails when `feed.built_at` is over 30 minutes old or an enabled source has had no success for 24 hours (R3). Plus a **browser walk** (headless Chrome, desktop and phone), from TourGraph's scripts.
- **Switchover rehearsal** (R8): run the switchover and rollback scripts end to end on a test name (`cutover-test.getclearnews.com`), then delete it. Needs Nikhil's OK: it is a DNS record beyond the apex and `www`.
- **Independent review** of the code before switchover, answered in writing in `docs/reviews/`, as this spec's was.

## 10. Switchover and rollback

Switchover (inside Nikhil's approval line; Claude names the time in chat before starting):

1. Gate in section 9 passed.
2. Zone settings from section 7 set and read back.
3. Save the zone: JSON of every record and a BIND export.
4. Per hostname, by script: delete the A record, attach the Worker custom domain through the API immediately, recreate the A record if the attach fails (TourGraph: under half a second per host; code 100117 refuses a direct attach).
5. Check: Cloudflare addresses answer for both names on both Cloudflare nameservers; the mail records are byte-identical to the export; `verify.mjs` and the walk pass on getclearnews.com; one iOS simulator run against production. Then Nikhil tests the App Store build on his iPhone against production and reports anything off.
6. Turn off `workers_dev`.
7. After 24 hours: Security Events checked for any action on `/api/*` (R1).

Rollback, by script (rehearsed in section 9; R8): detach the Worker custom domain for `www` and the apex (this removes the records Cloudflare created for them, including the proxied `AAAA 100::`), create the two A records to 64.227.96.170, DNS only, TTL 300, then check both nameservers. The droplet keeps running untouched; its certificate is valid to Jan 7, 2027. Rollback to the droplet ends when Nikhil deletes it. After that: `wrangler rollback` for code; a rollback to code with an older `state` version triggers a full run (section 4), and KV refills from the feeds within a minute.

After the switchover: DKIM and DMARC (decision 4), docs, then removal of `backend/` and `deployment/` once Nikhil has deleted the droplet and the DigitalOcean project. `CLAUDE.md` (rule 8 and the architecture summary) changes in the same commit that adds the Cron Trigger, not later (R16).

## 11. Decisions

| # | Decision | Ruling |
|-|-|-|
| 1 | Google Analytics | Removed; privacy page unchanged on analytics (Nikhil). |
| 2 | Scheduled refresh | Cron Trigger every minute; repo rule 8 dropped (Nikhil). |
| 3 | FMP | Dropped; Finance refilled with free RSS feeds, list approved by Nikhil and running before switchover (Nikhil). |
| 4 | Mail | DKIM and DMARC p=quarantine after the switchover (Nikhil). |
| 5 | Runtime | TypeScript rewrite in one Worker; not Containers, not Python Workers (Nikhil). |
| 6 | Store | KV: `state` and `feed`, written only by the cron (Claude, agreed by Nikhil; research 3). D1 for `state` if the logged `state` age shows stale reads often. |
| 7 | Site | Static export, not OpenNext: no page needs a server, and it avoids OpenNext issue #1381 (Claude, agreed). |
| 8 | Routing | `run_worker_first: true`; headers and the www redirect in Worker code, with a plain asset fallback (Claude, agreed). |
| 9 | Router | Hono, as in Recurate (Claude). |
| 10 | Reader extractor | Readability only; trafilatura fallback not ported; checked by the reader sample (Claude, agreed). |
| 11 | Fixes on the way | O1, O2 (with a 24 hour limit), O3, O5, O6, O8, O19, O20, O29, O30, and the feed charset, per section 3. O17 deferred to #413 (Claude, agreed; adjusted by the review). |
| 12 | Independent review | 16 findings; responses in `docs/reviews/2026-11-01-spec-review.md`. |

## 12. Open items

- **Finance feeds:** CNBC Top News, BBC Business and The Guardian Business, approved by Nikhil and on since Nov 1, 2026.
- **Good News Network:** 403 on every droplet fetch. Retested from Cloudflare during the day on `workers.dev`; keep, replace or disable goes to Nikhil then.
- **Stale feed alert (R3):** `/api/v1/status` and `verify.mjs` show a stale feed only when someone looks. How it reaches Nikhil is his call (for example a scheduled check that opens a Command Center task).
- **Local:** MyNorthwest answers 403 to Cloudflare and is off (Nikhil: drop it). KING 5 Local replaces it; its first fetches from Cloudflare did not parse (under investigation; Local has three working sources meanwhile).
- **India tab noise** (#413): old and off-topic items, roundups, per-source volume, and the O17 spacing fix. First change after the move, so the move's parity check stays exact (Nikhil, Nov 1).
- **AI step** (#414): group repeated stories by meaning and filter fluff in the cron, the same for every reader, no tracking. Design doc with costs after the move. The cron and KV layout here does not block it: grouping adds fields to articles, which every client ignores.
