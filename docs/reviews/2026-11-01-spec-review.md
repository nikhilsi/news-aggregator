# ClearNews on Cloudflare: independent spec review

**Date:** November 1, 2026
**Reviewed:** `docs/cloudflare-architecture.md` (untracked, as present on `main` at `8d51f0a`), against its inputs `docs/reviews/2026-11-01-inventory.md` and `docs/reviews/2026-11-01-research-cloudflare.md`, the code under `backend/app/`, `web/src/`, `ios/ClearNews/ClearNews/ClearNews/`, `android/ClearNews/app/src/main/java/com/nikhilsi/clearnews/`, and the TourGraph and Recurate Cloudflare docs and review.
**Reviewer role:** the breaker. I did not write the spec. Nothing in the repo was changed except this file. No Cloudflare account, token, SSH, deploy or commit was used.

What I ran, all in `/private/tmp/claude-501/review-clearnews/`:

- A JS summary cut at 497 UTF-16 units over a string with an emoji at the cut, then the result decoded by Swift `JSONDecoder` on this Mac (macOS 27.0.1).
- V8 `new Date(...)` and `toISOString()` on 17 odd feed date strings (Node 26.12.1, `TZ=UTC`).
- Hono 4.13.14 (Recurate's `node_modules`) for query decoding, repeated keys, trailing slash, HEAD and `c.json` with `undefined` values.
- WHATWG `new URL()` versus Python `urlparse` on 11 tricky reader URLs.
- Analysis of the research session's recorded data (`/private/tmp/claude-501/research-cf-clearnews/data/`): 39 recorded feeds with headers, and the 1,084 article live snapshot.
- Two GETs to `https://getclearnews.com` (`?source=sunny-skyz&per_page=3`, `?category=finance&per_page=50`), public DNS lookups against `walt.ns.cloudflare.com`, `gh repo view` for visibility, and Cloudflare docs lookups.

**Summary:** no blocker that I could confirm, but R1 becomes one if Bot Fight Mode is on for the zone, and nobody has looked. Three high findings: zone security features will start acting on app traffic at the switchover; nothing guarantees that every article the Worker emits decodes on iOS 2.0 (tested: a JS-style summary cut makes Swift reject the whole page); and a cron that stops updating would go unnoticed indefinitely. Seven medium findings are mostly about the cron's failure modes, the rollback, the Finance tab and what the tests can prove. Six low findings, including a list of things to cut.

Severity count: blocker 0, high 3, medium 7, low 6.

| # | Finding | Severity |
|-|-|-|
| R1 | Zone security (Bot Fight Mode, Security Level, Browser Integrity Check) will act on app API traffic once the names are proxied; the spec never checks it | High |
| R2 | Nothing guarantees every emitted article decodes on iOS: UTF-16 summary cut, invalid or out-of-range dates, `undefined` keys | High |
| R3 | No one will know when feeds stop updating; requests never fetch, `/health` never reads KV, logs are not enabled | High |
| R4 | One oversized or crashing feed can kill every cron run, and stalest-first picks it again each minute | Medium |
| R5 | A missing or unreadable `state` is treated as a first deploy and overwrites `feed` with a partial list | Medium |
| R6 | Last good articles are kept forever on failure, which brings back the stale Finance tab problem | Medium |
| R7 | Cron run timing, overlap and write order are underspecified; "nothing is lost" holds only when 10 or fewer sources are due | Medium |
| R8 | The rollback cannot work as written: the custom domain's own records stay | Medium |
| R9 | The Finance tab can disappear from the live apps; the finance feeds are not a gate item | Medium |
| R10 | The parity test and contract diff cannot prove what section 9 claims | Medium |
| R11 | JS port traps in the request path: prototype keys, first versus last repeated key, a URL-keyed article pool | Low |
| R12 | SSRF check details left open: range list, URL normalization, trailing dot, userinfo, DoH timeout, content type | Low |
| R13 | `run_worker_first` widens the blast radius; error responses and Workers Caching need a rule | Low |
| R14 | Things to cut (KISS) | Low |
| R15 | The spec itself discloses the live reader weakness in a public repo | Low |
| R16 | Small gaps: localhost API fallback, privacy page date, CLAUDE.md timing, rate limit namespace ids | Low |


## R1. Zone security will act on app traffic after the switchover, and nothing checks it

- **Severity:** high (a blocker if Bot Fight Mode is on)
- **Status:** Plausible. The zone's security settings cannot be read without the account.

**What the spec says.** Section 7 (line 132) and section 10 step 5 (line 160) set four zone settings: Always Use HTTPS, Email Obfuscation, Rocket Loader, minimum TLS. Section 10 step 4 checks the switchover with `verify.mjs`, a browser walk and one simulator run.

**The problem.** Today `getclearnews.com` and `www` are DNS-only records (inventory 8.3, key fact 12), so no Cloudflare security feature sees app requests. A Worker custom domain is proxied, so from the switchover on, Bot Fight Mode, Security Level, Browser Integrity Check and challenge settings run before the Worker on every iOS and Android call. The spec does not read or set any of them.

**Evidence.**
- Cloudflare, Bot Fight Mode (https://developers.cloudflare.com/bots/get-started/bot-fight-mode/): "they may challenge API or mobile app traffic", and "You cannot bypass or skip Bot Fight Mode using WAF custom rules or Page Rules."
- Security features interoperability (https://developers.cloudflare.com/waf/feature-interoperability/): "Bot Fight Mode cannot be skipped."
- iOS treats any non-2xx as an error and decodes only `{"detail": String}` (`APIClient.swift:132-136`); a failed categories call on app start leaves no tabs (inventory 6.1).
- TourGraph had no published apps and Recurate is web only, so their switchover checks never exercised this.

**Failure scenario.** Bot Fight Mode is on, or Security Level challenges a carrier CGNAT address. An iOS 2.0 user opens the app; `/api/v1/categories` gets a 403 HTML challenge page; the app shows "Server error (403)" and no tabs. The browser walk passes, because browsers solve challenges. Nobody sees it until a user complains.

**Suggested fix.**
1. Before the attach, read the zone's settings through the API (Bot Fight Mode, Security Level, Browser Integrity Check, challenge passage, AI bot blocking) and write the values into section 10.
2. Turn Bot Fight Mode off. Add a Configuration Rule for `/api/*` and `/health` with Security Level at its lowest and Browser Integrity Check off.
3. Set all the zone settings (including section 7's four) before the attach, not after: they do nothing to DNS-only names, so setting them early is free and closes the window where proxied `http://` is served without a redirect.
4. Add `verify.mjs` checks that call the three app paths with the exact iOS (CFNetwork) and Android (`okhttp/4.12.0`) user agents and no browser headers, from a non-residential address, and expect JSON. After 24 hours, check Security Events for any action on `/api/*`.

Response: Accepted. Read on Nov 1: Bot Fight Mode off (through the Cloudflare connector; the ClearNews token lacks that permission), Security Level medium, Browser Integrity Check on, Always Use HTTPS off, Email Obfuscation on, minimum TLS 1.0. Not a blocker. Spec section 7 now has the table: Security Level to essentially off and Browser Integrity Check off zone-wide (a read-only site and API behind a rate limit; zone-wide is simpler than a Configuration Rule), all settings set before the attach. verify.mjs calls the app paths with the iOS and Android user agents; Security Events checked after 24 hours (section 10 step 7).


## R2. Nothing guarantees that every emitted article decodes on iOS

- **Severity:** high
- **Status:** Confirmed by local tests (surrogate decode on macOS 27 Foundation; iOS 17 behavior is inference from the same parser family). Latent today: no live article triggers it yet.

**What the spec says.** Section 3 (lines 49 to 50, 57): null fields are sent as null, `published_at` is `YYYY-MM-DDTHH:MM:SSZ`, the summary is cut at 500 characters, every date is normalized to UTC. The deliberate differences say undated articles sort last (line 63).

**The problem.** iOS rejects the whole page when one article breaks a rule (inventory 6.2, 6.3), and the spec states the rules but no mechanism enforces them. Three concrete ways a straight JS port breaks them:

1. **Summary cut by UTF-16 units.** Python cuts by code points (`rss_fetcher.py:167-168`). `text.slice(0, 497)` in JS can split an emoji and leave a lone high surrogate. `JSON.stringify` then emits `\ud83d`, and Swift refuses the document.
2. **Dates.** V8 returns Invalid Date for zone names it does not know and for impossible values, and `toISOString()` then throws. Years past 9999 format as `+010000-...`, which `ISO8601DateFormatter` rejects.
3. **`undefined` values.** Hono's `c.json` drops keys whose value is `undefined`; a required field built from an `undefined` disappears and both apps reject the page.

**Evidence (tests run today).**

| Input | Result |
|-|-|
| 496 ASCII chars + `😀` + more text, cut with `slice(0, 497) + '...'` | `"xx\ud83d..."`, `isWellFormed()` false |
| That JSON decoded by Swift `JSONDecoder` (macOS 27.0.1) | `DecodingError.dataCorrupted ... "Missing low code point in surrogate pair around line 1, column 527."` The same document with a full pair decodes. |
| `new Date('Sat, 01 Nov 2026 20:30:00 IST')`, `'... CEST'`, `'2026-13-45T00:00:00Z'`, `'Sun, 02 Nov 2026 25:61:00 GMT'` | Invalid Date; `toISOString()` throws `RangeError` |
| `new Date('Mon, 01 Jan 10000 00:00:00 GMT').toISOString()` | `+010000-01-01T00:00:00.000Z` |
| Hono `c.json({ s: undefined, n: null, t: 'x' })` | `{"n":null,"t":"x"}` |

feedparser rolls `2026-13-45` over to 2027-01-01 and keeps the item (inventory 2.3), so a throwing date in JS either drops the item or, without a per-entry catch, fails the whole source (which then serves its last good articles forever, R6). In the live snapshot, 77 of 1,084 summaries are cut and none contains an astral character, so the surrogate case is latent, not present.

**Failure scenario.** A Positive News or Sunny Skyz summary has an emoji at character 497. The `feel_good` page that contains it fails to decode on every iOS 2.0 device for as long as the article is in the list: "Failed to process server response". Android and web keep working, so the bug looks iOS-only and intermittent.

**Suggested fix.**
1. Cut by code points: `Array.from(text).slice(0, 497).join('') + '...'`, after any whitespace change (R10).
2. Call `toWellFormed()` on every string field during normalization.
3. One date function that returns null unless the Date is valid and the year is between 1 and 9999, and that formats `YYYY-MM-DDTHH:MM:SSZ` itself. Decide what an unknown zone name means (UTC, or null) and write it in section 3.
4. One output gate in the cron, run on every article before `feed` is written: required fields are strings, `published_at` is null or matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`, every string is well formed. Drop and log anything that fails. Unit tests with the vectors above.

Response: Accepted in full. Section 3 now defines one output gate run on every article before it is stored: code point cut, toWellFormed on every string, one date function (valid, year 1 to 9999, own formatting, a small table for IST, CEST, CET, BST, AEST, JST), required fields checked, failures dropped and logged. Your vectors become unit tests (section 9).


## R3. No one will know when feeds stop updating

- **Severity:** high
- **Status:** Confirmed (spec and code read)

**What the spec says.** Requests only read KV (section 1, line 15). `/health` does no KV read (section 5, line 104). The cron logs one line per run (section 4, line 92). Section 9 reads per-source status "from the logs" (line 146) and section 4 moves `state` to D1 "if logs show this often" (line 96). The bindings list (section 2, line 40) has no `observability` setting.

**The problem.** Today the request path heals itself: a STALE entry starts a background refresh and a MISS fetches synchronously (inventory 3.2), so a dead refresh loop does not freeze the feed. In the new design nothing but the cron ever fetches, and KV values never expire. If the cron stops producing new data, the API keeps answering 200 with `complete: true` and the same articles, and `/health` keeps saying ok. The logs that section 9 relies on are only kept if Workers Logs is turned on in `wrangler.jsonc`; otherwise they exist only in a live tail. The D1 trigger "if logs show this often" has no log line that could show it.

**Failure scenario.** A deploy introduces an exception at the top of `scheduled()`, or R4's poison feed kills every run, or publishers start blocking Cloudflare egress. The apps show news that ages by the day. The first signal is a user review.

**Suggested fix.**
1. `"observability": { "enabled": true }` in `wrangler.jsonc`.
2. Store `built_at` in `feed` and, per source, `ok_at` and the last status in `state`. Expose them on a small `/api/v1/status` (no app calls it; extra paths are free).
3. `verify.mjs` fails when `built_at` is older than 30 minutes or an enabled source has had no success for 24 hours.
4. Decide how a stale feed reaches Nikhil (for example a periodic check from the Mac or a Command Center task) and write it in section 9. Without a channel, items 2 and 3 only help when someone looks.

Response: Accepted. Observability on in wrangler.jsonc; feed carries built_at; state carries ok_at and last status per source; new GET /api/v1/status; verify.mjs fails on a feed older than 30 minutes or a source with no success in 24 hours. The alert channel to Nikhil is his call and is listed as an open item in section 12.


## R4. One oversized or crashing feed can kill every cron run

- **Severity:** medium
- **Status:** Plausible (limits from docs; feed sizes measured on recorded data)

**What the spec says.** Section 4 step 3 (line 87) fetches each due feed with a 10 s timeout. Step 2 (line 86) picks due sources stalest first, at most 10 per run. No size limit is set on feed bodies.

**The problem.** Workers give 128 MB of memory per isolate and 30 s of CPU per cron run, and "Cloudflare does not enforce response body size limits" (research 1.2, 4). An exception can be caught per source, but running out of memory or CPU ends the whole invocation. No `state` is written, so the offending source keeps the oldest `checked_at` and is picked first again the next minute, and the other nine sources picked with it lose their work every time.

**Evidence.** The largest of the 39 recorded feeds is 497,307 bytes (`av-club.xml`); all of them together are 3.57 MB. A 10 s timeout does not bound size: at edge bandwidth, ten seconds of an endless or misconfigured response is far more than 128 MB.

**Failure scenario.** A publisher's feed URL starts returning a huge archive, an endless stream or an entity-expansion document. Every cron run dies. `feed` freezes, and with R3 nobody is told.

**Suggested fix.** Read feed bodies through the stream with a 5 MB cap (ten times today's largest) and treat going over it as a failure. Wrap fetch, parse and normalize per source in `try`/`catch`. Check that the XML parser has entity expansion limits on. Add a per-run deadline (R7). These keep failures catchable, so they get recorded and backed off instead of repeating.

Response: Accepted. Bodies are read as a stream with a 5 MB cap; each source runs in its own try/catch; feedsmith's XML parser keeps entity expansion limits on; a 40 s run deadline (section 4 steps 3 and 8).


## R5. A missing or unreadable `state` resets the cron and overwrites `feed` with a partial list

- **Severity:** medium
- **Status:** Confirmed (spec text); Plausible (the triggers)

**What the spec says.** "If `state` is missing (first deploy), every enabled source is due" (section 4 step 2, line 86), next to "at most 10 per run". Step 4 rebuilds `feed` from the run's view of `state` (line 91). Rollback after the droplet: "`wrangler rollback` for code; KV refills itself" (line 163).

**The problem.**
- The spec does not say whether the first run fetches 10 sources or all of them.
- "Missing" is not the same as "first deploy". KV caches negative lookups at the edge ("Both existing key-value pairs and non-existent key-value pairs (also known as negative lookups) are cached at the edge", https://developers.cloudflare.com/kv/api/read-key-value-pairs/). A test deploy bound to the wrong namespace, or a code version that cannot parse a newer `state` shape (exactly what `wrangler rollback` can produce), also reads as missing.
- In every such case the run starts from empty, fetches up to 10 sources, rebuilds `feed` from those alone and writes it, because its hash differs.

**Failure scenario.** After a rollback to an older version, the first run cannot parse `state`, treats it as missing, and writes a `feed` built from 10 sources. The All tab shrinks; category tabs whose sources were not picked return empty pages with `complete: true` and `public, max-age=300`, and iOS keeps them in URLCache for 5 minutes (the privacy page confirms the app uses URLCache). It refills over the next minutes, but every user who opened the app in that window saw empty tabs.

**Suggested fix.** Put a schema version `v` in `state` and `feed`. If `feed` exists but `state` is missing or unreadable, log an error and do not write `feed` until every enabled source has been attempted. On a first deploy, fetch every enabled source in one run (research 2 measured 39 feeds in 1.3 s). Note in section 5 that, on a brand new namespace, a `feed` miss read with `cacheTtl` 300 stays cached for up to 5 minutes, so the 3 s retry will see the same empty answer during that window.

Response: Accepted. state and feed carry a schema version v. Missing, unreadable or other-version state means a full run that fetches every enabled source at once, and logs an error when a feed already exists, so a rollback cannot publish a 10-source feed. The first deploy is warmed by a full run before anyone uses it (section 5).


## R6. Last good articles are kept forever, which brings back the stale Finance tab

- **Severity:** medium
- **Status:** Confirmed (spec read; live check)

**What the spec says.** Deliberate difference (line 64): "The source keeps its last good articles; failures are recorded and retried." Section 4 step 3: "Error or timeout: keep articles" (line 90). There is no age limit.

**The problem.** Today a failed fetch empties the source (O2), and in any case an entry turns into a MISS after 24 hours (inventory 3.1). The new rule removes both limits. A source that fails permanently (blocked, moved, discontinued) serves its last articles indefinitely. In category tabs, tier 1 is each source's 5 newest articles (inventory 2.8), so those old items sit above newer tier 2 items.

**Evidence.** This is the failure the spec fixes for 304s (O3): live `GET /api/v1/articles?category=finance&per_page=50` today returned 19 items, all from `fmp-articles`, newest `2026-10-22T19:06:41Z`, ten days old.

**Failure scenario.** Good News Network works from Cloudflare for a week, then its WAF starts blocking Worker subrequests (research 2: publishers can match `cf.worker.upstream_zone`). Its last 20 articles stay in Feel Good indefinitely, five of them in tier 1.

**Suggested fix.** Drop a source's articles when `ok_at` is older than 24 hours (today's stale window), and log it. That keeps the O2 improvement for short outages.

Response: Accepted. Last good articles are kept for up to 24 hours after the last success, then dropped and logged (section 4 step 4).


## R7. Cron timing, overlap and write order are underspecified

- **Severity:** medium
- **Status:** Partly confirmed (docs and spec read); the overlap and regression sequences are reasoned, not observed

**What the spec says.** Section 4 (line 96): "Runs cannot overlap in practice: a run's worst case is 10 feeds at 10 s plus image lookups at 5 s, well under a minute." On KV consistency: a stale read "picks the same stalest sources again ... so nothing is lost."

**The problem.**
1. **Concurrency is not specified.** A Worker invocation can have only six connections waiting for headers; a seventh is queued (https://developers.cloudflare.com/workers/platform/limits/). `AbortSignal.timeout(5000)` starts counting when it is created.
   - If all og:image lookups are started at once (up to 25 per source, 250 per run), queued ones time out without ever being sent: silent "no image". If that marks the article "og checked", it is never retried.
   - If sources are processed one after another, the worst case is 10 x (10 s + 5 s) = 150 s, which overlaps the next two runs.
2. **Overlap.** Two runs read the same `state` and the last writer wins. The earlier run's fetches are lost, though they are refetched later. Two writes to the same key within a second can fail (KV allows 1 write per second per key, research 3).
3. **Stale reads.** The claim mostly holds: with 10 or fewer sources due, selection is deterministic, so a run that reads an older `state` refetches the same sources. With more than 10 due (first deploy, after an outage), a run that read an older `state` can pick a different 10 and overwrite sources another run just refreshed. `feed` then briefly goes backwards (pages shift, items repeat between page 1 and page 2, and iOS uses `url` as the row identity, `Article.swift:15`). The failure counter also resets, so backoff restarts.
4. **Write order.** Step 4 rebuilds `feed` only when this run changed a source. If the `feed` write fails but the `state` write succeeds, the next run sees no change and `feed` stays stale until some other source changes.
5. **og carry-over.** Python uses the feed's own image first and looks up og:image only when it is missing (`rss_fetcher.py:247`). Carry-over by URL must apply only to items without a feed image, or an old og:image overrides a newer feed image.

**Suggested fix.** Fetch all due feeds at once. Run og lookups through a pool of 6, with each timer started when its request is sent. Set a run deadline (for example 40 s) after which remaining work is dropped and `state` is written. Mark "og checked" only on a definite answer (a parsed 2xx, or 404/410). Write `state` only after the `feed` write succeeded. Add `run_seq` and `written_at` to `state` and log the age of each `state` read: that is the measurement the D1 fallback needs. Keep the carry-over rule from item 5.

Response: Accepted. No cap per run: every due source is fetched at once, so a stale state read picks the same set. og lookups through a pool of six with per-request timers; og checked only on a definite answer; carry-over only for items without a feed image; feed written before state; run_seq and written_at in state, with the state age logged each run as the measurement for the D1 fallback; 40 s deadline (section 4).


## R8. The rollback cannot work as written

- **Severity:** medium
- **Status:** Plausible (the conflict on create is not tested; the leftover AAAA is certain)

**What the spec says.** Section 10 (line 163): "Rollback: recreate the two A records to 64.227.96.170."

**The problem.** Attaching a custom domain makes Cloudflare create its own records for the name. TourGraph saw proxied `AAAA 100::` records for both names (`tourgraph/docs/cloudflare-architecture.md` section 9 step 4).
- Recreating only the A records leaves the AAAA in place, so IPv6 clients (common on US mobile networks) keep reaching the Worker.
- Creating an A record on a name owned by a Worker custom domain is likely refused while the domain is attached.

The rollback, the one step that has to work under pressure, has no script and no detach.

**Failure scenario.** The Worker misbehaves the evening after the switchover. The A record creation fails or, if accepted, only IPv4 users move back. The site stays half on the Worker while someone works out the API calls.

**Suggested fix.** A rollback script in the same style as the switchover: detach the custom domain for `www` and the apex (this removes its records), create the two A records DNS-only with TTL 300 right away, then check both Cloudflare nameservers. Keep the payloads next to the zone export from step 2. Negative caching is the same as at the switchover (SOA minimum 1800 s, checked today).

Response: Accepted. The rollback is now a script: detach both custom domains (removing Cloudflare's own records, including the AAAA), create the A records DNS only with TTL 300, check both nameservers. Both scripts are rehearsed end to end on cutover-test.getclearnews.com before the switchover, which needs Nikhil's OK (sections 9 and 10).


## R9. The Finance tab can disappear from the live apps

- **Severity:** medium
- **Status:** Confirmed (spec and code read)

**What the spec says.** Section 4 (line 98): the FMP sources are removed; finance RSS feeds are added "after testing (Nikhil approves the list before they go live)". Section 12 lists them as open. The gate (section 10 step 1, section 9) does not mention them.

**The problem.** With FMP removed and no enabled finance source, `/api/v1/categories` hides Finance (O23, `registry.py:102-104`), and the tab disappears in iOS 2.0, Android and the web. The spec allows the switchover to happen before the list is approved.

**Failure scenario.** The gate passes on a Friday and the finance list waits for a decision. Finance vanishes from the App Store build with no app release and no note.

**Suggested fix.** Make "finance feeds approved and running on `workers.dev` for the gate day" a gate item in section 9. Otherwise, list "Finance tab hidden until the feeds land" in section 3's table as an accepted difference. The copy counts in section 7 follow from the same decision.

Response: Accepted. Finance feeds approved and running on workers.dev through the gate day is a gate item; no switchover without them (section 9).


## R10. The parity test and contract diff cannot prove what section 9 claims

- **Severity:** medium
- **Status:** Confirmed (code read; live check; recorded data)

**What the spec says.** Section 9: "run the Python pipeline (fetching mocked) and the TypeScript pipeline on the same fixtures; compare ... field by field. Any difference must be on the deliberate list" (line 144). The contract diff compares "shape, types, status codes and headers", and lists "on shape and per-source counts" (line 145). The simulator run covers feed, categories, search, refresh and reader (line 148).

**The problem.**
1. **The Python harness is not deterministic as described.** On a cold cache, `get_articles` takes the MISS path and collects results in `asyncio.wait` completion order (`service.py:388`, O14), so dedup and sort ties change from run to run.
2. **O17 hides other summary bugs.** It changes the whitespace of almost every summary, so `summary` has to be on the allow list, and then a wrong cut (R2), wrong entity decoding or a wrong CDATA path passes as well.
3. **The design creates differences that are not on the list:**
   - **Charset.** Sunny Skyz is served as `Content-Type: application/xml; charset=ISO-8859-1` (recorded header) with an `encoding="ISO-8859-1"` declaration, but its bytes are UTF-8 (a UTF-8 decode of the recorded file gives 0 replacement characters). Python decodes by the header, so live titles today read `Toddlerâ€™s` and `â€œA Miracle,â€` (GET today, `?source=sunny-skyz`). `fetch().text()` decodes UTF-8, so titles, dedup keywords and search hits all change.
   - **og:image.** A cap of 25 lookups per source and a 128 KB window replace Python's unlimited lookups and first 15,000 characters (`rss_fetcher.py:209-221`, `:251`). `has_image` is a dedup priority (`service.py:109-116`), so the surviving duplicate changes.
4. **Shape checks cannot see R2.** A zone-less date or a lone surrogate is still a "string". The simulator run touches a handful of pages.
5. **Tests depend on the time zone.** Zone-less date strings parse as local time in Node (`new Date('2026-11-01 20:30:00')`), and Workers runs in UTC.

**Suggested fix.**
1. Warm the Python cache with `warmup_cache()` and mocked fetches (it pairs results with sources in `sources.yaml` order, `service.py:282`), then call `get_articles` on the warm cache.
2. Defer O17 until after the switchover (the inventory notes exact parity makes the diff easy), or apply the same transform to Python's output before comparing.
3. Record fixtures with headers and the article page heads. Decide the charset rule (decode as UTF-8 when the bytes are valid UTF-8 is the better result) and the og:image differences, and add them to section 3 or reproduce Python.
4. Add a decoder sweep: a small Swift command line tool built from the app's own `Article.swift`, `Category.swift`, `ReaderContent.swift` and the decoder setup in `APIClient.swift:41-61`. It decodes every page of every category on `workers.dev` (`per_page=50`, about 25 calls for All) and the reader sample, a few times during the gate day. Check `published_at` against the regex in R2 on every item, not only page 1.
5. Run every test with `TZ=UTC`.

Response: Accepted. Python cache warmed with warmup_cache and mocked fetches so results pair in sources.yaml order; O17 deferred to #413 so summaries compare exactly; fixtures recorded with headers and og page heads; og lookups read the first 15,000 characters with today's two patterns, so they match Python; the charset rule (UTF-8 when valid, else the declared charset) is a listed difference and fixes the Sunny Skyz text; Swift decoder sweep built from the app's own model files; every test runs with TZ=UTC (section 9).


## R11. JS port traps in the request path

- **Severity:** low
- **Status:** Confirmed by local tests

**What the spec says.** Section 3: unknown categories return an empty page as today (inventory 1.4), and "the last value wins when a key repeats" (line 55). Section 4 step 4: `feed` holds "the unique articles once, plus per category an ordered index array" (line 91).

**The problems, each tested.**
- **Prototype keys.** With a plain object as the category index, `idx['constructor']` is a function (`typeof` gives `function`, `Object.hasOwn` gives false). `?category=constructor`, `__proto__` or `toString` then reach `.slice` on a non-array and return 500; today they return 200 with an empty list. The same applies to `source=` lookups.
- **Repeated keys.** Hono's `c.req.query('per_page')` on `per_page=5&per_page=7` returns `"5"`, and so does `URLSearchParams.get`. Python takes the last value.
- **A pool keyed by URL.** "Unique articles once" must be keyed by `source_id` and `url`. The URL dedup layer works within one list (`service.py:146-157`), so the same URL from two sources in different categories is two articles, each in its own tab. Keyed by URL alone, one tab shows the other source's `source_name` and `category`. None of the 39 recorded feeds shares a URL with another today, but Ars Technica's science and tech feeds can carry the same story.

**Suggested fix.** Use `Map` or `Object.hasOwn` for every lookup keyed by user input. Either drop the "last value wins" line (no client sends repeated keys) or implement it with `c.req.queries(key).at(-1)`. Key the pool by `source_id` and `url`. Add unit tests for each.

Response: Accepted. Map or Object.hasOwn for every lookup keyed by user input; the pool is keyed by source_id and url; last-value-wins dropped and first-value-wins listed as a difference (no client repeats a key). Unit tests for each.


## R12. SSRF check details left open

- **Severity:** low
- **Status:** Confirmed by local tests (URL parsing); the edge's own behavior with private addresses is undocumented (research 4)

**What the spec says.** Section 6 steps 1 to 3 (lines 109 to 111): validate as today, reject IP literals and listed names, resolve A and AAAA through DNS over HTTPS, reject listed ranges, fetch with manual redirects and a check per hop, 15 s total, `text/html` only, 3 MB cap.

**The gaps.**
1. **The range list is not written down.** IPv6 forms that embed IPv4 must be unpacked and checked: `::ffff:0:0/96`, NAT64 `64:ff9b::/96` and `64:ff9b:1::/48`, 6to4 `2002::/16`, Teredo `2001::/32`. Also `0.0.0.0/8`, `192.0.0.0/24`, `198.18.0.0/15`, `240.0.0.0/4`, `ff00::/8`.
2. **Parse with WHATWG `URL`, then check the parsed hostname.** It normalizes `http://2130706433/`, `http://0x7f.1/` and `http://017700000001/` to `127.0.0.1` (tested), so a regex on the raw string misses them. IPv6 hostnames keep their brackets (`[::ffff:7f00:1]`).
3. **Trailing dot.** `https://GetClearNews.com./` parses to hostname `getclearnews.com.` (tested), so the own-host check must strip the dot. It must also include the `workers.dev` hostname.
4. **Userinfo** survives parsing (`username` is `user` for `http://user:pw@example.com/`); reject it.
5. **Messages differ from today.** `https:example.com` is valid to WHATWG but gives 400 `Invalid URL` in Python (`hostname` is None). Harmless, but it contradicts "the same 400 bodies".
6. **The DoH lookups have no timeout in the spec.** They are also best effort: the edge resolves the name again when it connects (research 4), so the hop checks, rate limit, byte cap and timeout carry most of the protection.
7. **`text/html` only** turns pages served as `application/xhtml+xml` from successes today into failures. Decoding is UTF-8 only (see R10's charset point).

**Suggested fix.** Write the list and these rules into section 6, with one unit test per line above. Give DoH a 3 s timeout inside the 15 s budget. Accept `application/xhtml+xml`.

Response: Accepted. Section 6 now lists the ranges, WHATWG parsing, trailing dot removal, own hostnames including workers.dev, userinfo rejection, a 3 s DoH timeout, application/xhtml+xml accepted, and the input check differences (listed in section 3).


## R13. `run_worker_first` widens the blast radius; error responses and Workers Caching need a rule

- **Severity:** low
- **Status:** Confirmed (spec and docs read)

**What the spec says.** Section 2 (line 39): every request runs the Worker first, which adds headers and serves `env.ASSETS`. Section 3 (line 56): `Cache-Control: public, max-age=300` on articles, categories and sources.

**The problems.**
1. **Blast radius.** Any exception before `env.ASSETS.fetch` (header code, the www check) takes down the whole site, including `/privacy` and `/support`. Those are the pages iOS `AboutView.swift:38`, `:47` and Android `AboutScreen.kt:100`, `:109` open, and App Store review checks them.
2. **Cacheable errors.** Python stamps `public, max-age=300` on every status for the list paths (O6). If the Worker copies that pattern, the new 429 and any 500 become cacheable for 5 minutes in browsers.
3. **Workers Caching must stay off.** It is a new opt-in Worker feature (`cache.enabled`). Its cache key leaves out the hostname (https://developers.cloudflare.com/workers/cache/cache-keys/), so a cached `www` 301 would be served on the apex: a redirect loop. Responses with no `Cache-Control`, such as the reader and `/health`, would be cached for 2 hours (https://developers.cloudflare.com/workers/cache/configuration/).

**Suggested fix.** Keep the non-API path to "fetch the asset, copy headers"; on any error there, return the unmodified `env.ASSETS.fetch(request)` response. Send `no-store` on 429 and 5xx. Add one sentence to section 2: Workers Caching stays off.

Response: Accepted. The page path falls back to the unmodified asset response if header code throws; every 4xx and 5xx gets no-store; Workers Caching stays off (section 2).


## R14. Things to cut

- **Severity:** low
- **Status:** Opinion, with evidence where it exists

The owner values KISS, and the reader was called once in 14 days (inventory 9.3). Candidates:

1. **Reader Cache API and the 5 minute failure cache** (section 6 step 7, line 115). It cannot be tested on `workers.dev` (the spec says so), so the gate never exercises it, and it saves nothing at this traffic. Cut; the rate limit already guards abuse.
2. **`cacheTtl` 30 for `refresh=true`** (section 5, line 102). KV docs: "Once a key has been read with a given `cacheTtl` in a region, it will remain cached in that region until the end of the `cacheTtl`." A 30 s read in a place where 300 s reads happen does not return fresher data. Use one value.
3. **Exponential backoff** (section 4 step 2). "A failed source is due again after 5 minutes" is one line and behaves about the same.
4. **O17 whitespace change.** Defer until after the switchover (R10).
5. **"Last value wins"** for repeated keys. Drop it (R11).
6. **The `feed` hash.** "Write `feed` when any source changed" is enough at about 86,000 writes a month inside the 1 million included.

Keep: both rate limiters, the per-hop SSRF checks with caps, and HEAD, which Hono answers for free (tested: 200 with an empty body).

Response: Mostly accepted. Cut: the reader cache, the second cacheTtl (one value, the default 60 s), exponential backoff (a failed source is due again after 5 minutes), O17 for now, last-value-wins, the feed hash (feed is written when any source changed). Kept, as you suggest: both rate limiters, the per-hop SSRF checks with caps, HEAD.


## R15. The spec itself discloses the live reader weakness in a public repo

- **Severity:** low
- **Status:** Confirmed (`gh repo view nikhilsi/news-aggregator`: `"visibility":"PUBLIC"`; the spec is untracked today)

**What the spec says.** Section 8 (line 139): "The live reader's weakness (O8) stays undocumented in public until the droplet is gone: `docs/reviews/` is committed after the shutdown." Section 3's table (line 75) says "Reader SSRF: one DNS check, redirects followed unchecked, no size cap, CGNAT allowed".

**The problem.** The spec lives in `docs/`, not `docs/reviews/`, so the rule as written lets it be committed with the build while it spells out the weakness. This review repeats it. The risk is small, since `reader.py` is already public, but the stated rule and the file layout disagree.

**Suggested fix.** Hold `docs/cloudflare-architecture.md` with `docs/reviews/` until the shutdown, or reword line 75 to "Reader SSRF hardened (section 6)" until then.

Response: Accepted. The spec's table now says only "Hardened (section 6)" for the reader; docs/reviews/ (including this file and the inventory) is committed after the droplet is gone (section 8).


## R16. Small gaps

- **Severity:** low
- **Status:** Confirmed (files read)

1. **Localhost API fallback.** `web/src/lib/api.ts:9` falls back to `http://localhost:8000/api/v1`, and an untracked `web/.env.local` sets `NEXT_PUBLIC_API_URL` to a localhost value (only the name and the `localhost` match were read). A local `npm run build` used for the browser walk bakes that in, and the new CSP (`connect-src 'self'`) blocks it: the feed never loads. Change the fallback to `/api/v1`, and have the deploy script refuse a bundle that contains `localhost:8000`, as Recurate's does.
2. **Privacy page date.** It says "Last updated: February 13, 2026" and promises a new date when it changes. Update the date when the "financial news APIs" sentence changes (section 7).
3. **CLAUDE.md timing.** Rule 8 (no cron) and the architecture summary (in-memory cache, DigitalOcean) should change in the same change that adds the Cron Trigger, not "after the switchover" (section 10). Every session reads CLAUDE.md first, and a session in between would treat the cron as a rule break.
4. **Rate limit namespace ids.** Name the two `namespace_id` values in section 2, distinct from TourGraph's 3001 and Recurate's 2001 and 2002; the TourGraph review checked the same thing.

Response: Accepted. The api.ts fallback becomes /api/v1 and the deploy script refuses a bundle with localhost:8000; the privacy page date changes with its copy fix; CLAUDE.md changes in the same commit that adds the Cron Trigger; rate limit namespace ids 4001 and 4002 (TourGraph 3001, Recurate 2001 and 2002, helpmerot none).


## Checked and fine

- **Mail.** The switchover touches only the apex and `www` A records. MX and TXT are other types; SPF has no `a` mechanism. Today there are no AAAA or CAA records (dig today; SOA minimum 1800 s).
- **Paths and links.** Hostname, API paths, `/privacy` and `/support` from `web/public/` through `html_handling`, and `/article?url=` as a static shell that reads the query in the browser. Android share links encode spaces as `+`, which `URLSearchParams` in the page decodes exactly as today. Neither app declares app links, so no `assetlinks.json` or AASA file is needed.
- **Key casing.** iOS uses `.convertFromSnakeCase` (`APIClient.swift:42`); the spec keeps every snake case name. Category order with `all` first and `total_pages` of at least 1 are kept.
- **`complete` and refresh.** All clients skip the retry after `refresh=true` (`ArticleService.swift:42`), so answering `complete: true` there changes nothing. `no-store` on `complete: false` fixes O5.
- **`extracted_at` in milliseconds.** iOS decodes it as `String?` (`ReaderContent.swift`), not as a Date.
- **Query decoding.** Hono decodes `+` as a space (tested: `search=C++` gives `C  `), which matches Starlette and O36. Hono answers HEAD with 200 and an empty body.
- **Per-category precompute.** With `sources.yaml` order as input, the dedup and two-tier sort per category equal today's per-request result, including URL dedup across categories inside All and search after sort.
- **Date formats in today's feeds.** The first date element of each of the 39 recorded feeds is RFC 822 with a numeric offset, `GMT` or `EST`, or ISO 8601, and V8 parses them; research 1.1 parsed all 1,187 item dates.
- **Limits.** KV value size, write rate, CPU per run and subrequests are far inside the limits for normal runs (research 2, 3).
- **Keep-alive connections.** Apps holding open connections keep reaching the droplet, which keeps serving until it is deleted; its certificate is valid to Jan 7, 2027 (research 7).
- **iOS category selection is not persisted** (`ArticleService.swift:11`; only appearance and font scale are in `UserDefaults`), so a hidden Finance tab cannot strand a saved selection.
- **Android.** OkHttp encodes `+` as `%2B`; `minSdk` 26; `Instant.parse` fails soft to an empty label.
- **`http://www`** now takes two hops (Always Use HTTPS, then the Worker's 301) instead of one. Harmless.

## Could not verify

- The zone's current security settings (R1); no account access.
- Whether the Workers edge refuses hostnames that resolve to private addresses (undocumented, research 4).
- Whether Cloudflare refuses an A record on a name attached as a Worker custom domain (R8).
- The surrogate rejection on an iOS 17 device: tested with Foundation on macOS 27.0.1 only.
