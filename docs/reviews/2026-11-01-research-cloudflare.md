# Cloudflare research for the ClearNews move

**Checked on 2026-11-01.** Every fact below was checked that day against the source named next to it.

**How it was checked.** Cloudflare docs (developers.cloudflare.com, read as `index.md` and through the Cloudflare docs search tool), Cloudflare changelog posts, GitHub issues and security advisories (`gh`), `npm view`, PyPI JSON, the Pyodide package list, and published package code. Local tests ran on this Mac in scratch folders under `/private/tmp/claude-501/research-cf-clearnews/`: a benchmark Worker in `wrangler dev` (wrangler 4.156.0, workerd 1.20261023.1), a cron-shaped Worker that fetched the 39 live feeds, a static export of a copy of `web/` taken from `git archive HEAD`, and that export served as Worker static assets. The live site was read with plain GETs (`/api/v1/sources`, `/api/v1/articles`, `/api/v1/articles/reader`, response headers, DNS). No Cloudflare account, token or wrangler login was used. No repo file other than this one was changed.

**Labels.** Each answer carries one or more:
- **[Docs]** official Cloudflare, OpenNext or Next.js documentation, including the changelog.
- **[Source]** read in this repo or in published package code.
- **[Issue]** a GitHub issue, pull request, release note or security advisory.
- **[Tested]** reproduced on Nov 1 (Node 26.12.1, npm 11.20.0, macOS, Apple M5 Pro), or read from the live site.
- **[Inference]** my reasoning; not stated anywhere.

**Notation.** To keep this file free of double hyphens, command line flags are written without their leading dashes, in code style: "flag `dry-run`" means the double-dash dry-run flag.

**Timing caveat.** CPU numbers marked [Tested] come from `performance.now()` around synchronous code in local `wrangler dev`. Local workerd clocks advance during CPU work (checked: a 50 million step loop read 23 to 24 ms); production clocks do not, and production CPUs may be slower than this Mac. Treat them as order of magnitude.

## 0. Findings that shape the design

1. **A TypeScript Worker is the fit, and every Python library has a working replacement in workerd.** feedsmith parsed every feed that returned XML, Mozilla Readability on linkedom extracted 5 live article pages in 5 to 12 ms median (25 ms worst first run), sanitize-html reproduces the nh3 allowlist, and HTMLRewriter finds `og:image`. All candidates together bundle to 1,562 KiB (348 KiB gzip) against a 64 MiB limit. [Tested, Docs]
2. **Do not sanitize with DOMPurify on linkedom.** In workerd it returned the input unchanged, `<script>` and `onerror` included, with no error and `isSupported` undefined. Use sanitize-html (or `xss`). The browser's own DOMPurify call in `web/` is fine and can stay as a second layer. [Tested, Source]
3. **Readability needs a `<base href>` to make links absolute.** linkedom documents have no URL (`baseURI` is null), so relative links stay relative: 3 on the Verge page, 1 on the BBC page. Inserting `<base href="<final URL>">` before parsing fixed it in a test. readability-lxml got this from its `url` argument. [Tested, Source]
4. **Containers save money only if 256 MiB is enough.** There is no 512 MB type and custom types start at 1 vCPU and 3 GiB. Always on, `lite` (1/16 vCPU, 256 MiB) costs about $2.30 to $3.90 a month; `basic` (1/4 vCPU, 1 GiB) about $7.60 to $9.20, more than the $6 droplet. An idle running instance is billed, and a cron every minute would keep it running. [Docs, Inference]
5. **Python Workers are GA (Sep 21, 2026) but need the same change of runtime model as a rewrite.** Threads do not work, so the six `asyncio.to_thread` calls must go; there are no background loops, and the cache must move to storage anyway. lxml, nh3, httpx and PyYAML are in Pyodide; rapidfuzz has no Wasm build (and is unused); trafilatura's dependency tree and Python CPU cost in Wasm are untested. [Docs, Issue, Source]
6. **One cron run can refresh every feed.** Locally, one Worker invocation fetched all 39 feeds in 1.3 s wall with 60 ms of parse CPU, then 170 article pages for `og:image` in 2.9 s. On Workers, fetches beyond 6 waiting for headers are queued, not failed. Cron limits on Paid: 30 s CPU for schedules under 1 hour, 15 min wall, 10,000 subrequests. [Tested, Docs]
7. **Conditional GETs work, but 10 of 39 feeds never send a validator.** On a second pass 23 feeds answered 304. Bodies arrive decompressed. Use `cache: 'no-store'` on feed fetches so Cloudflare's cache does not sit between the Worker and the publisher. [Tested, Docs]
8. **Publisher blocking cannot be predicted from here.** The droplet already gets 0 articles from Frommers, Good News Network, AP (feedx) and Seattle Eater, and 403 from NDTV and Ars Technica article pages. 13 of 39 feeds are served through Cloudflare, where publishers see every Worker subrequest tagged with `CF-Worker: getclearnews.com` and can block on `cf.worker.upstream_zone`. Log per-source status on `workers.dev` for a day before switchover. [Tested, Docs, Inference]
9. **KV fits the cache, with the merged list precomputed by the cron.** The live merged set is 1,084 articles, 707 KB of JSON (208 KB gzip); KV allows 25 MiB per value and 1 write per second per key. Eventual consistency (up to 60 s) is harmless for a feed refreshed every 15 min. Per request the Worker then parses about 0.7 MB (1 ms) and filters and pages (about 1 ms); the 11 to 15 ms dedup runs in the cron. [Tested, Docs]
10. **Next.js static export works with one change.** `output: 'export'` fails on `robots.ts` until it exports `dynamic = 'force-static'` (the test added the same line to `sitemap.ts`; a build without it there was not tried). After that all six routes are static, `/article?url=` builds through its existing Suspense boundary, and metadata and JSON-LD are in the HTML. As Worker static assets, page loads never invoke the Worker and are free. [Tested, Docs]
11. **Next.js 16.1.6 is in range of several critical and high advisories; bump to 16.4.3.** The fix floor is 16.4.1 (Oct 14, 2026). Today's server is less exposed than the list suggests (live `/_next/image` returns 404; no server actions, middleware or `use cache`), and after a static export no Next server runs at all. 16.4.3 exported the same six static routes. [Issue, Tested, Source]
12. **www must be redirected at the zone, not in the Worker.** Static assets are served before the Worker runs, so a `www` custom domain would serve the whole site on `www`. Use a Single Redirect rule (Free zone plan: 10 rules) and Always Use HTTPS. `_redirects` cannot redirect by host. [Docs, Tested]
13. **Reader SSRF: Cloudflare does not document blocking private addresses, and the resolved IP cannot be pinned.** Documented: no fetch to IP literals, no fetch to Cloudflare-owned IPs (error 1024). Keep a TypeScript version of today's check: DNS over HTTPS for A and AAAA (not `node:dns` `lookup`, which returned a CNAME name as the "address"), `redirect: 'manual'` with a check per hop, a timeout and a byte cap. The risk is lower than on the droplet because nothing private sits behind the Worker. [Docs, Tested, Issue, Inference]
14. **Incremental cost is about $0 a month.** 43,200 cron runs, modest API traffic and about 86,000 KV writes a month fit inside the Workers Paid included amounts; if other apps on the account used them up, the overage for ClearNews would be under $1. The $6 droplet goes away. [Docs, Inference]
15. **Pre-existing, not caused by the move:** the live nginx headers differ from the repo's `deployment/nginx/clearnews.conf` (live sends `X-XSS-Protection: 1; mode=block` and `'unsafe-eval'` in the CSP, and no `Referrer-Policy` or `Permissions-Policy`); the live CSP blocks the GA4 script (moot, GA is being removed); `rapidfuzz` is in `requirements.txt` but imported nowhere. [Tested, Source]

## 1. Where the backend runs (question A)

### 1.1 Option (a): TypeScript in one Worker. Library by library

| Python today | Use | TypeScript replacement | Runs in workerd? | Bundle (alone) | Label |
|-|-|-|-|-|-|
| `feedparser` | RSS, Atom parsing | **feedsmith 3.0.1** (deps: fast-xml-parser 5.11, entities 7). Parses RSS 0.9x/2.0, Atom, RDF, JSON Feed; Media RSS, Dublin Core and content namespaces. | Yes, no Node APIs. Parsed all 36 feeds that returned XML to curl (RSS and Atom) in 0 to 2 ms each; all 39 in the cron test. | 372 KiB / 88 KiB gzip | Tested, Source |
| | | rss-parser 3.13.0 (last published Apr 2023) | Only with `nodejs_compat`: imports `http`, `https`, `url`, `events`; without the flag the build fails. Parsed a sample with the flag. | 301 KiB / 52 KiB gzip | Tested |
| | | fast-xml-parser alone | Yes, but RSS and Atom mapping would be hand-written. | 144 KiB / 36 KiB gzip | Tested |
| `readability-lxml` | Reader extraction | **@mozilla/readability 0.6.0 + linkedom 0.18.15** | Yes. 5 live pages, see 1.2. Needs `<base href>` injected for absolute links (finding 3). Readability's README uses jsdom in its Node example; jsdom was not tried here. | 860 KiB / 201 KiB gzip (both) | Tested, Source |
| | | happy-dom 21.0.4 | Installed, not run. | | Source (npm view) |
| | Lineage | readability-lxml is "a Python port of a Ruby port of arc90's Readability project"; Mozilla's `Readability.js` says it is "heavily based on Arc90's readability.js (1.7.1)". Same origin, separate code, so output differs (table in 1.2). | | | Source |
| `trafilatura` | Fallback when Readability gets under 50 words | No JS port. Options: drop it, retry Readability with a lower `charThreshold`, or a small `<article>`/`<p>` text pass. How often the fallback fires today is not logged anywhere I could read. | | | Inference |
| `nh3` | HTML allowlist sanitizer | **sanitize-html 2.18.1**: `allowedTags`, per-tag `allowedAttributes`, `allowedSchemes`, `transformTags` for `rel` map one to one onto the nh3 config. | Yes. Stripped `<script>` and `onclick` in tests. | 356 KiB / 81 KiB gzip | Tested |
| | | `xss` 1.0.17 (js-xss) with a whitelist and `stripIgnoreTag` | Yes, no scripts left on 5 pages. | 49 KiB / 9 KiB gzip | Tested |
| | | DOMPurify 3.4.17 on a linkedom window | **Unsafe**: output equals input. | 851 KiB | Tested |
| | | HTMLRewriter allowlist (hand-written) | Yes, native, zero bundle. A prototype matched the others' output size. Hand-written security code, so not my first pick. | 0 | Tested, Inference |
| regex for `og:image` | Image backfill | HTMLRewriter `meta[property="og:image"]` | Yes, on 5 pages and 167 of 170 in the cron test. `getAttribute` returns the raw text: the Verge value keeps `&amp;`. Today's regex does the same, and live Verge image URLs already carry `&#038;`. | 0 | Tested |
| `email.utils`, feedparser dates | Date parsing | `new Date(str)` | All 1,187 item dates from 36 feeds parsed: RFC 822 with numeric offsets, `GMT`, `EST`, and ISO 8601 (Verge, Eater). | 0 | Tested |
| `httpx` | HTTP client | global `fetch` | Yes. | 0 | Docs |
| `html.parser` | `strip_html` for titles and summaries | regex plus `entities` decode (already a feedsmith dependency) | Not separately tested. | small | Inference |
| `unicodedata` | Non-Latin filter | `/\p{L}/u` and `codePointAt` | Yes. | 0 | Tested |
| `rapidfuzz` | none | none: not imported anywhere under `backend/app/` | | | Source |
| `pyyaml` | `sources.yaml` | Convert to JSON or TS at build time; no runtime parser needed. | | | Inference |
| FastAPI, pydantic | Routing, JSON shapes | Hono 4.13.16 (Recurate's choice) or a plain `fetch` handler. | Not run here. | | Source (npm view) |

### 1.2 Measured in local workerd

Five live article pages fetched once to disk. Median of 7 runs, then first run. NDTV was replaced because both this Mac and the droplet get `403 Access Denied` from NDTV article pages (the live reader returns `"reason":"forbidden"` for one). [Tested]

| Page | HTML size | linkedom parse | Readability | Total median (first run) | sanitize-html / xss / HTMLRewriter | Words: JS vs live Python reader |
|-|-|-|-|-|-|-|
| The Verge | 395 KB | 5 ms | 6 ms | 12 ms (25 ms) | 0 to 1 ms each | 230 vs 111 (Python kept only a quoted block) |
| Ars Technica | 153 KB | 2 ms | 3 ms | 5 ms (8 ms) | 0 to 1 ms | 284 vs none (live reader returned `forbidden`) |
| BBC | 388 KB | 3 ms | 9 ms | 12 ms (19 ms) | 0 to 1 ms | 496 vs 313 |
| Guardian | 369 KB | 2 ms | 7 ms | 10 ms (16 ms) | 0 to 1 ms | 2,486 vs 2,610 |
| The Hindu | 221 KB | 2 ms | 3 ms | 5 ms (8 ms) | 0 to 1 ms | 858 vs 878 |

- Merge path on the live 1,084-article list (posted to a Worker): `JSON.parse` of 707 KB 1 ms, non-Latin filter 0 to 3 ms, dedup (straight port of `_deduplicate`) 11 to 15 ms, two-tier sort up to 5 ms, search and one page 0 to 1 ms. [Tested]
- Feed parsing: 60 ms total for all 39 feeds (4.07 MB of XML, 1,517 items). [Tested]
- Bundle with every candidate at once (feedsmith, Readability, linkedom, sanitize-html, xss, DOMPurify): `wrangler deploy` flags `dry-run` and `outdir`: Total Upload 1,562.49 KiB / gzip 348.47 KiB. Limits: 64 MiB uncompressed, no compressed limit, 1 s startup, 128 MB memory per isolate, 30 s CPU per request by default (configurable to 5 min). [Tested, Docs] https://developers.cloudflare.com/workers/platform/limits/ (updated Oct 29, 2026)

### 1.3 Option (b): the Python Docker image on Containers

| Question | Answer | Label |
|-|-|-|
| Status | GA since Apr 13, 2026 ("Containers and Sandboxes are now generally available"). | Docs |
| Instance types | `lite` 1/16 vCPU, 256 MiB, 2 GB disk; `basic` 1/4 vCPU, 1 GiB, 4 GB; `standard-1` 1/2 vCPU, 4 GiB; up to `standard-4`. Custom types: minimum 1 vCPU and 3 GiB per vCPU, so nothing between 256 MiB and 1 GiB. Today's backend container is capped at 512M and 0.75 CPU in `docker-compose.prod.yml`; its actual memory use is not recorded in the repo. | Docs, Source |
| Pricing (Workers Paid) | Memory $0.0000025 per GiB-second after 25 GiB-hours; CPU $0.000020 per vCPU-second of **active** use after 375 vCPU-minutes; disk $0.00000007 per GB-second after 200 GB-hours. Billed per 10 ms while running. Memory and disk are billed on provisioned size; "An idle instance is still billed". The container's Durable Object and the front Worker are billed on top. | Docs |
| Sleep | `Container` class `sleepAfter` defaults to 10 min; the newer Durable Object Container API uses `setInactivityTimeout()`, at most 6 hours. Disk is fresh after sleep. | Docs |
| Cold start | "often in the 1-3 second range", depending on image and entrypoint. Then this app's own warmup: about 10 s to fetch 41 sources (`service.py` comment), with the 3 s partial-response deadline. | Docs, Source |
| Always on | Possible in practice: a cron every minute (already decided) sends a request, which keeps the instance active. Not guaranteed: "Cloudflare does not guarantee that any container instance will run for a set period"; host restarts and rollouts stop it, and the in-memory cache is lost each time. | Docs, Inference |
| Monthly cost always on (730 h) | `lite`: memory $1.42 + disk $0.32 + CPU $0.60 to $2.18 (2 to 5 percent of one vCPU average, a guess) = **$2.34 to $3.92**. `basic`: memory $6.35 + disk $0.69 + CPU $0.60 to $2.18 = **$7.63 to $9.21**. | Inference from Docs prices |
| Cheaper than the $6 droplet? | Only on `lite`, and only if Python, lxml, trafilatura and the in-memory cache stay under 256 MiB and 1/16 vCPU is enough for readability-lxml on 400 KB pages. Neither is measured. On `basic` it costs more than the droplet. It also keeps a Python server plus a Worker plus a Durable Object to run. | Inference |

Sources: https://developers.cloudflare.com/containers/pricing/ (updated Oct 5, 2026), https://developers.cloudflare.com/containers/platform-details/limits/ (updated Oct 29, 2026), https://developers.cloudflare.com/containers/faq/ , https://developers.cloudflare.com/sandbox/concepts/lifetime/ , https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/

### 1.4 Option (c): Python Workers (Pyodide)

| Question | Answer | Label |
|-|-|-|
| Status | GA on Sep 21, 2026, after a two-year preview (blog `python-workers-ga`; Simon Willison's post the same day). The Python Workers docs page does not use the word "beta". Needs the `python_workers` compatibility flag. Python 3.14 (Pyodide 314.0.6) for compatibility dates from 2026-09-08. | Docs, Issue |
| Packages | In Pyodide 314.0.7: **lxml 6.1.3, nh3 0.3.4, httpx 0.28.1, PyYAML 6.0.3**, regex, charset-normalizer. Not in Pyodide: feedparser, readability-lxml, trafilatura, rapidfuzz. Pure Python packages from PyPI can be vendored by Pywrangler. feedparser 6.0.14 (dep feedparser-sgmllib) and readability-lxml 0.9 (deps lxml with html-clean, cssselect, chardet) look pure Python. trafilatura 2.3.1 pulls courlan, htmldate, justext, urllib3, certifi, and through htmldate dateparser, python-dateutil, pytz, tzlocal. **rapidfuzz 3.14.6 has no PyEmscripten wheel** on PyPI (unused anyway). None of this was installed or run here. | Docs, Source, Inference |
| Threads and loops | "multiprocessing and threading are non-functional" in the Wasm VM (GA coverage). Today's code calls `asyncio.to_thread` six times and starts two `asyncio.create_task` background loops at startup; neither model survives. Cron triggers are supported (`scheduled` on `WorkerEntrypoint`, since Apr 2025). | Issue, Source, Docs |
| Cold start | Cloudflare's benchmark (httpx, FastAPI, pydantic) is 1,027 ms mean with deploy-time memory snapshots, about 10 s without. lxml and trafilatura would add to it; not measured. | Docs |
| Limits | Same Worker limits (64 MiB, 128 MB memory, 30 s CPU). Python CPU time in Wasm for feedparser and readability-lxml is not measured anywhere I found. | Docs, Inference |

Sources: https://developers.cloudflare.com/workers/languages/python/ (updated Sep 17, 2026), https://developers.cloudflare.com/workers/languages/python/packages/ , https://developers.cloudflare.com/changelog/post/2026-09-08-python-workers-314/ , https://developers.cloudflare.com/changelog/post/2025-12-08-python-cold-start-improvements/ , https://blog.cloudflare.com/python-workers-ga/ , https://pyodide.org/en/stable/usage/packages-in-pyodide.html

### 1.5 Lean for A

**(a), TypeScript in one Worker** that serves the API, runs the cron and carries the static site. [Inference]
- Every library is replaced and tested in workerd; CPU per request is milliseconds; the bundle is small.
- (c) keeps Python syntax but not the design: threads, background loops and the in-memory cache all go, and the heaviest dependency (trafilatura) is unproven in Pyodide.
- (b) keeps the code as is but only beats the droplet on a 256 MiB instance nobody has sized, and adds a container, a Durable Object and a Worker to operate.
- Recurate already took path (a), so tooling (Hono, `@cloudflare/vitest-plugin` 1.4.11) is shared.

## 2. Cron Trigger design (question B)

| Question | Answer | Label |
|-|-|-|
| Limits on Paid | CPU 30 s per run for schedules under 1 hour (15 min for 1 hour or more); wall time 15 min; subrequests 10,000 per invocation (configurable up to 10 million with `limits.subrequests`); 250 Cron Triggers per account; schedule changes take up to 15 min to propagate; runs in UTC "on underutilized machines". | Docs |
| 6 connections | "up to six connections simultaneously waiting for response headers"; "If a seventh connection is attempted ... it is queued until one of the existing connections receives its response headers." Since Apr 9, 2026 a connection stops counting once headers arrive (changelog "Relaxed connection limiting"). KV and Cache API calls count too; service bindings do not. | Docs |
| How many feeds per run | All of them fit. Local test, one invocation, `Promise.all` over 39 feeds: 1,299 ms wall, 4.07 MB of XML, 1,517 items, 60 ms parse CPU, no failures. Then 170 article pages for `og:image` in 2,916 ms (167 found). Total about 210 subrequests. Local workerd does not reproduce the edge's 6-connection queue, so expect a few waves of about 0.1 to 0.3 s each in production. | Tested, Inference |
| Schedule shape | Every minute (decided). Each run refreshes sources older than 15 min, about 3 per run with 43 sources, like today's loop (stalest source every 25 s). A failed source is retried the next minute. A run can also refresh everything if the stored state is empty (first deploy). | Inference |
| Conditional headers | Set `If-None-Match` and `If-Modified-Since` yourself; a 304 comes back to the code. Local second pass: 23 of 39 feeds 304, 16 full 200s. 29 of 39 feeds send `ETag` or `Last-Modified`; the 10 that send neither: sunny-skyz, bbc-health, bbc-uplifting, bbc-india, dailygood, polygon, india-today, wired, npr-health, conde-nast-traveler. | Tested |
| gzip and brotli | "brotli or gzip compression is automatically requested when fetching from an origin"; brotli from the origin needs the `brotli_content_encoding` flag. Bodies are decompressed transparently; locally `Content-Encoding` was null after decompression. | Docs, Tested |
| Cloudflare's cache on feed fetches | Worker `fetch()` passes through Cloudflare's cache by default. `cache: 'no-store'` skips the lookup and does not store the response (default on since compatibility date 2024-11-11). Use it so validators go to the publisher. | Docs, Inference |
| Timeouts | "There is no set time limit on individual subrequests." `AbortSignal.timeout(ms)` works (tested: `TimeoutError` after 1 s). Keep today's 10 s for feeds and 5 s for `og:image`. | Docs, Tested |
| Cron state | Module-level variables do not persist between runs (today's `_http_validators` dict and `_cache`). Validators, `fetched_at` and per-source articles must be stored (section 3). | Docs, Inference |
| Blocking by publishers | Every Worker subrequest carries `CF-Worker: <zone>`; zones on Cloudflare can match `cf.worker.upstream_zone` in WAF rules, and Cloudflare documents "Block Worker subrequests from other zones" as a use case. Cross-zone subrequests set `CF-Connecting-IP` to `2a06:98c0:3600::103`. 13 of the 39 feed hosts answered with `server: cloudflare` (AP via feedx, Atlas Obscura, AV Club, Frommers, GeekWire, Good News Network, Kotaku, Matador, MyNorthwest, Positive News, The Hindu, UPI, Wired). | Docs, Tested |
| What the droplet gets today | Live `/api/v1/articles?source=<id>`: 0 articles from frommers, good-news-network, ap-news, seattle-eater (and FMP). From this Mac, curl got 406 from New Scientist, 403 from MyNorthwest and a Cloudflare challenge from Frommers, yet workerd's `fetch` on the same Mac got 200 from all three. So blocking depends on IP and client fingerprint, and Cloudflare egress can only be judged after a deploy. Smithsonian (disabled) returned 403 to the droplet per the brief; not rechecked. | Tested |
| Recommendation | Deploy to `workers.dev` first with the cron on, log per-source status and item count for a day, and compare with the droplet's counts above. | Inference |

Sources: https://developers.cloudflare.com/workers/configuration/cron-triggers/ (updated Oct 17, 2026), https://developers.cloudflare.com/workers/platform/limits/ , https://developers.cloudflare.com/changelog/post/2026-04-09-relaxed-connection-limiting/ , https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/ , https://developers.cloudflare.com/workers/runtime-apis/fetch/ , https://developers.cloudflare.com/changelog/post/2024-11-11-cache-no-store/ , https://developers.cloudflare.com/fundamentals/reference/http-headers/ , https://developers.cloudflare.com/waf/custom-rules/use-cases/block-worker-subrequests/

## 3. Where cached articles live (question D)

**Shape, measured.** Live merged set: 1,084 articles from 35 sources with articles, 707,454 bytes of JSON (653 bytes per article), 208,295 bytes gzip; largest single source 64,955 bytes. Raw feed items before dedup: 1,517. All of "all" plus every category list as full objects: 1.4 MB. [Tested]

| Store | Limits that matter | Consistency and latency | Cost at this shape | Fit | Label |
|-|-|-|-|-|-|
| **KV** | Value 25 MiB; 1 write per second per key; 1,000 operations per invocation; `cacheTtl` minimum 30 s, default 60 s | "eventually-consistent"; changes "may take up to 60 seconds or more" to reach other locations; hot reads come from the local or regional cache, cold reads from central stores | Reads 10 M/month included then $0.50/M; writes 1 M included then $5/M; storage 1 GB included. Two keys written at most once a minute is at most 86,400 writes a month. | Good. Fast reads near users; size and write rate are far inside limits. | Docs |
| **D1** | 2 MB per row or string or BLOB; 100 KB SQL statement; 100 bound parameters | Strongly consistent; queries go to the single primary unless the Sessions API is used for replicas | Rows read 25 B/month and written 50 M/month included | Works (0.7 MB fits a row) but every request crosses to the primary's region. Whether a 1 MB bound string counts toward the 100 KB statement limit is not documented. | Docs, Inference |
| **Cache API** | `put`/`match`/`delete` count toward 1,000 calls per request | "do not replicate outside of the originating data center"; entries can be evicted; docs say custom domains get "functional cache operations" and do not say whether `workers.dev` does | Not mentioned on the page | Not a store: the cron runs in some other data center. Good for per-location caching of reader results (today 60 min) and of API responses. | Docs, Inference |
| **Durable Object (SQLite)** | 2 MB per row or value; one object is single threaded, soft limit 1,000 requests/s | Strongly consistent; one location; in-memory state survives between requests while active | Requests 1 M included then $0.15/M; duration 400,000 GB-s included (an object kept active all month is about 328,500 GB-s at 128 MB); SQLite rows billed like D1 | Closest to today's in-memory dict, but every API call goes to one location, and it is more code. | Docs, Inference |

**Lean for D: KV, written only by the cron, read by the API.** [Inference]
- Key `state`: per source the validators, `fetched_at`, error count and normalized articles (with `og:image` results carried over by URL so pages are not refetched every cycle, which today's code does). About 1 MB.
- Key `feed`: the deduped, time-sorted list per category plus "all" (non-Latin filter applied except for `india`), as one JSON value with per-category index arrays, under 1 MB. Write it only when its hash changes.
- API: `env.KV.get('feed', { type: 'json', cacheTtl: 300 })`, then filter by source or search, two-tier sort for the tab, paginate. Matches today's `Cache-Control: public, max-age=300`.
- Risk: a cron run may read a `state` up to about 60 s old if the previous run was in another location; the effect is a redundant fetch or one source showing older items for one cycle, and it heals on the next run. If logs show this happening, move `state` alone to D1 and keep `feed` in KV.
- Dedup semantics: today dedup runs on the requested subset, so a URL shared across categories is handled per request. Precomputing per category in the cron keeps that behavior.
- Reader results: Cache API keyed by article URL, 60 min, as today.

Sources: https://developers.cloudflare.com/kv/platform/limits/ (updated Oct 30, 2026), https://developers.cloudflare.com/kv/platform/pricing/ (updated Oct 30, 2026), https://developers.cloudflare.com/kv/concepts/how-kv-works/ , https://developers.cloudflare.com/kv/api/read-key-value-pairs/ , https://developers.cloudflare.com/d1/platform/limits/ , https://developers.cloudflare.com/workers/runtime-apis/cache/ (updated Oct 29, 2026), https://developers.cloudflare.com/durable-objects/platform/pricing/ (updated Oct 18, 2026), https://developers.cloudflare.com/durable-objects/platform/limits/

## 4. Reader SSRF on Workers (question E)

| Question | Answer | Label |
|-|-|-|
| IP literals | "For Workers subrequests, requests can only be made to URLs, not to IP addresses directly." (Known issues page.) Local `wrangler dev` did fetch `http://127.0.0.1`, so local behavior differs. | Docs, Tested |
| Cloudflare addresses | Error 1024: "Worker cannot make a subrequest to a Cloudflare-owned IP address." Error 1021: "Worker has requested a host it cannot access." | Docs |
| Hostnames that resolve to private IPs | **Not documented.** Error 1000 ("DNS points to prohibited IP") covers DNS records inside Cloudflare zones and does not mention Workers. I found no Cloudflare statement either way. | Docs |
| Own zone | Without `global_fetch_strictly_public`, a fetch to the Worker's own zone goes "to the zone's origin server, ignoring any Workers ... and also bypassing Cloudflare security settings". With the flag it goes through the front door like any client. Global fetch to another Worker on the same zone fails (error 1042). | Docs |
| DNS lookups | No `getaddrinfo`. `node:dns` resolves through DNS over HTTPS to 1.1.1.1; the Jan 2025 changelog says `lookup` throws "Not implemented". Locally today `resolve4('www.bbc.co.uk')` returned CNAME names mixed with IPs, and `lookup` returned the CNAME name as its "address". A JSON query to `https://cloudflare-dns.com/dns-query?name=localtest.me&type=A` with `accept: application/dns-json` returned `127.0.0.1`. | Docs, Tested |
| Rebinding | The edge resolves the name again at fetch time, so a check before the fetch cannot be pinned to the address actually used. A Braintrust proxy PR (#727, merged Jun 2, 2026) hit the same gap: "we can't really fix this. this requires other node modules that are not in cloudflare." | Issue |
| Redirects | Default `follow`. With `redirect: 'manual'` the 3xx and `Location` come back (tested: `https://bbc.co.uk/` gave 301 to `https://www.bbc.co.uk/`). Each hop counts as a subrequest. | Docs, Tested |
| Size and time | "Cloudflare does not enforce response body size limits"; memory is 128 MB per isolate; no per-subrequest time limit. Tested: reading the body stream and cancelling after 200 KB works; `AbortSignal.timeout` works. | Docs, Tested |
| Minimum safe check | 1. Scheme `http` or `https` only. 2. Reject IP-literal hosts, `localhost`, single-label names and `.local`, `.internal`, `.localhost`, and our own hostnames. 3. Resolve A and AAAA with DNS over HTTPS JSON, keep only type 1 and 28 answers, reject private, loopback, link-local, reserved, CGNAT and unique-local ranges (today's `ipaddress` checks), and reject on resolver failure, as today. 4. `redirect: 'manual'`, repeat 1 to 3 per hop, at most 5 hops. 5. `AbortSignal.timeout(15000)` as today. 6. Stop reading after a cap (for example 3 MB) and accept only `text/html`. 7. Enable `global_fetch_strictly_public`. 8. Rate-limit the reader route (section 5). | Inference |
| How much risk is left | Lower than on the droplet: a Worker has no localhost services, no cloud metadata endpoint and no private network of ours behind it. The remaining risks are abuse as an open fetcher (rate limit) and memory (byte cap). | Inference |

Sources: https://developers.cloudflare.com/workers/platform/known-issues/ , https://developers.cloudflare.com/workers/observability/errors/ (updated Oct 15, 2026), https://developers.cloudflare.com/workers/configuration/compatibility-flags/ , https://developers.cloudflare.com/changelog/post/2025-01-28-nodejs-compat-improvements/ , https://developers.cloudflare.com/workers/runtime-apis/request/ , https://github.com/braintrustdata/braintrust-proxy/pull/727

## 5. Edge features that replace nginx (question F)

| nginx today | Replacement | Label |
|-|-|-|
| `limit_req` 10 r/s per IP, burst 20, on `/api/` and `/health` | **Rate Limiting binding**: `ratelimits: [{ name, namespace_id, simple: { limit, period } }]`, `period` "Must be either 10 or 60", "approximate", "per Cloudflare location", counts "do not combine into one worldwide limit". Docs advise against IP keys, but an anonymous API has nothing else: key on `CF-Connecting-IP`. Roughly `limit: 100, period: 10` for `/api/*`, and a tighter one for `/api/v1/articles/reader` (each call fetches a page). Pricing: no statement on the page. Alternative: one WAF rate limiting rule on the Free zone plan (IP only, 10 s period, block), per the Recurate research. | Docs, Inference |
| Security headers on every response | Static pages and assets: a `public/_headers` file (100 rules, 2,000 chars per line). Tested: `/`, `/privacy`, the 404 page and `/_next/static/*` all carried the CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`; `/_next/static/*` got `public, max-age=31536000, immutable`. API responses: set in Worker code; `_headers` did not apply to them (tested). | Docs, Tested |
| CSP | After GA removal, `script-src 'self' 'unsafe-inline'` covers the inline theme script and JSON-LD; the export needs no `'unsafe-eval'` (the live header has it, the repo conf does not). `connect-src 'self'` works if `NEXT_PUBLIC_API_URL` is `/api/v1` or the same origin. | Source, Tested, Inference |
| HSTS | Live and repo: `max-age=31536000; includeSubDomains`. Keep it in `_headers` and in the Worker. | Tested |
| www to apex, 301 | **Single Redirect rule** (Free plan: 10 rules per zone) from `www.getclearnews.com/*` to `https://getclearnews.com/${1}`, keeping the query string, plus `www` as a proxied record (a second Custom Domain on the Worker, as TourGraph did, or a placeholder). The Worker cannot do it alone: static assets are served before the Worker, so `www` would serve the full site; `run_worker_first: true` would fix that but bills every page view as a Worker request. `_redirects` lists "Domain-level redirects" as not supported. | Docs, Tested, Inference |
| HTTP to HTTPS | Zone setting Always Use HTTPS (needs an SSL mode other than Off), as TourGraph did. | Docs |
| `/privacy`, `/support` static HTML | Copy `deployment/static/privacy.html` and `support.html` into `web/public/`. With the default `html_handling: "auto-trailing-slash"`, tested: `/privacy` and `/support` 200 `text/html`; `/about/` and `/about.html` 307 to `/about`. The iOS and Android apps link to `/privacy`, `/support` and `/article?url=`. | Docs, Tested, Source |
| 404 | `not_found_handling: "404-page"` serves the export's `404.html` with status 404 (tested). Unknown `/api/*` paths: return FastAPI's `{"detail":"Not Found"}` from the Worker. | Docs, Tested |
| Unwanted files | `public/.gitkeep` and `public/social-card.html` land in `out/`; an `.assetsignore` file kept them unserved (404) in the test. | Tested |
| `client_max_body_size 1m` | The API is GET only; the zone's request body limit (100 MB on Free) applies. Reject non-GET in the Worker. | Docs, Inference |

Sources: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (updated Oct 21, 2026), https://developers.cloudflare.com/workers/static-assets/headers/ , https://developers.cloudflare.com/workers/static-assets/redirects/ , https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/ , https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/ , https://developers.cloudflare.com/workers/static-assets/routing/worker-script/ , https://developers.cloudflare.com/rules/url-forwarding/ , `recurate-platform/docs/reviews/2026-10-31-research-cloudflare.md` section 5, `tourgraph/docs/reviews/2026-11-01-research-cloudflare.md` section 4

## 6. Web app: static export or OpenNext (question G)

| Question | Answer | Label |
|-|-|-|
| Does `output: 'export'` build? | Next 16.1.6, copy of committed `web/`: first build failed with `export const dynamic = "force-static"/export const revalidate not configured on route "/robots.txt" with "output: export"`. Adding `export const dynamic = 'force-static';` to `robots.ts` and `sitemap.ts` fixed it. Build: about 1 s compile, 8 pages generated; routes `/`, `/_not-found`, `/about`, `/article`, `/robots.txt`, `/sitemap.xml`, all "(Static) prerendered as static content". | Tested |
| `/article?url=` | `useSearchParams` is already inside `<Suspense>` in `article/page.tsx`, so the build passed; the page is a static shell that reads the query in the browser. `/article?url=...` served 200 from assets. `article/layout.tsx` metadata gave `noindex, nofollow`. | Tested, Source |
| `/about` (server component) | Rendered to `about.html` at build. Footer year comes from `new Date()` in `layout.tsx`, so it is fixed at build time. | Tested, Source |
| robots and sitemap | `robots.txt` and `sitemap.xml` generated with the same content as the code. | Tested |
| Metadata, JSON-LD | `<title>` per page, OG and Twitter tags, and one `application/ld+json` block on each page are in the HTML. | Tested |
| What `out/` holds | 16.1.6: 69 files, about 1.7 MB: `index.html`, `about.html`, `article.html`, `404.html`, `_not-found.html`, `robots.txt`, `sitemap.xml`, `favicon.ico`, `social-card.png`, RSC payload `.txt` files per route, `_next/static` (16 files in `chunks/`, 11 woff2 fonts from `next/font/google`, build manifest), plus `.gitkeep` and `social-card.html` from `public/`. Client moves between pages fetch the `.txt` payloads; they served 200 `text/plain` from assets. | Tested |
| Next 16.4.3 | Same six static routes, 59 files, about 1.5 MB, with React 19.3.1. | Tested |
| Latest Next | 16.4.3 (`latest`, published Oct 23, 2026; `npm view next`). | Source |
| Security update | Advisories published Oct 14, 2026 cover 16.0.0 to 16.4.0, fixed in 16.4.1: GHSA-673q-mjm6-r5xr (critical, `use cache`), GHSA-2464-fhr4-w9xw (critical, Image Optimization with SVG), GHSA-p3m5-59mp-jv5r (high, Server Actions DoS). 16.1.6 is also inside earlier ranges (Aug 25 fixed in 16.3.3, Jul 21 in 16.2.11, May 6 and 7 in 16.2.5 and 16.2.6). Exposure today: live `/_next/image` returns 404 (`images.unoptimized`), and `web/src` has no server actions, middleware, `use cache` or `next/headers`. With a static export no Next server runs. Bump to 16.4.3 anyway. | Issue, Tested, Source |
| OpenNext instead | `@opennextjs/cloudflare` 1.20.15 needs Next 16.4.1 or later. Every page view becomes a Worker request with React rendering (no cache configured means prerendered pages render on demand, per TourGraph), billed and exposed to issue #1381 (1102 `exceededCpu` after about 120 renders per isolate; still OPEN, last updated Oct 24, 2026). ClearNews has no page that needs a server. | Source, Issue, Inference |
| **Lean for G** | **Static export with Next 16.4.3, served as Worker static assets from the same Worker as the API.** Set `NEXT_PUBLIC_API_URL=/api/v1` so `workers.dev` testing calls its own API. | Inference |

Sources: https://developers.cloudflare.com/workers/static-assets/ , https://github.com/vercel/next.js/security/advisories , https://github.com/opennextjs/opennextjs-cloudflare/issues/1381 , `tourgraph/docs/reviews/2026-11-01-research-cloudflare.md` section 1

## 7. Custom domain switchover (question H)

**Current state (dig and openssl, Nov 1):** nameservers `walt` and `dorthy.ns.cloudflare.com`; `getclearnews.com` and `www` are A records to `64.227.96.170`, TTL 300, DNS only; MX `0 getclearnews-com.mail.protection.outlook.com`; TXT SPF and `google-site-verification`; `autodiscover` resolves to Outlook; no CAA records. [Tested]

| Question | Answer | Label |
|-|-|-|
| Anything changed since Nov 1? | The Custom Domains page is still "Last updated Sep 29, 2026", the version TourGraph read; it still names only CNAME conflicts and never mentions error 100117 or A records. Wrangler is still 4.156.0 (`npm view wrangler`). | Docs, Source |
| 100117 | TourGraph's switchover (Nov 1, 02:38 ET): `wrangler triggers deploy` with the routes in config was refused: "Hostname 'tourgraph.ai' already has externally managed DNS records (A, CNAME, etc). Delete them first" (code 100117). A script then deleted each A record and attached the custom domain by API right after: 484 ms for www, 451 ms for the apex; recreate the record if the attach fails. Cloudflare created proxied `AAAA 100::` records; mail records did not change. | Source (`tourgraph/docs/cloudflare-architecture.md` section 9, `deploy-runbook.md`) |
| Certificates | A Custom Domain "will also generate an Advanced Certificate" for its hostname. The edge already holds a Universal SSL certificate for this zone: a handshake through a Cloudflare IP with SNI `getclearnews.com` (and `www`) returned `CN=getclearnews.com`, SAN `getclearnews.com` and `*.getclearnews.com`, Let's Encrypt YE1, valid to **2026-12-16**. | Docs, Tested |
| Rollback certificate | The droplet's own certificate: Let's Encrypt YE2, valid to **2027-01-07**, so the droplet can stay as a fallback for about two months without certbot. | Tested |
| www | Attach `www` as a second Custom Domain (for the proxied record and certificate) and add the Single Redirect rule from section 5, since assets would otherwise answer on `www`. | Docs, Inference |
| Propagation | Records are DNS only with TTL 300, so clients that cached the droplet address move within about 5 min; keep the droplet serving through that window. | Tested, Inference |
| Mobile apps | iOS `Constants.baseURL = "https://getclearnews.com"`; Android shares `https://getclearnews.com/article?url=...`. Both keep working once the hostname points at the Worker. | Source |

Sources: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ (updated Sep 29, 2026), https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/

## 8. Cost (question I)

Workers Paid ($5/month, account-wide, already paid per TourGraph's and Recurate's architecture docs) includes 10 M requests, 30 M CPU ms, KV 10 M reads, 1 M writes, 1 GB; static asset requests are "free and unlimited"; subrequests are not billed. [Docs]

| Item | Monthly volume (my estimate) | Included | Overage if the account had already used its allowance | Label |
|-|-|-|-|-|
| Cron runs | 43,200 (every minute, 30 days). Counted as requests per the pricing page's example ("720 requests/month" for an hourly cron). | 10 M requests | $0.013 | Docs, Inference |
| Cron CPU | 10 to 50 ms per run (about 3 feeds parsed, state parse and stringify, merge and dedup about 20 ms) = 0.4 M to 2.2 M ms | 30 M ms | $0.01 to $0.04 | Tested, Inference |
| API requests | Unknown; 100,000 as an example, at about 3 ms CPU each | | $0.03 requests, $0.01 CPU | Inference |
| Reader | 10,000 as an example, 10 to 30 ms CPU each | | under $0.01 | Tested, Inference |
| KV | Writes at most 86,400 (two keys per run, fewer when unchanged); reads about 143,000; storage about 2 MB | 1 M writes, 10 M reads, 1 GB | about $0.50 | Docs, Inference |
| Rate Limiting binding | | | Not documented | Docs |
| Logs | Small. From Dec 1, 2026, Workers Logs move to Observability pricing: 50 GB ingestion and 10 GB-month storage per billing cycle included on Paid. | | $0 | Docs |
| **Total** | | | **$0 incremental while inside the included amounts; under $1 otherwise** | Inference |

The droplet is $6/month (`deployment/README.md`: "Basic $6/mo (1 GB RAM, 1 CPU, 25 GB SSD)"). Whether it carries backups or other add-ons on the DigitalOcean bill is not in the repo. [Source] For comparison, option (b) would add about $2.34 to $3.92 (`lite`) or $7.63 to $9.21 (`basic`) a month (section 1.3). [Inference]

## 9. Other things that commonly bite this move

| Item | Detail | Label |
|-|-|-|
| Date format for the apps | Python returns `2026-11-01T15:14:23Z` for articles and `...25.879069Z` (microseconds) for `extracted_at`. JS `toISOString()` gives `.000Z`. iOS tries ISO 8601 with and then without fractional seconds, and Android uses `Instant.parse`, so both forms decode. Keep one format anyway. | Tested, Source |
| `refresh=true` and `complete` | Today `refresh=true` returns cached data, sets `no-store` and starts a background refresh; `complete=false` makes clients retry after 3 s. With a cron every minute, return cached data with `complete: true` and skip the background refresh (a refresh in `ctx.waitUntil` gets only 30 s and would race the cron's KV writes). | Source, Docs, Inference |
| `/health` | iOS `healthCheck()` calls `https://getclearnews.com/health`; keep it in the Worker. | Source |
| CORS | Today allows `https://getclearnews.com`; with the site and API on one origin and native apps, CORS is not needed. | Source, Inference |
| Module scope | `fetch`, timers and random values are not allowed at global scope; `asyncio.Semaphore`-style module state does not carry across invocations. | Docs |
| Cache API on `workers.dev` | Docs promise functional cache operations on custom domains only; test reader caching after the hostname moves. | Docs |
| `CF-Worker` header | Added to every subrequest with our zone name; publishers can see and filter it (section 2). | Docs |
| Ars Technica | The live reader returned `forbidden` for an Ars article that this Mac fetched with 200, so Ars is blocking the droplet's IP or client for article pages. | Tested |
| Google News resolver | All five Google News sources are disabled in `sources.yaml`; no need to port the batchexecute decoder now. | Source |
| Article count | The brief's "roughly 1,700 articles" matches raw items before dedup (1,517 from 39 feeds today); after dedup the API serves about 1,090. | Tested |
| Live config drift | Live response headers are not what `deployment/nginx/clearnews.conf` says (finding 15). Decide which set is intended before writing `_headers`. | Tested, Source |

## 10. Lean (my proposal, not settled)

**One Worker, `clearnews`: static export plus API plus cron, with KV.**

- **Web:** Next 16.4.3 with `output: 'export'`; add `dynamic = 'force-static'` to `robots.ts` and `sitemap.ts`; remove GA; `NEXT_PUBLIC_API_URL=/api/v1`; `privacy.html` and `support.html` in `public/`; `_headers` for security headers and immutable `/_next/static/*`; `.assetsignore`; `not_found_handling: "404-page"`.
- **API:** TypeScript (Hono, as in Recurate) on `/api/*` and `/health`, same paths and JSON shapes. feedsmith, `new Date()`, Readability on linkedom with an injected `<base>`, sanitize-html with today's nh3 allowlist, HTMLRewriter for `og:image`. Rate Limiting binding on `/api/*`, tighter on the reader. Security headers set in code.
- **Cron:** every minute; refresh sources older than 15 min with conditional GETs and `cache: 'no-store'`; carry `og:image` results over by URL; write `state` and `feed` to KV only when they change.
- **Reader:** SSRF check from section 4; results cached 60 min in the Cache API.
- **Zone:** Always Use HTTPS; Single Redirect for `www`; both hostnames attached by the delete-then-attach script TourGraph used; diff DNS before and after for the mail records.
- **Gate before switchover:** on `workers.dev`, compare per-source article counts with the droplet for a day (section 2), run a contract diff of `/api/v1/*` JSON against production for the iOS app, and check the reader on a sample of article URLs from every source.
