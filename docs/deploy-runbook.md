# Deploy runbook: ClearNews on Cloudflare

How to build, test, deploy, check and roll back the `clearnews` Worker. Architecture and decisions: [cloudflare-architecture.md](cloudflare-architecture.md). Task #400.

## Access

- Cloudflare account: OmSpark (`58ada9261161c4454f308218ac672f8c`), Workers Paid.
- Token: `~/.secrets/cloudflare/clearnews.env` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), chmod 600, scoped to the account and the `getclearnews.com` zone. The scripts load it themselves. Never use the Mac's default wrangler login (it is ParkPro's).
- KV namespace `clearnews-cache`: `b1f53c4848ae4fff8cdc3807f8b8666b`.
- Live on https://getclearnews.com and www (custom domains) since Nov 1, 2026, 17:02 UTC. The workers.dev address is off.

## Everyday

All commands run from `worker/`.

| Step | Command | What it does |
|-|-|-|
| Test | `npm test` | 69 tests in the Workers runtime. Needs `web/out` (the deploy builds it; or `cd ../web && NEXT_PUBLIC_API_URL=/api/v1 npx next build`). |
| Deploy | `npm run deploy` | Builds the site, runs the tests and the typecheck, scans the site and the Worker bundle for `.env` files, key names, localhost URLs and the old GA tag, then deploys. |
| Check | `npm run verify` | Read-only live checks on production; pass another base URL as the argument to check elsewhere. Fails when the feed is over 30 minutes old or a source has not succeeded in 24 hours. |
| Feed status | `curl https://getclearnews.com/api/v1/status` | When the feed was built, and per source the last success, last status and article count. |
| Logs | Cloudflare dashboard, Workers & Pages, clearnews, Logs | One `cron run` line a minute when something was due: sources fetched with status, og lookups, articles dropped by the gate, and `state_age_ms`. |

Adding, removing or disabling a source: edit `src/sources.ts`, deploy. A category with no enabled source disappears from the apps' tabs.

## Gate before switchover

1. A day on the test address with the cron on. Compare per-source totals with the droplet: `node scripts/contract-diff.mjs sources`. Any source that works on the droplet and fails here goes to Nikhil.
2. Contract diff: `node scripts/contract-diff.mjs` (exit 0 means no unexpected difference).
3. Decoder sweep, built from the iOS app's own model files:
   ```
   APP=../ios/ClearNews/ClearNews/ClearNews
   swiftc -O $APP/Models/Article.swift $APP/Models/Category.swift $APP/Models/ReaderContent.swift scripts/sweep/main.swift -o .fixtures/sweep
   .fixtures/sweep https://clearnews.nikhil-58a.workers.dev
   ```
4. Parity with the Python backend on recorded feeds (only while `backend/` exists): `node scripts/record-fixtures.mjs`, then `TZ=UTC node scripts/parity/run-ts.ts`, `node scripts/record-fixtures.mjs og .fixtures/og-wanted.json`, `TZ=UTC python -I scripts/parity/run_py.py` (Python 3.12.13, feedparser 6.0.12, httpx 0.28.1, pydantic 2.13.4, pydantic-settings 2.14.1, PyYAML 6.0.3), `node scripts/parity/compare.mjs`.
5. The iOS app in the Xcode simulator with `Constants.baseURL` pointed at the test address (local change, never committed).
6. Finance feeds approved by Nikhil and enabled in `src/sources.ts`.
7. `npm run verify` passes.

## Switchover

1. Zone settings, before the attach: Security Level essentially off, Browser Integrity Check off, Always Use HTTPS on, Email Obfuscation off, minimum TLS 1.2 (spec section 7). Bot Fight Mode stays off (the token cannot change it; check in the dashboard).
2. `node scripts/cutover.mjs export` saves every record.
3. `node scripts/cutover.mjs attach www.getclearnews.com getclearnews.com`.
4. `node scripts/cutover.mjs check .fixtures/zone-<stamp>.json` (mail records unchanged), `node scripts/verify.mjs https://getclearnews.com`, the sweep and one simulator run against production. Then Nikhil tests the App Store build on his iPhone.
5. Add both hostnames to `wrangler.jsonc` as routes with `custom_domain: true`, set `workers_dev` to false, deploy. From then on a deploy keeps the hostnames.
6. After 24 hours, Security Events for any action on `/api/*`.

`node scripts/cutover.mjs rehearse` runs attach, a request, detach and a mail check on `cutover-test.getclearnews.com`, then deletes it.

## Rollback

- **Bad code:** `npx wrangler rollback` (or pick an earlier version under Workers & Pages, clearnews, Deployments). KV needs nothing: a version that cannot read the stored `state` does a full run and rebuilds it within a minute.
- **Back to the droplet** (only while it exists): remove the routes from `wrangler.jsonc` first (or the next deploy takes the hostnames back), then `node scripts/cutover.mjs detach getclearnews.com www.getclearnews.com`. That detaches the custom domains (removing the records Cloudflare made, including the `AAAA 100::`) and recreates the A records to 64.227.96.170, DNS only, TTL 300. The droplet's certificate is valid to Jan 7, 2027.

## Switchover record (Nov 1, 2026)

- Gate: contract diff 0 unexpected differences in 30 calls; Swift sweep 3,040 articles in 13 categories, 0 failures; parity with Python identical except three listed fixes; verify 69 of 70 on workers.dev (KING 5 not parsing yet).
- Zone settings set before the attach: Security Level essentially off, Browser Integrity Check off, Always Use HTTPS on, Email Obfuscation off, minimum TLS 1.2 (were medium, on, off, on, 1.0). Bot Fight Mode was already off.
- 17:02 UTC: zone exported, then `attach`: www 628 ms, apex 440 ms. Cloudflare created proxied `AAAA 100::` for both. The six mail records were unchanged (`check`).
- Production verify: 71 of 72 (KING 5 again). Sweep on getclearnews.com: 3,040 articles, 0 failures. Routes added to `wrangler.jsonc`, workers.dev turned off, redeployed.
- The droplet keeps running untouched as the rollback until Nikhil deletes it.
