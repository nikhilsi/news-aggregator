# ClearNews: inventory for the Cloudflare move

Source of truth: committed code at `8d51f0a` on branch `main` (working tree clean). Next.js 16.1.6 and React 19.2.3 per `web/package.json`. The backend has no lockfile: `backend/requirements.txt` gives version ranges only, so the exact library versions in the production image are unknown. Written 2026-11-01. Read only: nothing in the repo was changed except this file.

How the facts were gathered:

- Code: every file under `backend/app/` (2,321 lines), `backend/sources.yaml`, `web/src/`, `web/next.config.ts`, `deployment/` (nginx, Docker, scripts, static pages), the iOS networking, model and view files under `ios/ClearNews/ClearNews/ClearNews/`, and the Android files under `android/ClearNews/app/src/main/java/com/nikhilsi/clearnews/`.
- Live: 51 GET and HEAD requests to `https://getclearnews.com` between 15:29:02 and 15:30:48 UTC. One `refresh=true` call. The reader was called on 3 URLs. No OPTIONS or POST requests were sent. DNS was looked up at 15:28:51 UTC.
- Local experiments, all in the session scratch directory: the backend was copied out with `git archive` and exercised with FastAPI's TestClient without the app lifespan (so no outbound fetches) for CORS preflight, HEAD, OPTIONS and validation behavior; small Python checks of the sort, dedup, HTML stripping, nh3 and feedparser behavior; a Swift check of `URLComponents` query encoding on this Mac (Darwin 27); a static export build of the committed `web/` (Node 26.12.1, npm 11.20.0). Local library versions: fastapi 0.162.0, starlette 1.10.0, pydantic 2.14.2, feedparser 6.0.14, nh3 0.3.7, httpx 0.28.1.
- Droplet: section 9 comes from facts the main session read over SSH (Nov 1, about 15:20 to 15:35 UTC). I did not connect to the droplet.

Conventions: `file:line` points at the code. "Live" means one of the requests above. "Inference" marks anything not observed directly. Observations are numbered O1 to O36 and collected in section 12. Strings in the code that contain an em dash are written here with `(U+2014)` in its place.


## Key facts

1. One hostname, `getclearnews.com`. The backend has 5 routes, all GET: `/health`, `/api/v1/articles`, `/api/v1/articles/reader`, `/api/v1/categories`, `/api/v1/sources`. The web app has 3 pages (`/`, `/about`, `/article`) plus `/robots.txt` and `/sitemap.xml`. nginx serves `/privacy` and `/support` from two HTML files that match the repo byte for byte (live). Nothing is written anywhere; there is no database.
2. The iOS app (2.0, live on the App Store) and the Android app call exactly three API paths: `/api/v1/articles` (with `page`, `per_page=20`, `category` unless "all", `search` unless empty, `refresh=true` on pull to refresh), `/api/v1/categories`, and `/api/v1/articles/reader?url=`. No client calls `/api/v1/sources`, the `source` parameter, or `/health` (iOS has an unused `healthCheck`).
3. Fields whose absence, null value or wrong type makes the apps reject the whole response: article `title`, `url`, `source_id`, `source_name`, `source_type`, `category`; `pagination.page`, `per_page`, `total`, `total_pages`; category `id`, `name`, `source_count`; reader `status`, `url`. iOS also decodes `published_at` as a Date, so it must be ISO 8601 with a zone designator. Live sends `2026-11-01T15:21:11Z`. A zone-less value fails the whole page on iOS. All clients ignore extra fields.
4. Latent HTTP 500: the sort key is `published_at or ""` (`service.py:215-217`, `:231`). One undated article among dated ones raises `TypeError` (reproduced locally), and so does a mix of zone-aware and zone-less dates. Live `all` requests return 200, so no cached item is undated right now.
5. Feed failures hide data. A failed fetch caches `[]` over the source's last good articles for 15 minutes (`service.py:293`). A 304 resets the TTL with no age limit (`cache.py:161-169`). Live: the Finance tab holds only FMP Market Analysis items dated 2026-10-22. Droplet logs: Good News Network answered 403 to 83 of 83 fetches in the last 24 h, and FMP Financial News answers 402.
6. API use is tiny (droplet logs, Oct 18 to Nov 1): 29 distinct IPs called `/api/v1/articles` (81 calls). The iOS app made 4 article calls, 3 category calls and 1 reader call. Android made 3 requests. `refresh=true` was called 0 times.
7. The live nginx file is the pre v2.0.0 version, not the repo file (droplet facts, and live headers agree). Live sends `X-XSS-Protection: 1; mode=block`, a CSP with `'unsafe-eval'`, `Server: nginx/1.24.0 (Ubuntu)` and `X-Powered-By: Next.js`, and sends no `Referrer-Policy` or `Permissions-Policy`.
8. A static export of the web app works. Every route is already prerendered today (live `x-nextjs-prerender: 1`). In a scratch copy, `output: 'export'` failed only on `/robots.txt`. Adding `export const dynamic = 'force-static'` to `robots.ts` and `sitemap.ts` made it build (1.7 MB `out/`). There are no route handlers, middleware, server data fetches or `next/image` optimization.
9. Cache-Control: `public, max-age=300` on `/api/v1/articles` (every status, including 422 and partial `complete:false` results), `/api/v1/categories` and `/api/v1/sources`. `no-store` appears only when `refresh` is literally `true`. The reader and `/health` get none. The auto-retry after `complete:false` requests the same URL, so a browser or iOS URL cache can hand back the cached partial page (inference, not tested on a device).
10. The reader SSRF check resolves and checks the host once, but redirects are followed without a new check, the response size is unlimited, and `100.64.0.0/10` passes (tested locally).
11. Dropping FMP leaves Finance with zero enabled sources. `/categories` hides any category with zero enabled sources (`registry.py:102-104`), so the Finance tab disappears from all three clients unless RSS finance feeds land in the same change. `rapidfuzz` is in `requirements.txt` but is never imported.
12. DNS is already on Cloudflare nameservers (`walt.ns.cloudflare.com`, `dorthy.ns.cloudflare.com`). Apex and www resolve to the droplet IP 64.227.96.170, so they are DNS only (inference: proxied records would return Cloudflare addresses). MX points to `getclearnews-com.mail.protection.outlook.com`; SPF includes Outlook.


## 1. Backend API contract

### 1.1 App level behavior (applies to every route)

| Behavior | Detail | Ref |
|:-|:-|:-|
| Routes | `/health` at root; everything else under `/api/v1`. Any other path that reaches FastAPI returns 404 `{"detail":"Not Found"}`, `application/json`, no Cache-Control. Live: `/api/v1/nope` and `/api/v1/docs`. | `main.py:141-148` |
| API docs | `/docs`, `/redoc`, `/openapi.json` are off when `CORS_ORIGINS` starts with `https://` (true in production). Tested locally: 404. nginx would not route `/docs` to FastAPI anyway. | `main.py:67-76` |
| Methods | Only GET is routed. HEAD returns 405 `{"detail":"Method Not Allowed"}` with `allow: GET` (live on `/health` and `/api/v1/categories`). A plain OPTIONS or a POST also returns 405 (tested locally). | FastAPI `APIRoute` does not add HEAD |
| Trailing slash | `/api/v1/categories/` and `/health/` return 307 with `location: http://getclearnews.com/...` (live). The scheme is `http` because uvicorn does not trust `X-Forwarded-Proto` from the Docker bridge (inference from `Dockerfile.backend:39`, which passes no proxy flags). The client then gets a second hop, the port 80 301. | Starlette `redirect_slashes` |
| Validation errors | 422, body `{"detail":[{"type","loc","msg","input","ctx"?}]}`. Live examples in 1.4. | FastAPI default |
| Content-Type | `application/json` (no charset) on every API response, live. | |
| Compression | None from the API, even with `Accept-Encoding: gzip, br` (live, `/api/v1/categories`). | |
| Request log | Every request except `/health` is logged with method, path and full query string (so reader URLs and search terms are in logs), then status and duration. | `main.py:93-119` |
| Middleware order | `cache_control_middleware` is registered last, so it runs outermost and stamps headers on every response for its paths, errors included. | `main.py:123-137` |

### 1.2 Response shapes

All shapes come from `backend/app/common/schemas.py`. Pydantic serializes every declared field, so null fields are present as `null`, never omitted. Datetimes serialize as `YYYY-MM-DDTHH:MM:SSZ` when the value is UTC with no microseconds (live), `...+05:30` for other offsets, `...T03:04:05` with no zone for a zone-less value, and with 6 fractional digits when microseconds are set (`extracted_at`). The last three were tested locally.

`Article` (`schemas.py:17-29`), key order as served:

| Field | Type | Notes |
|:-|:-|:-|
| `title` | string | Never null. HTML stripped (2.3). |
| `summary` | string or null | Up to 500 chars. Can be `""` (live: a The Hindu item had length 0). |
| `url` | string | Article link; dedup key. |
| `image_url` | string or null | |
| `source_id` | string | From `sources.yaml`. |
| `source_name` | string | From `sources.yaml`. |
| `source_type` | string | `rss` or `financial_api` today (`news_api` is defined but disabled). |
| `category` | string | The source's category. |
| `sentiment` | number or null | Always null: no fetcher sets it (`rss_fetcher.py:200`, `fmp_fetcher.py:60,90`). |
| `published_at` | string or null | ISO 8601 (above). Null when the feed has no usable date. |

`ArticleListResponse` (`schemas.py:41-46`): `{"articles": Article[], "pagination": {"page": int, "per_page": int, "total": int, "total_pages": int}, "complete": bool}`.

`Category` (`schemas.py:81-86`): `{"id": str, "name": str, "source_count": int}`. The endpoint returns a bare JSON array, not a wrapper object.

`Source` (`schemas.py:70-78`): `{"id", "name", "type", "category", "enabled": bool, "is_curated_positive": bool}`. Bare array.

`Reader` (`schemas.py:49-67`): `{"status": "ok"|"failed", "url": str, "title", "author", "content_html", "word_count": int, "image_url", "source_name", "published_at", "extracted_at", "reason"}`, all but `status` and `url` nullable. See 4.5 for which fields are set in each case.

Health (`main.py:145-148`): exactly `{"status":"ok"}`, 15 bytes (live).

Error bodies: `{"detail": "<string>"}` for 400 and 404 and 405; `{"detail": [ ... ]}` for 422.

### 1.3 Endpoints

| Endpoint | Input | 200 body | Other statuses | Cache-Control |
|:-|:-|:-|:-|:-|
| `GET /health` (`main.py:145-148`) | none | `{"status":"ok"}` | 405 on HEAD | none |
| `GET /api/v1/articles` (`articles/router.py:44-83`) | see 1.4 | `ArticleListResponse`. Live `per_page=1`: total 1,091, `complete: true`. | 422 on invalid `page`, `per_page`, `refresh` | `public, max-age=300`; `no-store` when `refresh` equals the string `true` (`main.py:131-135`) |
| `GET /api/v1/articles/reader` (`articles/router.py:17-34`) | `url` required string | `Reader` (status ok or failed) | 400 `{"detail":"URL scheme not allowed"}`, `{"detail":"Invalid URL"}`, `{"detail":"URL not allowed"}`; 422 when `url` is missing: `{"detail":[{"type":"missing","loc":["query","url"],"msg":"Field required","input":null}]}` (live) | none |
| `GET /api/v1/categories` (`sources/router.py:33-37`) | none | `Category[]`, 13 entries live (2.9) | 405 on HEAD | `public, max-age=300` |
| `GET /api/v1/sources` (`sources/router.py:16-30`) | none | `Source[]`, all 48 in file order, 41 enabled (live) | 405 on HEAD | `public, max-age=300` |

### 1.4 `/api/v1/articles` query parameters

| Param | Declared | Behavior | Ref |
|:-|:-|:-|:-|
| `category` | str, default `"all"` | `all` selects every enabled source. Any other value selects enabled sources whose `category` matches exactly (case sensitive). Unknown or empty value: 200 with `[]`, `total: 0`, `total_pages: 1`, `complete: true` (live `category=nope`, local `category=`). Also controls the non-Latin filter and the sort mode even when `source` is set. | `router.py:46`, `registry.py:72-76`, `service.py:519`, `:527` |
| `source` | str, optional | If non-empty, selects that one source; `category` is ignored for selection. Unknown or disabled id: 200 empty, `complete: true` (live `source=nope`, `source=smithsonian`). Empty string is treated as absent. | `service.py:447-453` |
| `search` | str, optional | `strip().lower()`; empty after strip means no filter (live `search=%20%20` returned the normal first item). Substring match on lowercased `title` or `summary` (null counts as `""`). Applied after dedup and sort, before pagination, so `total` counts matches. | `router.py:37-41`, `:62-65` |
| `page` | int, `ge=1`, default 1 | `page=0`: 422 `{"detail":[{"type":"greater_than_equal","loc":["query","page"],"msg":"Input should be greater than or equal to 1","input":"0","ctx":{"ge":1}}]}` (live). `page=abc`: 422 `int_parsing` (live). `page=` (empty): 422 `int_parsing` with `"input":""` (local). Past the end: 200, empty `articles`, `page` echoed, `total` and `total_pages` computed (live `page=99999&per_page=50`: total 1,091, total_pages 22). | `router.py:49` |
| `per_page` | int, `ge=1`, `le=50`, default 20 | `per_page=0`: 422 `greater_than_equal` (live). `per_page=500`: 422 `{"detail":[{"type":"less_than_equal","loc":["query","per_page"],"msg":"Input should be less than or equal to 50","input":"500","ctx":{"le":50}}]}` (live). | `router.py:50` |
| `refresh` | bool, default false | Pydantic lax booleans: `true/false`, `1/0`, `yes/no`, `on/off`, `t/f`, `y/n`, any case. `refresh=abc`: 422 `bool_parsing` (live). Any true value takes the refresh path (3.2), but only the exact string `true` gets `no-store` (local test: `refresh=1` and `refresh=TRUE` returned `complete:false` with `public, max-age=300`). | `router.py:51`, `main.py:132` |
| repeated key | | Last value wins (local: `per_page=5&per_page=7` gave 7). | Starlette |
| unknown params | | Ignored. | |

Pagination math (`router.py:68-72`): `total = len(filtered)`, `total_pages = max(1, ceil(total / per_page))`, slice `[(page-1)*per_page : page*per_page]`. The list is rebuilt on every request, so pages can shift between calls when the cache changes.

`complete` (`service.py:461`, `:479`, `:515`): `true` unless the refresh path ran (always `false` then, even if every source was already refreshing or the cache is empty), or some cache MISS sources were still running at the 3 s deadline.

### 1.5 CORS

From `main.py:80-87` with `CORS_ORIGINS=https://getclearnews.com` (`docker-compose.prod.yml:10`): `allow_origins=["https://getclearnews.com"]`, `allow_credentials=True`, `allow_methods=["GET","OPTIONS"]`, `allow_headers=["Content-Type"]`.

| Request | Result | Source |
|:-|:-|:-|
| GET with `Origin: https://getclearnews.com` | `access-control-allow-origin: https://getclearnews.com`, `access-control-allow-credentials: true`, `vary: Origin` | live |
| GET with `Origin: https://example.org` | No `access-control-allow-origin`, but `access-control-allow-credentials: true` is still sent | live |
| GET with no Origin | No CORS headers | live |
| Preflight from the allowed origin | 200 `text/plain` body `OK`, `access-control-allow-methods: GET, OPTIONS`, `access-control-allow-headers: Accept, Accept-Language, Content-Language, Content-Type`, `access-control-max-age: 600` | local TestClient only |
| Preflight from another origin, or asking for POST, or for header `X-Foo` | 400 `Disallowed CORS origin` / `Disallowed CORS method` / `Disallowed CORS headers` | local TestClient only |

The web app calls the API on the same origin and the native apps send no Origin, so CORS is not exercised in production (inference).

### 1.6 Who calls what

| Caller | Calls |
|:-|:-|
| Web home page (browser) | `/api/v1/categories` on mount (`CategoryTabs.tsx:20-24`); `/api/v1/articles` (`useArticles.ts:61-67`); `/api/v1/articles/reader` from the reader modal (`ReaderModal.tsx:34`) |
| Web `/article` page (browser) | `/api/v1/articles/reader` (`article/page.tsx:46`) |
| iOS | `/api/v1/articles` (`ArticleService.swift:28-31`, `:47-50`, `:74-77`), `/api/v1/categories` (`CategoryService.swift:12`), `/api/v1/articles/reader` (`ReaderView.swift:176-179`). `healthCheck()` (`APIClient.swift:81-87`) is never called. |
| Android | Same three paths (`ApiClient.kt:29-60`) |
| Nobody in the repo | `/api/v1/sources`, the `source` parameter (web `api.ts:51` supports it, nothing passes it), `/health` (Docker healthchecks only: `docker-compose.prod.yml:24`, `:48`) |

### 1.7 State in process memory

| State | Where | On Workers |
|:-|:-|:-|
| Article cache `_cache: dict[source_id, CacheEntry]` and reader cache entries in the same dict under `reader:<url>` | `cache.py:67`, `reader.py:198` | Needs a store (KV, Cache API or similar): per isolate memory is not shared |
| `_refreshing: set[str]` guard | `cache.py:70` | Same |
| ETag and Last-Modified per feed URL `_http_validators` | `rss_fetcher.py:43`, `fmp_fetcher.py:28` | Must live next to the cached articles (O4) |
| Shared `httpx.AsyncClient`, connection pool | `main.py:47-56`, `service.py:33-46` | Replaced by `fetch` |
| `_gnews_semaphore = asyncio.Semaphore(10)` | `rss_fetcher.py:278` | Only used by disabled Google News sources |
| `_warmup_complete` event, refresh loop task | `service.py:564`, `main.py:59-61` | Replaced by the Cron Trigger (decision 2) |
| Registry lists `_sources`, `_categories` loaded at startup | `registry.py:47-57` | Bundle `sources.yaml` as data |


## 2. Article pipeline

### 2.1 Outbound HTTP client

One `httpx.AsyncClient` for every outbound request (`main.py:47-55`): `follow_redirects=True` (httpx allows 20 hops by default), header `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`. Other headers are httpx defaults (`Accept: */*`, `Accept-Encoding: gzip, deflate`, plus br or zstd only if those packages are installed, unknown in the image). httpx default pool limits apply: 100 connections, 20 keep-alive. A per call `timeout=N` sets connect, read, write and pool timeouts to N each; it is not a total wall clock limit.

| Call | Timeout | Ref |
|:-|:-|:-|
| RSS feed | 10 s | `rss_fetcher.py:39`, `:396` |
| FMP API | 10 s | `fmp_fetcher.py:24`, `:127` |
| og:image page | 5 s | `rss_fetcher.py:210`, `:219` |
| Google News decode (2 calls) | 8 s each | `rss_fetcher.py:273`, `:304`, `:322-329` |
| Reader page | 15 s | `reader.py:32`, `:211` |
| Refresh loop, per source total | 30 s wall clock (`asyncio.wait_for`) | `service.py:567`, `:622-625` |

### 2.2 RSS fetch (`fetch_rss`, `rss_fetcher.py:369-455`)

1. Conditional headers: if validators exist for `source.url`, send `If-None-Match: <etag>` and `If-Modified-Since: <last-modified>` (`:388-394`).
2. 304: return `None` (means "unchanged"; caller extends the TTL) (`:399-401`).
3. Any other non-2xx: `raise_for_status`, caught, return `[]` (`:403`, `:419-421`). Timeout and network errors also return `[]` (`:416-424`).
4. On 2xx, store new validators only if the response has an `ETag` or `Last-Modified`; otherwise the old validators stay (`:406-414`).
5. Parse `response.text` (httpx decodes using the header charset, else UTF-8) with `feedparser.parse` in a thread (`:427`). If `bozo` and no entries, return `[]` (`:430-432`).
6. Normalize each entry; an entry that throws is skipped (`:435-443`).
7. Resolve Google News URLs (2.4), then og:image backfill (2.5) (`:447`, `:450`).

### 2.3 Normalization (`_normalize_entry`, `rss_fetcher.py:172-202`)

Required: `entry.title` and `entry.link`; if either is falsy the entry is dropped (`:179-185`). feedparser fills `link` from `<guid isPermaLink="true">` when `<link>` is missing (tested locally).

Ad filter: drop the entry if `"/visualstories/"` is anywhere in the URL (`:188-189`). Targets India Today visual stories.

| Output field | Rule | Ref |
|:-|:-|:-|
| `title` | `strip_html(entry.title) or entry.title`. feedparser has already decoded entities; HTML inside a CDATA title survives feedparser and is stripped here. | `:192` |
| `summary` | `entry.summary`, else `entry.content[0].value`. feedparser maps RSS `description` and Atom `summary` to `summary`, and copies `content:encoded` into `summary` when there is no description (tested). Then `strip_html`; if longer than 500 chars, first 497 chars plus `...`. | `:154-169` |
| `url` | `entry.link` | `:194` |
| `image_url` | First match in this order: (1) `media_content` items in order, first with a non-empty `url` whose `type` contains `image` or has no `type`; (2) first `media_thumbnail` with a `url`; (3) first `enclosures` item whose `type` contains `image`, returning `href` or `url`; (4) first `<img ... src="...">` (single or double quotes) in `summary`, then in `content[0].value`; else null. Tested: a `video/mp4` media:content is skipped and the thumbnail wins. | `:78-126` |
| `source_id`, `source_name`, `source_type`, `category` | From the source config, not the feed | `:196-199` |
| `sentiment` | Always null | `:200` |
| `published_at` | `published_parsed`, else `updated_parsed` (feedparser struct_time, already converted to UTC), built as an aware UTC datetime with second precision. Else `parsedate_to_datetime(published or updated)`, which can return a zone-less datetime for a `-0000` zone (tested). Else null. feedparser maps RSS `pubDate` and Atom `published` to `published`, and `dc:date` and Atom `updated` to `updated` (tested). An invalid date such as `2026-13-45` is rolled over by feedparser to 2027-01-01 (tested). | `:129-151` |

`strip_html` (`:48-72`): Python `HTMLParser`, collects text chunks and joins them with a single space, then `strip()`. This adds spaces around tags: `Hello <b>world</b>! &amp; more <p>para</p>` becomes `Hello  world ! & more  para` (tested). Entities are decoded. Empty input returns null; whitespace only or tag only input returns `""`. On a parser exception it falls back to a regex tag strip.

### 2.4 Google News URL resolver (`rss_fetcher.py:273-364`)

Runs for any article URL containing `news.google.com/`. For each, under a semaphore of 10: GET the URL, regex `data-n-a-sg` and `data-n-a-ts`, then POST `f.req=...` to `https://news.google.com/_/DotsSplashUi/data/batchexecute` and parse the decoded URL. On any failure the Google URL stays. All five Google News sources are disabled (`sources.yaml:318-361`), so this code does not run today.

### 2.5 og:image backfill (`rss_fetcher.py:205-261`)

- When: after every successful (2xx) RSS fetch, for every article in that fetch with no `image_url`. Not after a 304. Results are not remembered, so the same pages are fetched again on every 2xx fetch of the feed.
- Concurrency: all missing images of one feed at once via `asyncio.gather`, no per feed limit (`:251-252`). Only the shared pool limit of 100 connections applies.
- Fetch: GET article URL, 5 s timeout, redirects followed. The comment says only 15 KB is read, but `response.text` downloads and decodes the whole page before slicing the first 15,000 chars (`:219-221`).
- Match: regex `<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`, then the reversed attribute order (`:222-234`). `name="og:image"` and `twitter:image` are not recognized. The value is not entity-decoded or validated (a relative path passes through).
- Any error: no image. Not applied to FMP items.

### 2.6 Request pipeline for `/api/v1/articles` (`service.py:421-535`, `router.py:59-83`)

Runs in full on every request; nothing after the per source cache is memoized.

1. Pick sources (1.4).
2. Collect articles per source in `sources.yaml` order from HIT and STALE entries (or from any entry on the refresh path), then append MISS results in completion set order, which is not deterministic (`service.py:388`).
3. Non-Latin filter, unless `category == "india"` (`service.py:519-520`). On `title` only. Count characters whose Unicode category starts with `L`; code point `<= 0x024F` is Latin, anything above is non-Latin. Drop when `non_latin / letters > 0.2`. No letters: keep. Tested: Devanagari and Greek titles dropped, `Café über naïve` kept.
4. Dedup (2.7).
5. Two-tier sort (2.8).
6. Search filter, then paginate (1.4).

### 2.7 Dedup (`service.py:80-190`)

- Keywords (`:93-97`): lowercase; replace `'s ` with a space, then remove remaining `'s`; tokens are `[a-z0-9]+` (ASCII only, so `café` yields `caf`; the curly apostrophe is not handled); drop 59 stop words (`:80-87`, 42 of them longer than 2 chars) and tokens of length 2 or less.
- Match (`:100-106`): both sets non-empty and `|A ∩ B| / min(|A|, |B|) >= 0.6`.
- Priority (`:109-116`): tuple `(is_direct, has_image)`, compared in that order. `is_direct` is 0 when `source_name` contains `Google News`. Higher wins; a tie keeps the article seen first (tested).
- Algorithm (`:119-190`), one pass in input order:
  1. URL layer, global across categories: if the exact URL was seen, the new article replaces the old one only if its priority is strictly higher; either way one is counted removed.
  2. Title layer, only within the same `category`: compare with each earlier non-removed article in that category bucket, in order; stop at the first match; the new one replaces it only if strictly higher priority.
  3. Otherwise keep.
- The result keeps first-seen order. Because ties keep the first seen, `sources.yaml` order decides which outlet survives.

### 2.8 Two-tier sort (`service.py:220-263`)

1. Sort all articles by `published_at` descending (stable; equal times keep input order). Key is `published_at or ""` (O1).
2. Tier 1 for `category == "all"`: walk the time sorted list, take each source's newest article (first appearance), then walk those picks in that order and keep at most 3 per category.
3. Tier 1 for any other category value (including when `source` is used with a category): each source's 5 newest articles.
4. Output: tier 1 articles in time order, then all others in time order.

Live `all` page 1 (per_page 50) starts with India Today, CBS Sports, The Hindu, Engadget, Polygon, Times of India: the third India pick at position 6 confirms the cap of 3 per category.

### 2.9 Categories (`registry.py:87-105`)

- Order is the `categories` list in `sources.yaml` (`:8-34`).
- `all` is always returned, with `source_count` = number of enabled sources (41 live).
- Other categories are returned only when at least one enabled source has that category. `source_count` is the number of enabled sources configured, not the number that currently fetch successfully (Feel Good shows 5 although Good News Network always fails).
- A source category missing from the `categories` list would be counted but never listed.

### 2.10 FMP fetcher (dropped by decision 3)

`fmp_fetcher.py:95-189`: reads the key via `settings.<api_key_env lower>` or the env var (`:107-108`), appends `apikey=` to the URL, sends conditional headers, 304 returns None. Two normalizers chosen by `"fmp-articles" in source.url` (`:172-173`). `publishedDate` or `date` parsed as `%Y-%m-%d %H:%M:%S` UTC (`:31-38`). `fmp-articles` summaries are stripped and cut at 500; general news `text` is not.

Everything that references FMP or `source_type`:

| Place | Ref |
|:-|:-|
| Import and dispatch on `source.type == "financial_api"` | `service.py:28`, `:62-63` |
| Fetcher | `sources/fmp_fetcher.py` (whole file) |
| Settings `fmp_api_key` | `config.py:22` |
| Two sources | `sources.yaml:375-383`, `:477-485` |
| `source_type` values documented | `schemas.py:26`, `:75`; `registry.py:37` |
| `source_type` decoded (required string, value unused) | iOS `Article.swift:10`; Android `Article.kt:14`; web `types.ts:10` |
| Env var on the droplet | `deployment/.env.production` holds `FMP_API_KEY` only (droplet facts) |
| User facing text "financial news APIs" | iOS `AboutView.swift:30`; Android `AboutScreen.kt:85`; `deployment/static/privacy.html:63`; `support.html:49`; `appstore/metadata/description.txt:3`; `review_notes.txt:1`; `fastlane/metadata/android/en-US/full_description.txt:19`, `:29` |
| Docs | `README.md:3`, `:13`; `PROJECT.md:127`, `:165`, `:419`; `backend/README.md:54`, `:76`, `:113` |


## 3. Cache semantics

### 3.1 States (`cache.py:87-115`)

| State | Condition | Returned |
|:-|:-|:-|
| HIT | `now < fetched_at + ttl` | articles |
| STALE | `fetched_at + ttl <= now < fetched_at + 96 × ttl` (24 h for the 15 min TTL every source has) | articles |
| MISS | no entry, or older than 96 × ttl | nothing |

TTL is per source from `cache_ttl_minutes` (all 15 in `sources.yaml`; model default 15, `registry.py:43`). `settings.cache_ttl_minutes` (`CACHE_TTL_MINUTES`) is never read.

### 3.2 Request path per state (`service.py:446-516`)

- HIT: use the articles.
- STALE: use the articles, and if the source is not flagged refreshing, flag it and start one background task that fetches all such stale sources concurrently (`_background_refresh`, `:304-319`).
- MISS: start a task per source and wait up to 3 s (`_COLD_FETCH_DEADLINE`, `:327`). Results that finished are cached and returned; the rest keep running in a background task that caches them as they finish (`:330-354`). `complete` is false if any were still pending. MISS fetches do not set the refreshing flag (O22).
- `refresh` true: return whatever each source has cached, regardless of age (`cache.get_articles`, `cache.py:118-127`); flag and background refresh every selected source not already refreshing; `complete: false`; no synchronous fetch even for missing sources. Clients skip the auto-retry after a refresh (6.4), so the refreshed data shows on the next normal request.
- A fetch result of `[]` (any error) is stored with `cache.set`, replacing earlier articles (`service.py:293`, `:348`, `:402`, `:596`) (O2).

### 3.3 304 handling

A `None` result (304) calls `extend_ttl`, which sets `fetched_at = now` and keeps the articles (`cache.py:161-169`). There is no limit on how often, so a source that keeps answering 304 serves the same items forever. If there is no entry, `extend_ttl` does nothing and the source stays empty (`:167-169`). Live: `/api/v1/articles?category=finance` returned 19 items, all from `fmp-articles`, all dated 2026-10-22 (13:14:57Z to 19:06:41Z), 10 days old; droplet logs show that endpoint answering 304.

### 3.4 Warmup and refresh loop

- Warmup (`service.py:538-556`): at startup, fetch all enabled sources concurrently (`asyncio.gather`, no deadline), cache results, then set `_warmup_complete`.
- Loop (`service.py:570-639`): waits for warmup, then forever: pick enabled sources that are not fresh (missing or past TTL); prefer one with no entry, else the oldest `fetched_at` (`cache.py:138-158`); skip if refreshing; flag, fetch with a 30 s wall clock cap, cache (`[]` on error, extend on 304), clear flag; then sleep 25 s. One source per iteration, so a full pass over 41 sources takes at least 41 × 25 s ≈ 17 minutes. Since that is longer than the 15 min TTL, most entries spend part of each cycle STALE (inference).

### 3.5 Refreshing guard

`_refreshing` (`cache.py:70`, `:181-193`) is set by the STALE path, the refresh path and the loop, and cleared in `finally` blocks (`service.py:317-319`, `:631-632`). Warmup and MISS fetches do not use it.

### 3.6 Reader content cache

Key `reader:` + the exact `url` string from the query. TTL 60 minutes (`reader.py:31`). Stored with `cache.set` in the same dict as articles; read with `cache.get`, which returns only fresh entries (`cache.py:76-84`). Failed results (timeout, forbidden, error, extraction_empty) are cached for 60 minutes too (`reader.py:216-230`, `:246-248`). Entries are never deleted, only overwritten.


## 4. Reader endpoint

### 4.1 Validation and SSRF (`reader.py:37-67`)

Order: `urlparse(url)`; scheme (lowercased) must be `http` or `https`, else 400 `URL scheme not allowed`; `hostname` must be non-empty, else 400 `Invalid URL`; then `_is_private_ip(hostname)`, else 400 `URL not allowed`.

`_is_private_ip` (`:40-55`): if the host is an IP literal, block when `is_private`, `is_loopback`, `is_link_local` or `is_reserved`. Otherwise `socket.getaddrinfo(host, None, AF_UNSPEC, SOCK_STREAM)` and block if any resolved address matches; a DNS failure blocks. Tested locally: `localhost`, `10.0.0.1`, `0.0.0.0`, `[::1]`, `HTTPS://127.0.0.1/` and an unresolvable `.invalid` host are blocked; `100.64.0.1` (shared address space) is allowed. Live: `http://127.0.0.1/admin` gave 400 `URL not allowed`, `ftp://example.com/` gave 400 `URL scheme not allowed`.

Validation runs twice: in the router (`router.py:30-32`) and again inside `extract_article_content` (`reader.py:192-195`). The second one would return reason `invalid_url`, but the router has already returned 400, so `invalid_url` is never sent.

Not checked: redirect targets (the client follows redirects, `reader.py:211`), the address httpx connects to after its own DNS lookup, and response size (O8).

### 4.2 Fetch

`GET url`, redirects followed, 15 s timeout, shared client headers (2.1). `raise_for_status`; body is `response.text` with no size limit (`reader.py:209-213`).

### 4.3 Extraction (`reader.py:133-165`, `:232-248`)

1. readability-lxml `Document(html, url=url)`; `content = doc.summary()`, `title = doc.short_title()`. Success if content is non-empty and the tag-stripped text has at least 50 words (`MIN_WORD_COUNT`, `:33`). Words are `split()` on the text after replacing tags with spaces.
2. Else trafilatura `extract(html, url=url, include_comments=False, include_tables=True, include_images=True, include_links=True, favor_recall=True, output_format="html")`, same 50 word rule; title becomes null.
3. Else failed with reason `extraction_empty`.
4. Sanitize with nh3 (4.4), then `word_count` is recounted on the sanitized HTML (`:251-252`).
5. Author from the raw page (`:168-178`): regex `<meta\s+name="author"\s+content="([^"]+)"`, then `<meta\s+property="article:author"\s+content="([^"]+)"`, case-insensitive, double quotes and this attribute order only.

### 4.4 nh3 sanitization (`reader.py:73-103`)

- Tags: `p br b i em strong a img h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code figure figcaption div span table thead tbody tr th td caption sub sup hr mark del ins`.
- Attributes: `a`: `href`, `title`; `img`: `src`, `alt`, `width`, `height`, `loading`; `td` and `th`: `colspan`, `rowspan`. Nothing else (no `class`, `style`, `srcset`, `target`).
- URL schemes: `http`, `https`, `data`. Relative URLs are kept. Tested: `javascript:` and `mailto:` hrefs are removed (the `<a>` stays without `href`); `data:image/png` src kept; `/rel.jpg` and `//proto.rel/x` kept.
- `link_rel="noopener noreferrer"`: every `<a>` gets exactly `rel="noopener noreferrer"`, replacing any existing rel.
- Disallowed tags are unwrapped (text kept, e.g. `<section>`), except `script` and `style`, whose content is removed (nh3 default), and `iframe`, which is removed (tested).
- Clients sanitize again: web DOMPurify (`article/page.tsx:191`, `ReaderModal.tsx:243`); iOS and Android render in a WebView with their own CSP (per `CHANGELOG.md` 2.0.0; not re-read here).

### 4.5 Responses (always HTTP 200 once validation passes)

| Case | `status` | `reason` | Fields set (others null) | Ref |
|:-|:-|:-|:-|:-|
| Extracted | `ok` | null | `url`, `title` (cached article title, else readability short title, else null), `author`, `content_html`, `word_count`, `image_url`, `source_name`, `published_at` (last three only from a fresh article cache entry with that exact URL), `extracted_at` (now, with microseconds) | `reader.py:263-274` |
| HTTP 401 or 403 | `failed` | `forbidden` | `url`, plus `title`, `source_name`, `image_url`, `published_at` from cache metadata when found | `:219-225`, `:280-290` |
| Other HTTP error status | `failed` | `error` | same | `:221` |
| Timeout | `failed` | `timeout` | same | `:214-218` |
| Network or other exception | `failed` | `error` | same | `:226-230` |
| Both extractors under 50 words | `failed` | `extraction_empty` | same. Live: `https://example.com/` returned this in 2.17 s. | `:244-248` |

Metadata lookup (`reader.py:117-130`) scans every non-reader cache entry that is fresh (within TTL), so a source in its STALE window contributes nothing.


## 5. Sources (`backend/sources.yaml`)

### 5.1 File structure

Two top-level keys only: `categories` (list of `{id, name}`) and `sources` (list). Source fields: `id`, `name`, `type`, `url`, `category`, `is_curated_positive`, `enabled`, `cache_ttl_minutes`, and `api_key_env` on three sources. `is_curated_positive` is only echoed by `/api/v1/sources`; nothing filters on it (`registry.py:40`, `sources/router.py:27`). The registry path is `backend/sources.yaml` resolved from the package (`registry.py:19`).

### 5.2 Categories, in display order (`sources.yaml:8-34`)

| # | id | name | Enabled sources today |
|:-|:-|:-|:-|
| 1 | `all` | All | 41 |
| 2 | `general` | General | 2 |
| 3 | `local` | Local | 4 |
| 4 | `feel_good` | Feel Good | 5 |
| 5 | `science` | Science | 4 |
| 6 | `tech` | Technology | 4 |
| 7 | `entertainment` | Entertainment | 4 |
| 8 | `finance` | Finance | 2 (both FMP) |
| 9 | `health` | Health | 2 |
| 10 | `sports` | Sports | 1 |
| 11 | `offbeat` | Offbeat | 3 |
| 12 | `travel` | Travel | 4 |
| 13 | `india` | India | 6 |

Live `/api/v1/categories` returned exactly these 13 with these counts.

### 5.3 All 48 sources

48 sources: 41 enabled (39 `rss`, 2 `financial_api`), 7 disabled. Every source has `cache_ttl_minutes: 15`. Only the Feel Good sources have `is_curated_positive: true`. "Line" is the `- id:` line in `sources.yaml`.

| # | id | name | type | category | enabled | line | url |
|:-|:-|:-|:-|:-|:-|:-|:-|
| 1 | `good-news-network` | Good News Network | rss | feel_good | yes | 39 | https://www.goodnewsnetwork.org/feed/ |
| 2 | `positive-news` | Positive News | rss | feel_good | yes | 48 | https://positive.news/feed |
| 3 | `sunny-skyz` | Sunny Skyz | rss | feel_good | yes | 57 | https://www.sunnyskyz.com/rss_tebow.php |
| 4 | `bbc-uplifting` | BBC Uplifting | rss | feel_good | yes | 66 | https://feeds.bbci.co.uk/news/topics/cx2pk70323et/rss.xml |
| 5 | `dailygood` | DailyGood | rss | feel_good | yes | 75 | https://www.dailygood.org/feed/ |
| 6 | `ars-technica-science` | Ars Technica - Science | rss | science | yes | 85 | https://feeds.arstechnica.com/arstechnica/science |
| 7 | `nasa-breaking-news` | NASA Breaking News | rss | science | yes | 94 | https://www.nasa.gov/rss/dyn/breaking_news.rss |
| 8 | `new-scientist` | New Scientist | rss | science | yes | 103 | https://www.newscientist.com/feed/home/ |
| 9 | `scientific-american` | Scientific American | rss | science | yes | 112 | https://www.scientificamerican.com/platform/syndication/rss/ |
| 10 | `the-verge` | The Verge | rss | tech | yes | 122 | https://www.theverge.com/rss/index.xml |
| 11 | `wired` | Wired | rss | tech | yes | 131 | https://www.wired.com/feed/rss |
| 12 | `ars-technica-tech` | Ars Technica - Tech | rss | tech | yes | 140 | https://feeds.arstechnica.com/arstechnica/technology-lab |
| 13 | `engadget` | Engadget | rss | tech | yes | 149 | https://www.engadget.com/rss.xml |
| 14 | `ap-news` | AP News | rss | general | yes | 159 | https://feedx.net/rss/ap.xml |
| 15 | `fox-news` | Fox News | rss | general | yes | 168 | https://feeds.foxnews.com/foxnews/latest |
| 16 | `npr-health` | NPR Health | rss | health | yes | 178 | https://feeds.npr.org/103537970/rss.xml |
| 17 | `bbc-health` | BBC Health | rss | health | yes | 187 | https://feeds.bbci.co.uk/news/health/rss.xml |
| 18 | `cbs-sports` | CBS Sports | rss | sports | yes | 197 | https://www.cbssports.com/rss/headlines/ |
| 19 | `atlas-obscura` | Atlas Obscura | rss | offbeat | yes | 207 | https://www.atlasobscura.com/feeds/latest |
| 20 | `mental-floss` | Mental Floss | rss | offbeat | yes | 216 | https://www.mentalfloss.com/feed |
| 21 | `upi-odd` | UPI Odd News | rss | offbeat | yes | 225 | https://rss.upi.com/news/odd_news.rss |
| 22 | `av-club` | A.V. Club | rss | entertainment | yes | 235 | https://www.avclub.com/rss |
| 23 | `polygon` | Polygon | rss | entertainment | yes | 244 | https://www.polygon.com/rss/index.xml |
| 24 | `variety` | Variety | rss | entertainment | yes | 253 | https://variety.com/feed/ |
| 25 | `kotaku` | Kotaku | rss | entertainment | yes | 262 | https://kotaku.com/rss |
| 26 | `geekwire` | GeekWire | rss | local | yes | 272 | https://www.geekwire.com/feed/ |
| 27 | `seattle-eater` | Seattle Eater | rss | local | yes | 281 | https://seattle.eater.com/rss/index.xml |
| 28 | `mynorthwest` | MyNorthwest | rss | local | yes | 290 | https://mynorthwest.com/feed/ |
| 29 | `crosscut` | Crosscut | rss | local | yes | 299 | https://crosscut.com/feed |
| 30 | `smithsonian` | Smithsonian Magazine | rss | science | no | 308 | https://www.smithsonianmag.com/rss/latest_articles/ |
| 31 | `google-news-science` | Google News - Science | rss | science | no | 318 | news.google.com topic feed |
| 32 | `google-news-tech` | Google News - Technology | rss | tech | no | 327 | news.google.com topic feed |
| 33 | `google-news-entertainment` | Google News - Entertainment | rss | entertainment | no | 336 | news.google.com topic feed |
| 34 | `google-news-health` | Google News - Health | rss | health | no | 345 | news.google.com topic feed |
| 35 | `google-news-sports` | Google News - Sports | rss | sports | no | 354 | news.google.com topic feed |
| 36 | `world-news-api` | WorldNewsAPI | news_api | all | no | 364 | https://api.worldnewsapi.com/search-news |
| 37 | `fmp-general-news` | FMP - Financial News | financial_api | finance | yes | 375 | https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=20 |
| 38 | `conde-nast-traveler` | Condé Nast Traveler | rss | travel | yes | 386 | https://www.cntraveler.com/feed/rss |
| 39 | `guardian-travel` | The Guardian Travel | rss | travel | yes | 395 | https://www.theguardian.com/uk/travel/rss |
| 40 | `matador-network` | Matador Network | rss | travel | yes | 404 | https://matadornetwork.com/feed/ |
| 41 | `frommers` | Frommer's | rss | travel | yes | 413 | https://www.frommers.com/feed |
| 42 | `bbc-india` | BBC News India | rss | india | yes | 423 | https://feeds.bbci.co.uk/news/world/asia/india/rss.xml |
| 43 | `ndtv` | NDTV | rss | india | yes | 432 | https://feeds.feedburner.com/ndtvnews-top-stories |
| 44 | `times-of-india` | Times of India | rss | india | yes | 441 | https://timesofindia.indiatimes.com/rssfeedstopstories.cms |
| 45 | `india-today` | India Today | rss | india | yes | 450 | https://www.indiatoday.in/rss/home |
| 46 | `scroll-in` | Scroll.in | rss | india | yes | 459 | http://feeds.feedburner.com/ScrollinArticles.rss (plain http) |
| 47 | `the-hindu` | The Hindu | rss | india | yes | 468 | https://www.thehindu.com/feeder/default.rss |
| 48 | `fmp-articles` | FMP - Market Analysis | financial_api | finance | yes | 477 | https://financialmodelingprep.com/stable/fmp-articles?page=0&limit=20 |

`api_key_env` is set on `world-news-api` (`WORLD_NEWS_API_KEY`) and both FMP sources (`FMP_API_KEY`). `world-news-api` has category `all`; if enabled, its items would appear only in the All tab. `news_api` has no fetcher (`service.py:58-61` returns `[]`).


## 6. What the clients consume

### 6.1 Per client

| | iOS 2.0 (build 2) | Android 1.0.0 | Web |
|:-|:-|:-|:-|
| Base URL | `https://getclearnews.com`, API `https://getclearnews.com/api/v1` (`Constants.swift:8-9`) | `https://getclearnews.com` (`ApiClient.kt:20`) | `process.env.NEXT_PUBLIC_API_URL`, else `http://localhost:8000/api/v1` (`api.ts:9`); production build arg `https://getclearnews.com/api/v1` (`docker-compose.prod.yml:35`) |
| Articles params | `page`, `per_page=20`, `category` if not `all`, `search` if not empty (sent untrimmed), `refresh=true` on pull to refresh (`ArticleService.swift:103-118`) | `category` if not `all`, `search` if not blank, `page`, `per_page=20`, `refresh=true` on refresh (`ApiClient.kt:36-42`) | `category` if not `all`, `search` if truthy, `page`, `per_page=20`, `refresh=true` on refresh, page 1 only (`api.ts:46-59`, `useArticles.ts:52`, `:61-67`) |
| Reader | `/articles/reader?url=` via `URLQueryItem` (`ReaderView.swift:176-179`) | `addQueryParameter("url", ...)` (`ApiClient.kt:54-60`) | `?url=` + `encodeURIComponent` (`api.ts:63-65`) |
| Categories | on app start (`ClearNewsApp.swift:25`, `CategoryService.swift:9-18`); failure leaves no tabs | `ClearNewsViewModel.kt:77` | each mount of `CategoryTabs` (`CategoryTabs.tsx:20-24`) |
| Timeouts | request 30 s, resource 60 s (`APIClient.swift:36-39`) | connect 15 s, read 30 s (`ApiClient.kt:22-25`) | 15 s abort (`api.ts:13`) |
| User-Agent | URLSession default (CFNetwork, seen in nginx logs per droplet facts) | OkHttp default `okhttp/4.12.0` (version from `libs.versions.toml:11`; inference that the default UA is unchanged) | browser |
| HTTP cache | `URLSessionConfiguration.default`, which uses the shared URLCache and honors Cache-Control (inference from platform defaults) | no OkHttp cache configured | browser HTTP cache, `fetch` default mode |
| Search debounce | 400 ms (`HomeView.swift:33-39`) | 400 ms (`ClearNewsViewModel.kt:20`) | 400 ms (`SearchBar.tsx:15`) |
| `hasMore` | `pagination.page < pagination.totalPages` (`ArticleService.swift:37`) | same (`ClearNewsViewModel.kt` in `fetchArticles`) | `page < total_pages` (`useArticles.ts:77`) |
| Error message | decodes `{"detail": String}` on non-2xx, else `Server error (<code>)` (`APIClient.swift:132-136`) | same, `detail` optional (`ApiClient.kt:78-85`, `:90-91`) | `body.detail` or `API error: <code>`; a 422 array becomes `[object Object]` (`api.ts:20-23`) |

### 6.2 Fields that must stay

Decoders: iOS uses `JSONDecoder` with `keyDecodingStrategy = .convertFromSnakeCase` (`APIClient.swift:41-42`), so keys must stay snake case on the wire. Swift synthesized decoding ignores unknown keys, fails the whole response when a non-optional key is missing or null, and also fails on a type mismatch even for optional fields (for example a string where `word_count: Int?` is expected). Android uses kotlinx.serialization `Json { ignoreUnknownKeys = true }` (`ApiClient.kt:27`), non-lenient: a missing or null non-nullable field, or a wrong type, throws. Web TypeScript types are not checked at runtime.

| Response | Field | Wire type today | iOS | Android | Web | Must |
|:-|:-|:-|:-|:-|:-|:-|
| list | `articles` | array | required (`Article.swift:19`) | required (`Article.kt:30`) | used | present |
| list | `pagination` | object | required | required | used | present |
| list | `complete` | bool | `Bool?` (`Article.swift:21`) | `Boolean? = null` (`Article.kt:32`) | `complete?` | keep; `false` triggers the retry |
| pagination | `page` | int | required `Int` | required `Int` | not read | int |
| pagination | `per_page` | int | required `Int` | required `Int` | not read | int |
| pagination | `total` | int | required `Int` | required `Int` | not read | int |
| pagination | `total_pages` | int | required `Int` | required `Int` | used | int, at least 1 |
| article | `title` | string | required | required | used | non-null string |
| article | `summary` | string, `""` or null | `String?` | `String? = null` | rendered | nullable |
| article | `url` | string | required; also the SwiftUI identity (`Article.swift:15`) | required | used | non-null, should be unique in a page |
| article | `image_url` | string or null | `String?` | `String? = null` | nullable | nullable |
| article | `source_id` | string | required | required | not read | non-null string |
| article | `source_name` | string | required | required | used | non-null string |
| article | `source_type` | string | required, value unused | required, value unused | not read | non-null string (any value) |
| article | `category` | string | required | required | not read | non-null string |
| article | `sentiment` | null | `Double?` | `Double? = null` | not read | null or number, never a string |
| article | `published_at` | ISO string or null | `Date?` with strict parsing (6.3) | `String? = null` | `new Date(...)` | null, or ISO 8601 with zone |
| categories | (top level) | array | `[Category]` | `List<Category>` | `Category[]` | bare array, `all` first |
| category | `id` | string | required | required | used | non-null |
| category | `name` | string | required | required | used | non-null |
| category | `source_count` | int | required `Int` | required `Int` | not read | int |
| reader | `status` | `ok` or `failed` | required | required | used | non-null |
| reader | `url` | string | required | required | not read | non-null |
| reader | `title`, `author`, `content_html`, `image_url`, `source_name`, `reason` | string or null | `String?` | `String? = null` | used | nullable strings |
| reader | `word_count` | int or null | `Int?` | `Int? = null` | used | int or null |
| reader | `published_at` | ISO string or null | `Date?` strict | `String?` | used | null or ISO 8601 with zone |
| reader | `extracted_at` | ISO string with microseconds, or null | `String?` | `String?` | not read | string or null |
| error | `detail` | string (400, 404, 405) | read for the message | read | read | keep a string for 400 |

Category order: all three clients render the array as returned and none adds its own "All" (`CategoryTabsView.swift:12`, `CategoryTabs.kt:34`, `CategoryTabs.tsx:26-27`). The default selection is the string `all` in every client (`ArticleService.swift:11`, `ClearNewsViewModel.kt:46`, `page.tsx:20`), so the `all` entry must keep id `all`.

### 6.3 Date format

- iOS (`APIClient.swift:43-76`): tries `ISO8601DateFormatter` with `[.withInternetDateTime, .withFractionalSeconds]`, then `[.withInternetDateTime]`. Accepts `2026-11-01T15:21:11Z`, `...11.000Z` and `+05:30` offsets. Rejects a value with no zone, which fails the whole response (applies to `Article.published_at` and `ReaderContent.published_at`).
- Android (`RelativeTime.kt:12-18`): `Instant.parse`; on failure the time label is empty, no crash.
- Web (`utils.ts:7-9`): `new Date(iso)`; invalid gives an empty label. `ArticleCard.tsx:55` skips null.
- Live and code today: always `YYYY-MM-DDTHH:MM:SSZ`, second precision, for article dates from `published_parsed` (`rss_fetcher.py:139`) and FMP (`fmp_fetcher.py:36`). JavaScript `toISOString()` adds `.000`, which all clients accept, but the contract diff will flag it unless trimmed.

### 6.4 `complete` and auto-retry

All three clients do the same: if the page 1 response has `complete == false` and the request was not a refresh, wait 3 s and fetch page 1 again with the same parameters, once, silently ignoring errors (`ArticleService.swift:42-56`; `ClearNewsViewModel.kt:131-148`; `useArticles.ts:82-98`). After `refresh=true` they never retry.

### 6.5 Links and sharing

- `/privacy` and `/support`: iOS `AboutView.swift:38`, `:47`; Android `AboutScreen.kt:100`, `:109`. Both open `https://getclearnews.com/privacy` and `/support` (no trailing slash, no `.html`).
- Android share text (`ShareUtils.kt:8-24`): `<title>\n<source_name> · <relative time>\n\nhttps://getclearnews.com/article?url=<URLEncoder.encode(url, "UTF-8")>`. Form encoding: spaces become `+`, `:`, `/`, `?`, `&`, `=` are percent-encoded. These links are in people's message histories and must keep working.
- iOS shares the raw article URL (`ArticleCardView.swift:65-66`, `ReaderView.swift:49-50`), not a getclearnews link.
- Web `/article` reads `url`, and optionally `title`, `source_name`, `image_url`, `published_at` for instant display (`article/page.tsx:24-28`). Android sends only `url`. Nothing in the web app links to `/article`.

### 6.6 Query encoding quirk

Tested with Swift on this Mac: `URLQueryItem` values are encoded with `&` as `%26` and `=` as `%3D`, but `+` is left as is. Starlette decodes `+` as a space, so an iOS search for `C++` arrives as `c  ` and an article URL containing `+` reaches the reader altered. Standard form decoding (`URLSearchParams`) behaves the same way, so a port reproduces it by default. Older iOS versions may encode differently (inference).


## 7. Web app

### 7.1 Routes (`web/src/app/`)

| Route | File | Kind | Data | Notes |
|:-|:-|:-|:-|:-|
| `/` | `page.tsx` | client component (`'use client'`, `:1`), prerendered static | browser fetches only (1.6) | Reader opens as a modal over the feed (`ReaderModal.tsx`), with `history.pushState` for the back button |
| `/article` | `article/page.tsx`, `article/layout.tsx` | client component; `useSearchParams` inside `Suspense` (`:199-208`); layout sets `robots: noindex, nofollow` (`layout.tsx:10-15`, live) | reader fetch from the browser | Back button: `router.back()` if `document.referrer` is non-empty, else `router.push('/')` (`:33`, `:79`) |
| `/about` | `about/page.tsx` | server component, static `metadata` | none | Title `About \| ClearNews` (live) |
| `/robots.txt` | `robots.ts` | metadata route | none | `User-Agent: *`, `Allow: /`, sitemap line (live) |
| `/sitemap.xml` | `sitemap.ts` | metadata route | none | `https://getclearnews.com` (daily, 1) and `/about` (monthly, 0.5) (live) |
| error boundary | `error.tsx` | client | none | "Something went wrong" with a retry button |
| 404 | none (Next default) | | | Live 404 page is 20,876 bytes |
| `/favicon.ico` | `favicon.ico` | static | | |
| public files | `public/social-card.png` (1200×630, 233,660 bytes, the OG image), `public/social-card.html` (the card's source, also publicly served), `public/.gitkeep` | | | |

Not present: `generateMetadata`, `generateStaticParams`, dynamic segments, route handlers (`route.ts`), `middleware.ts`, server actions, `next/image` (cards use plain `<img>`, `ArticleCard.tsx:27`), `headers()`, `cookies()`.

### 7.2 Root layout (`layout.tsx`)

- Fonts: `next/font/google` Geist and Geist Mono, Latin subset (`:8-16`). Downloaded at build time and served from `/_next/static/media/` (live preload links), so the build needs network access to Google Fonts.
- Metadata (`:22-69`): title default and template `%s | ClearNews`, description (mentions "41 sources across 13 categories", `:20`), `metadataBase`, `alternates.canonical: https://getclearnews.com` (inherited by every page: live `/about` and `/article` both have canonical `https://getclearnews.com`), authors, keywords, robots, OpenGraph with the social card, Twitter card.
- `/about` sets its own `openGraph` with only title and description (`about/page.tsx:8-12`), which replaces the layout's object: live `/about` has no `og:image`, `og:url`, `og:type` or `og:site_name` (O25).
- JSON-LD (`:71-147`): inline `<script type="application/ld+json">` with SoftwareApplication, Person and WebSite nodes.
- Theme script (`:160-169`): inline script reading `localStorage.theme` before hydration. Needs `'unsafe-inline'` in `script-src` (so do Next's inline `self.__next_f.push` scripts).
- Google Analytics (`:183-192`): `next/script` loading `https://www.googletagmanager.com/gtag/js?id=G-RSZEJKJGRX` plus an inline init, `afterInteractive`. The live CSP `script-src` does not allow googletagmanager.com, so it is blocked today (the live HTML still preloads it). To be removed (decision 1).
- Footer (`:198-222`): `/about` link, "Built by Nikhil Singhal" link, `© {new Date().getFullYear()} OmSpark LLC`. The year is fixed at build time because the page is prerendered (live shows 2026; the export build in scratch also shows 2026).

### 7.3 `next.config.ts` and environment

```ts
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  output: 'standalone',
};
```

No `headers()`, `redirects()`, `rewrites()`, `basePath`, `trailingSlash` or `i18n`. The only env var is `NEXT_PUBLIC_API_URL` (`api.ts:9`, `web/.env.example`), inlined into the client bundle at build time (`Dockerfile.frontend:14-15`). `@tailwindcss/typography` and `dompurify` are the only runtime dependencies besides Next and React (`package.json:11-17`).

### 7.4 Static export test

Done on a `git archive` copy of `web/` in the scratch directory, with `NEXT_PUBLIC_API_URL=/api/v1`:

1. `output: 'export'` alone: build fails with `export const dynamic = "force-static"/export const revalidate not configured on route "/robots.txt" with "output: export"`.
2. Adding `export const dynamic = 'force-static';` as the first line of `robots.ts` and `sitemap.ts`: build succeeds. All six routes report `○ (Static)`. Output `out/` is 1.7 MB: `index.html`, `about.html`, `article.html`, `404.html`, `_not-found.html`, `robots.txt`, `sitemap.xml`, `favicon.ico`, `social-card.png`, `social-card.html`, `_next/`, and RSC `.txt` payload files.
3. The bundle contains ``fetch(`/api/v1${e}`)``, so a relative API base works on the same origin.
4. `article.html` carries `noindex, nofollow`; `index.html` still includes the GA script until it is removed.

Conclusion: a static export is possible with the two one-line changes, the config change and a build-time `NEXT_PUBLIC_API_URL`. Things the host must then provide: serving `about.html` at `/about` and `article.html` at `/article` (files are not in folders because `trailingSlash` is off), the 404 page, the `/about/` to `/about` style trailing slash redirect if it should be kept (Next does it today, see 8.2), all security headers (Next sets none), and Cache-Control for HTML (today `s-maxage=31536000` from Next). `/article?url=` works as a static page because all reading of the query happens in the browser.


## 8. Edge behavior to reproduce

### 8.1 Repo nginx file (`deployment/nginx/clearnews.conf`)

| Item | Repo value | Ref |
|:-|:-|:-|
| Rate limit | zone `api_limit`, 10 r/s per IP; `/api/` burst 20 nodelay; `/health` burst 5 nodelay (live lacks the `/health` limit) | `:3`, `:54`, `:71` |
| Port 80 | `getclearnews.com` and `www`: 301 to `https://getclearnews.com$request_uri` | `:6-10` |
| www on 443 | 301 to `https://getclearnews.com$request_uri` | `:13-21` |
| TLS | Let's Encrypt cert; TLS 1.2 and 1.3; Mozilla intermediate ciphers (live: `HIGH:!aNULL:!MD5`) | `:32-38` |
| `server_tokens off`, `client_max_body_size 1m` | (live lacks both) | `:28-29` |
| Headers, all with `always` | `X-Frame-Options: SAMEORIGIN`; `X-Content-Type-Options: nosniff`; `X-XSS-Protection: 0` (live `1; mode=block`); `Strict-Transport-Security: max-age=31536000; includeSubDomains`; `Referrer-Policy: strict-origin-when-cross-origin` (live lacks); `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` (live lacks); CSP below | `:41-47` |
| CSP (repo) | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self';` | `:47` |
| `proxy_hide_header X-Powered-By` | (live lacks; live sends `X-Powered-By: Next.js`) | `:50` |
| `location /api/` | prefix; proxy to 127.0.0.1:8000; read timeout 120 s | `:53-67` |
| `location /health` | prefix match, so `/health/`, `/healthz` also reach FastAPI | `:70-76` |
| `location = /privacy`, `= /support` | exact; files from `/opt/app/deployment/static/`; `default_type text/html` | `:79-86` |
| `location /` | everything else to Next.js on 127.0.0.1:3000, with WebSocket upgrade headers | `:89-99` |

Live CSP (all responses from the main server): `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self';`

### 8.2 Live responses (2026-11-01, 15:29:02 to 15:30:48 UTC)

Every response from the main HTTPS server carried `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, the live CSP, and `Server: nginx/1.24.0 (Ubuntu)`. The port 80 and www redirects carried only `Server` (no HSTS or other security headers). No response had `Referrer-Policy` or `Permissions-Policy`.

| Request | Status | Other headers and body |
|:-|:-|:-|
| `GET /` | 200 | `text/html; charset=utf-8`, 26,288 B; `Cache-Control: s-maxage=31536000`; ETag; `x-nextjs-cache: HIT`; `x-nextjs-prerender: 1` (twice); `x-nextjs-stale-time: 300`; `X-Powered-By: Next.js`; `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding`. gzip when asked. |
| `HEAD /` | 200 | same headers, no body |
| `GET /article?url=https://example.com` | 200 | 20,434 B, same header set; `<meta name="robots" content="noindex, nofollow">`; title is the site default |
| `GET /about` | 200 | 24,377 B, same header set |
| `GET /privacy` | 200 | `text/html` (no charset; the file declares UTF-8), 3,565 B, `Last-Modified: Fri, 13 Feb 2026 20:35:00 GMT`, ETag, `Accept-Ranges: bytes`, no Cache-Control. Body identical to `deployment/static/privacy.html`. |
| `GET /support` | 200 | same pattern, 2,914 B, identical to the repo file |
| `GET /privacy.html` | 404 | Next.js 404 page, 20,876 B, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` |
| `GET /privacy/` | 308 | `location: /privacy` (relative), `Refresh: 0;url=/privacy` (Next.js) |
| `GET /about/` | 308 | `location: /about`, `Refresh: 0;url=/about` |
| `GET /no-such-page` | 404 | same as `/privacy.html` |
| `GET /robots.txt` | 200 | `text/plain`, `cache-control: public, max-age=0, must-revalidate` |
| `GET /sitemap.xml` | 200 | `application/xml`, same cache-control |
| `HEAD /social-card.png` | 200 | `image/png`, 233,660 B, `Cache-Control: public, max-age=0`, `Last-Modified: Wed, 10 Jun 2026 00:12:54 GMT`, weak ETag |
| `HEAD /favicon.ico` | 200 | `image/x-icon`, `public, max-age=0, must-revalidate` |
| `HEAD /_next/static/chunks/<hash>.css` | 200 | `Cache-Control: public, max-age=31536000, immutable` |
| `GET /health` | 200 | `{"status":"ok"}`, `application/json`, 15 B, no Cache-Control |
| `HEAD /health` | 405 | `allow: GET`, 31 B JSON |
| `GET /health/` | 307 | `location: http://getclearnews.com/health` |
| `GET /api` | 301 | `Location: https://getclearnews.com/api/` (nginx directory redirect) |
| `GET /api/v1/categories` | 200 | 659 B, `cache-control: public, max-age=300` |
| `HEAD /api/v1/categories` | 405 | `allow: GET`, `cache-control: public, max-age=300` |
| `GET /api/v1/categories/` | 307 | `location: http://getclearnews.com/api/v1/categories`, empty body |
| `GET /api/v1/sources` | 200 | 5,888 B, 48 entries, `public, max-age=300` |
| `GET /api/v1/articles?per_page=1` | 200 | 758 B, total 1,091, `complete: true`, `public, max-age=300` |
| `GET /api/v1/articles?refresh=true&per_page=1` | 200 | `cache-control: no-store`, `complete: false`, same first item |
| `GET /api/v1/articles?per_page=0` | 422 | body in 1.4, `cache-control: public, max-age=300` |
| `GET /api/v1/nope` | 404 | `{"detail":"Not Found"}`, no Cache-Control |
| `GET /api/v1/articles/reader?url=https://example.com/` | 200 | `{"status":"failed","url":"https://example.com/","title":null,"author":null,"content_html":null,"word_count":null,"image_url":null,"source_name":null,"published_at":null,"extracted_at":null,"reason":"extraction_empty"}`, 2.17 s, no Cache-Control |
| `GET http://getclearnews.com/about?x=1` | 301 | `Location: https://getclearnews.com/about?x=1`, nginx HTML body 178 B |
| `GET https://www.getclearnews.com/about?x=1` | 301 | `Location: https://getclearnews.com/about?x=1` |
| `GET http://www.getclearnews.com/` | 301 | `Location: https://getclearnews.com/` (one hop) |

Other 422, 400 and empty-result responses are in 1.3 and 1.4.

### 8.3 DNS (looked up 2026-11-01 15:28:51 UTC)

| Record | Value |
|:-|:-|
| NS | `walt.ns.cloudflare.com`, `dorthy.ns.cloudflare.com` |
| A `getclearnews.com` | 64.227.96.170 |
| A `www.getclearnews.com` | 64.227.96.170 |
| AAAA | none |
| MX | `0 getclearnews-com.mail.protection.outlook.com` |
| TXT | `v=spf1 include:spf.protection.outlook.com -all`; a `google-site-verification` record |
| CAA | none |

The privacy and support pages publish `support@getclearnews.com` (`privacy.html:72`, `support.html:66`), so the MX record must be kept.


## 9. Droplet and traffic (read over SSH by the main session)

These facts were read by the main session over SSH on 2026-11-01, about 15:20 to 15:35 UTC, read only. I did not verify them myself.

### 9.1 Host

- Droplet 64.227.96.170. Repo at `/opt/app` on commit `8d51f0a`, the same as GitHub `main`. Containers `clearnews-backend` and `clearnews-frontend` "Up 4 months (healthy)".
- Memory 961 MB total, about 255 MB available. Disk 24 GB, 33% used.
- `/opt/app/deployment/.env.production` holds one variable name, `FMP_API_KEY` (value not read).
- nginx writes one access log, `/var/log/nginx/access.log`, 14 days retained.

### 9.2 Live nginx versus the repo file

The live file is the pre v2.0.0 version; the March hardening (`CHANGELOG.md:38`) never reached the server.

| | Live | Repo |
|:-|:-|:-|
| `server_tokens off` | absent | present |
| `client_max_body_size 1m` | absent | present |
| `Referrer-Policy` | absent | present |
| `Permissions-Policy` | absent | present |
| `proxy_hide_header X-Powered-By` | absent | present |
| Rate limit on `/health` | absent | present |
| `X-XSS-Protection` | `1; mode=block` | `0` |
| `ssl_ciphers` | `HIGH:!aNULL:!MD5` | Mozilla intermediate list |
| CSP `script-src` | includes `'unsafe-eval'` | without it |
| `auth_limit` zone (5 r/m) and `location /api/v1/auth/` | present (auth was removed in v2.0.0) | absent |
| Port 80 to HTTPS 301, www to apex 301, HSTS | same | same |

The live response headers in 8.2 agree with the live column.

### 9.3 Traffic, 14 days (Oct 18 to Nov 1), nginx access log

- About 101,000 lines, 99,337 parsed. Mostly bots and scanners: 55,421 4xx, 39,141 3xx, 4,713 2xx, 62 5xx.
- `GET /`: 1,942 answered 200 from 1,079 distinct IPs, but only 29 distinct IPs ever called `/api/v1/articles` (81 calls: 77 answered 200, 4 answered 499). The home page loads articles from the browser, so most visitors are bots that do not run JavaScript. Some Nov 1 calls are this session's own checks.
- iOS app (CFNetwork user agent): 4 articles calls, 3 categories calls, 1 reader call (200). Android (okhttp): 3 requests.
- `refresh=true`: 0 calls. Reader: 1 call in 14 days.
- `GET /` returned 500 29 times (cause not checked).
- Scanner paths seen: `/api/.env`, `/api/.git/config`, `/api/v1/validate/code`, `/api/auth`, `/api/mcp`, path traversal under `/api/uploads`.

### 9.4 Feed health, last 24 hours, backend container log

- Good News Network: HTTP 403 on every fetch (83 of 83). Feel Good runs one source short.
- FMP Financial News: HTTP 402 on every fetch (subscription lapsed). FMP Market Analysis answers 304 and its TTL keeps extending: the same 19 articles from Oct 22.
- Occasional: timeouts on Seattle Eater (2) and The Verge (1); 429 from Frommer's (1); 403 from Variety (1).
- Many feeds answer 304 most of the time (conditional GET), so "fetched" log lines are rare for them; that is expected.


## 10. Environment variables and config

Names only. No `.env` file was opened.

| Name | Where | Used by | Effect |
|:-|:-|:-|:-|
| `CORS_ORIGINS` | `docker-compose.prod.yml:10` (`https://getclearnews.com`); default `http://localhost:3000` | `main.py:67`, `:80` | Allowed origins, comma separated; a value starting with `https://` also turns off `/docs`, `/redoc`, `/openapi.json` |
| `TZ` | `docker-compose.prod.yml:9` (`America/Los_Angeles`) | process | Log timestamps only; API dates are UTC |
| `FMP_API_KEY` | `config.py:22`; `.env.production` on the droplet; `backend/.env.example` | `fmp_fetcher.py:107-108` | FMP key; goes away with FMP |
| `WORLD_NEWS_API_KEY` | `config.py:20`; `backend/.env.example`; `deployment/.env.production.example` (commented) | nothing (no news_api fetcher) | none |
| `ALPHA_VANTAGE_API_KEY` | `config.py:21`; `deployment/.env.production.example` (commented) | nothing | none |
| `CACHE_TTL_MINUTES` | `config.py:17`; `backend/.env.example` | nothing | none; per source TTL from `sources.yaml` is used |
| `NEXT_PUBLIC_API_URL` | `web/.env.example`; build arg `docker-compose.prod.yml:35`; `Dockerfile.frontend:14-15` | `web/src/lib/api.ts:9` | Baked into the client bundle at build time |
| `HOSTNAME`, `PORT` | `Dockerfile.frontend:47-48` (`0.0.0.0`, `3000`) | Next standalone server | Container binding only |

Pydantic settings also read `.env` from the working directory (`config.py:24`). Container limits: backend 512 MB and 0.75 CPU, frontend 256 MB and 0.50 CPU (`docker-compose.prod.yml:18-22`, `:42-46`). Backend runs `uvicorn app.main:app` on port 8000 with one worker and no proxy header flags (`Dockerfile.backend:39`).


## 11. Stale docs found

| Item | Where |
|:-|:-|
| F-Droid MR #34426 described as submitted, pending or awaiting review. Per the task brief it was closed on 2026-05-08 (not re-checked here). | `CHANGELOG.md:9`; `CURRENT_STATE.md:11`, `:81`; `NOW.md:42` |
| No changelog entry for commit `8d51f0a` (2026-06-09: metadata, JSON-LD, GA4, footer, `/about`, OG card). Latest entry is 2.1.0 of 2026-03-07. | `CHANGELOG.md:3` |
| `CURRENT_STATE.md` last updated 2026-04-24; it also misses the June SEO work. | `CURRENT_STATE.md:3` |
| `NOW.md` last updated 2026-03-07. | `NOW.md:3` |
| `CLAUDE.md` last updated 2026-02-10; rule 8 (no cron, only the in-process loop) will be dropped by decision 2; deployment row says DigitalOcean. | `CLAUDE.md:4`, `:42`, `:109` |
| Web README pages table lists only `/` and `/article` (no `/about`, robots, sitemap). | `web/README.md:18-21` |
| Docstring says the stale window is 4x TTL; the code uses 96x. | `cache.py:15-16` versus `:73` |
| Comment says `sources.yaml` lives "alongside schema.sql"; `schema.sql` was removed in 2.0.0. | `registry.py:18`; `CHANGELOG.md:29` |
| `rapidfuzz` listed as the dedup library; it is never imported. | `backend/README.md:127`; `requirements.txt:16` |
| FMP described as working; `CURRENT_STATE.md:9` says the subscription is no longer active, and the droplet logs show 402. | `backend/README.md:113`; `PROJECT.md:127`, `:165`, `:419` |
| The 2.0.0 nginx hardening is described as done; it never reached the server (9.2). | `CHANGELOG.md:38` |
| Schema comment lists four reader reasons; the code also has `invalid_url` (never sent). | `schemas.py:66-67`; `reader.py:195` |
| "41 sources across 13 categories" in page copy will change with the FMP drop. | `layout.tsx:20`; `about/page.tsx:7`, `:11`, `:34`; `public/social-card.html:97`; `README.md:3`, `:13` |
| Privacy page says no analytics; the web layout ships GA (blocked by CSP, being removed). The page describes iOS storage only. | `privacy.html:42`, `:50-51`; `layout.tsx:183-192` |


## 12. Observations

Severity is about impact today. "Port" says what the move should do: fix, keep (reproduce as is), or decide (owner choice).

| # | Observation | Severity | Port |
|:-|:-|:-|:-|
| O1 | Sort key `published_at or ""` mixes datetime and str; one undated item, or a zone-less date next to zone-aware ones, raises `TypeError` and the whole `/api/v1/articles` request returns 500 (`service.py:215-217`, `:231`; reproduced). | High, latent | Fix: sort nulls last, normalize all dates to UTC. |
| O2 | A failed fetch returns `[]`, which is cached over the source's last good articles for 15 minutes (`rss_fetcher.py:416-424`; `service.py:293`, `:596`). A source that fails once in a while blinks out. | Medium | Decide: keep last good articles on error (likely), or reproduce. |
| O3 | A 304 extends the TTL with no age limit (`cache.py:161-169`). Correct when a server answers 304 accurately, but FMP Market Analysis has served Oct 22 items for 10 days. | Medium (FMP only today) | FMP is dropped. Consider an age limit on items or a periodic unconditional fetch. |
| O4 | Validators are stored per feed URL apart from the articles (`rss_fetcher.py:43`, `:389-414`); a 304 for a source with no cached entry leaves it empty (`cache.py:167-169`). Harmless in one process; on Workers, if validators and articles live in different stores or expire differently, sources go empty. | Medium for the port | Fix: store validators with the articles, or send conditional headers only when articles exist. |
| O5 | Partial results (`complete:false`) are sent with `public, max-age=300` (`main.py:131-135`), and the 3 s retry repeats the same URL (`ArticleService.swift:47-50`, `useArticles.ts:85-90`). iOS URLCache or the browser cache can return the same partial page (inference). | Low to medium | Fix: `no-store` (or a short max-age) when `complete` is false. |
| O6 | Cache-Control `public, max-age=300` is also set on 422 and 405 responses for the three list paths (`main.py:129-135`; live). | Low | Decide. |
| O7 | `refresh` accepts any Pydantic boolean, but `no-store` is set only for the exact string `true` (`router.py:51`, `main.py:132`; tested `1`, `TRUE`). | Low | Keep `true` semantics; clients only send `true`. |
| O8 | Reader SSRF: redirects followed without re-checking the target (`main.py:48`, `reader.py:211`); DNS checked once, then httpx resolves again (`reader.py:48`); `100.64.0.0/10` allowed (tested); no response size limit (`reader.py:213`). | Medium | Fix: follow redirects manually and check each hop, cap body size. Whether Workers `fetch` can reach private ranges at all is for the Cloudflare research. |
| O9 | og:image backfill downloads whole pages despite the 15 KB comment (`rss_fetcher.py:219-221`), runs all imageless items of a feed at once (`:251-252`), repeats on every 2xx feed fetch with no memory, and has no SSRF check. | Medium for the port (subrequest counts) | Fix: remember results per article URL, limit concurrency, read only the head. |
| O10 | Reader cache entries are never removed; the dict grows with every distinct URL (`reader.py:198`, `:276`; `cache.py:172-178`). | Low (1 reader call in 14 days) | Moot with a TTL store. |
| O11 | Failed reader results, including timeouts, are cached for 60 minutes (`reader.py:216-230`). A transient failure sticks for an hour. | Low | Decide. |
| O12 | Reason `invalid_url` is unreachable because the router validates first (`router.py:30-32`; `reader.py:192-195`). | Info | Keep 400 behavior. |
| O13 | Reader metadata comes only from fresh article entries (`reader.py:125`), so `image_url`, `source_name`, `published_at` are often null; clients fall back to their own article data (`ReaderView.swift:77`, `:93`; `ReaderModal.tsx:117-119`). | Low | Keep or improve; no client depends on these being set. |
| O14 | Dedup and sort tie-breaks depend on input order; MISS results arrive in set order, which is not deterministic (`service.py:388`). | Low | Fix: always assemble in `sources.yaml` order so the contract diff is stable. |
| O15 | Dedup tokenizer is ASCII only and handles only the straight apostrophe (`service.py:95-96`). | Low | Decide: changing it changes which stories collapse. |
| O16 | The non-Latin filter and sort mode follow `category` even when `source` is given, so `?source=ndtv` drops Hindi titles (`service.py:519-520`, `:527`). | Low (no client sends `source`) | Keep. |
| O17 | `strip_html` joins text chunks with spaces, producing double spaces and a space before punctuation (`rss_fetcher.py:59`; tested). Summaries can be `""`. | Low, cosmetic | Decide: exact parity makes the diff easy; fixing changes text. |
| O18 | httpx `timeout=` is per phase, not a total, and the request path has no overall limit apart from the 3 s MISS deadline (`rss_fetcher.py:396`). | Low | Use total timeouts with `AbortSignal`. |
| O19 | Trailing slash API paths redirect 307 to `http://` (live), giving two hops. | Low | Decide: redirect to https, or 404. |
| O20 | HEAD on any API path returns 405 (live). Uptime checkers using HEAD would see failures. | Low | Decide. |
| O21 | Unused config: `CACHE_TTL_MINUTES`, `ALPHA_VANTAGE_API_KEY`, `WORLD_NEWS_API_KEY` (`config.py:17-21`); `rapidfuzz` (`requirements.txt:16`). | Info | Do not port. |
| O22 | MISS fetches do not set the refreshing flag (`service.py:376-378`), so concurrent cold requests fetch the same feeds twice. | Low | Moot if requests only read the store and the cron fetches. |
| O23 | Dropping FMP leaves Finance with no enabled sources; `/categories` then hides Finance (`registry.py:102-104`) and the tab disappears in all clients. | Medium for the move | Add the Finance RSS sources in the same change. |
| O24 | "financial news APIs" wording in the shipped iOS and Android About screens, store metadata and the privacy and support pages (2.10). | Info | Copy change for the static pages; app text waits for the next app release. |
| O25 | `/about` loses `og:image`, `og:url`, `og:type`, `og:site_name` because its `openGraph` replaces the layout's (`about/page.tsx:8-12`; live). Every page's canonical is the homepage (`layout.tsx:29-31`; live). | Low (SEO) | Decide. |
| O26 | GA is loaded but blocked by the CSP, and contradicts `privacy.html:42`. | Low | Remove (decision 1, `layout.tsx:183-192`). |
| O27 | Web turns a 422 `detail` array into the message `[object Object]` (`api.ts:21-22`). | Low | Decide. |
| O28 | Web types declare `summary: string` and `published_at: string` though the API sends null (`types.ts:5`, `:13`). | Info | Fix types if touched. |
| O29 | iOS rejects a whole page if any `published_at` lacks a zone (`APIClient.swift:43-61`); Python can produce one through `parsedate_to_datetime` with `-0000` (`rss_fetcher.py:147`; tested). | Medium, latent | Fix: always emit UTC with `Z`. |
| O30 | The live nginx is older than the repo file (9.2). The contract diff should compare against live behavior; the target header set is an owner decision. | Medium | Decide which header set to ship (repo set without `'unsafe-eval'` is the documented intent). |
| O31 | Good News Network 403 on every fetch; FMP Financial News 402 (9.4). The 403 may be a user agent or IP block (inference). | Low | Decide: retest from Cloudflare, replace or disable. |
| O32 | `GET /` returned 500 29 times in 14 days (9.3), cause unknown. The page is prerendered, so this came from the Next server (inference). | Low | A static export removes the Next server. |
| O33 | Offset pagination over a list rebuilt on every request: items can repeat or be skipped between pages when the cache changes; iOS uses `url` as the SwiftUI identity (`Article.swift:15`), so a repeat gives duplicate ids. | Low | Keep (clients expect this API). |
| O34 | `scroll-in` uses a plain `http://` feed URL (`sources.yaml:462`). | Info | Keep or switch to https. |
| O35 | Google News resolver (`rss_fetcher.py:273-364`) runs only for disabled sources and POSTs to Google. | Info | Do not port unless Google News is re-enabled. |
| O36 | iOS leaves `+` unencoded in query values, so `+` becomes a space on the server (6.6). | Low | Keep: standard form decoding reproduces it. |
