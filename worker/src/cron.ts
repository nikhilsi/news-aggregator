// The Cron Trigger run (spec section 4). Every minute: read "state", fetch the
// sources that are due, look up missing og:images, rebuild "feed" if any
// articles changed, then write "feed" and "state" in that order.

import { TTL_MINUTES, type Source } from './sources.ts';
import { fetchFeed, lookupOg, OG_POOL } from './feeds/fetch.ts';
import { buildFeed, enabledSources } from './pipeline/build.ts';
import { pool } from './pool.ts';
import { trimSource } from './pipeline/trim.ts';
import { gate } from './pipeline/gate.ts';
import { FEED_KEY, readState, STATE_KEY, type Env } from './store.ts';
import { STATE_VERSION, type Article, type SourceState, type State } from './types.ts';

const MIN = 60_000;
const DUE_MS = TTL_MINUTES * MIN;
const RETRY_MS = 5 * MIN;
const MAX_AGE_MS = 24 * 60 * MIN;
const RUN_DEADLINE_MS = 40_000;

export function isDue(st: SourceState | undefined, now: number): boolean {
  if (!st) return true;
  const since = now - st.checked_at;
  return since >= DUE_MS || (st.failures > 0 && since >= RETRY_MS);
}

const emptyState = (): SourceState => ({
  checked_at: 0,
  ok_at: null,
  full_at: null,
  status: 'new',
  failures: 0,
  etag: null,
  last_modified: null,
  articles: [],
  og: {},
});

/** The Cloudflare data center this run executes in (cron runs land anywhere). */
async function dataCenter(): Promise<string | null> {
  try {
    const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(2000) });
    return /^colo=(\w+)$/m.exec(await res.text())?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface RunSummary {
  run_seq: number;
  colo: string | null;
  full: boolean;
  state_age_ms: number | null;
  fetched: Record<string, string>;
  og_lookups: number;
  gate_dropped: number;
  aged_out: string[];
  feed_written: boolean;
  state_written: boolean;
  articles: number | null;
}

export async function runCron(env: Env, now = Date.now()): Promise<RunSummary> {
  // Wall clock, not `now`: `now` is the run's logical time (tests set it).
  const deadline = Date.now() + RUN_DEADLINE_MS;
  const prev = await readState(env.CACHE);
  const full = prev === null;
  if (full && (await env.CACHE.get(FEED_KEY)) !== null) {
    console.error(JSON.stringify({ msg: 'state missing or unreadable while feed exists: full run' }));
  }
  const sources = enabledSources();
  const prevBy = prev?.sources ?? {};
  const next: Record<string, SourceState> = {};
  for (const s of sources) if (Object.hasOwn(prevBy, s.id)) next[s.id] = prevBy[s.id];

  // Step 2 and 3: fetch every due feed, six at a time.
  const due = sources.filter((s) => full || isDue(next[s.id], now));
  const colo = due.length ? await dataCenter() : null;
  const results = await pool(due, OG_POOL, deadline, (s) => {
    const st = next[s.id] ?? emptyState();
    return fetchFeed(s, { etag: st.etag, last_modified: st.last_modified, full_at: st.full_at }, now);
  });

  const fetched: Record<string, string> = {};
  const fresh = new Map<Source, Article[]>();
  let changed = full;
  for (const s of due) {
    const r = results.get(s);
    if (!r) continue; // not reached before the deadline: due again next run
    const st = next[s.id] ?? emptyState();
    if (r.kind === 'not_modified') {
      next[s.id] = { ...st, checked_at: now, ok_at: now, status: 'not_modified', failures: 0, colo };
      fetched[s.id] = 'not_modified';
    } else if (r.kind === 'error') {
      next[s.id] = { ...st, checked_at: now, status: r.status, failures: st.failures + 1, colo };
      fetched[s.id] = r.status;
      if (r.detail) console.warn(JSON.stringify({ msg: 'feed error', source: s.id, status: r.status, detail: r.detail }));
    } else {
      // Roundups skipped, then the newest 30 within 7 days, before any og lookups.
      fresh.set(s, trimSource(r.articles.filter((a) => !s.skipTitle?.test(a.title)), now, s.maxItems));
      next[s.id] = {
        ...st,
        checked_at: now,
        ok_at: now,
        full_at: now,
        status: 'ok',
        failures: 0,
        colo,
        // Python kept the old validators when a response sent none.
        etag: r.etag ?? st.etag,
        last_modified: r.lastModified ?? st.last_modified,
      };
      fetched[s.id] = `ok ${r.articles.length}`;
    }
  }

  // og:image for articles without a feed image: carry earlier answers over by
  // URL, look up the rest through one pool of six for the whole run.
  const wanted: string[] = [];
  for (const [s, articles] of fresh) {
    const og = next[s.id].og;
    for (const a of articles) if (!a.image_url && !Object.hasOwn(og, a.url)) wanted.push(a.url);
  }
  const looked = await lookupOg([...new Set(wanted)].slice(0, 400), deadline);

  let gateDropped = 0;
  for (const [s, articles] of fresh) {
    const st = next[s.id];
    const og: Record<string, string> = {};
    const kept: Article[] = [];
    for (const a of articles) {
      if (!a.image_url) {
        const known = Object.hasOwn(st.og, a.url) ? st.og[a.url] : looked.get(a.url);
        if (known !== undefined) og[a.url] = known;
        a.image_url = known || null;
      }
      const g = gate(a);
      if ('article' in g) kept.push(g.article);
      else {
        gateDropped++;
        console.warn(JSON.stringify({ msg: 'gate dropped article', source: s.id, reason: g.reason, url: a.url }));
      }
    }
    if (JSON.stringify(kept) !== JSON.stringify(st.articles)) changed = true;
    next[s.id] = { ...st, articles: kept, og };
  }

  // Step 4: a source with no success for 24 hours loses its articles.
  const agedOut: string[] = [];
  for (const [id, st] of Object.entries(next)) {
    if (st.articles.length && (st.ok_at === null || now - st.ok_at > MAX_AGE_MS)) {
      next[id] = { ...st, articles: [] };
      agedOut.push(id);
      changed = true;
    }
  }
  if (Object.keys(prevBy).some((id) => !Object.hasOwn(next, id))) changed = true;

  // Step 6 and 7: feed first, then state.
  let feedWritten = false;
  let articleCount: number | null = null;
  if (changed) {
    const feed = buildFeed(new Map(Object.entries(next).map(([id, st]) => [id, st.articles])), now);
    await env.CACHE.put(FEED_KEY, JSON.stringify(feed));
    feedWritten = true;
    articleCount = feed.lists.all?.length ?? 0;
  }
  const state: State = {
    v: STATE_VERSION,
    run_seq: (prev?.run_seq ?? 0) + 1,
    written_at: Date.now(),
    sources: next,
  };
  const stateWritten = due.length > 0 || changed;
  if (stateWritten) await env.CACHE.put(STATE_KEY, JSON.stringify(state));

  const summary: RunSummary = {
    run_seq: state.run_seq,
    colo,
    full,
    state_age_ms: prev ? now - prev.written_at : null,
    fetched,
    og_lookups: looked.size,
    gate_dropped: gateDropped,
    aged_out: agedOut,
    feed_written: feedWritten,
    state_written: stateWritten,
    articles: articleCount,
  };
  console.log(JSON.stringify({ msg: 'cron run', ...summary }));
  return summary;
}
