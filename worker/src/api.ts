// The API (spec sections 3 and 5): the paths, parameters and JSON the iOS
// app 2.0, the Android app and the site use, served from what the cron stored.

import { Hono, type Context } from 'hono';
import { CATEGORIES, SOURCES } from './sources.ts';
import { enabledSources } from './pipeline/build.ts';
import { mergeForTab } from './pipeline/merge.ts';
import { trimSource } from './pipeline/trim.ts';
import { readFeed, readState, type Env } from './store.ts';
import type { Article } from './types.ts';
import { boolParam, intParam, missing, type FieldError } from './validate.ts';
import { checkUrl } from './reader/ssrf.ts';
import { readArticle } from './reader/reader.ts';

type App = { Bindings: Env };
const app = new Hono<App>();

const LIST_CACHE = 'public, max-age=300';
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const json = (c: Context<App>, body: unknown, status = 200, cache?: string) => {
  const res = c.json(body as object, status as 200);
  if (cache) res.headers.set('Cache-Control', cache);
  return res;
};
const detail = (c: Context<App>, status: number, d: string | FieldError[]) => json(c, { detail: d }, status);

/** First value of a query key, form-decoded ("+" is a space), as Hono and URLSearchParams do. */
const q = (c: Context<App>, key: string) => new URL(c.req.url).searchParams.get(key);

const ip = (c: Context<App>) => c.req.header('cf-connecting-ip') ?? 'unknown';

app.use('*', async (c, next) => {
  const { success } = await c.env.API_LIMITER.limit({ key: ip(c) });
  if (!success) return detail(c, 429, 'Too Many Requests');
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/api/v1/categories', (c) => {
  const counts = new Map<string, number>();
  const enabled = enabledSources();
  for (const s of enabled) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const out = [];
  for (const cat of CATEGORIES) {
    if (cat.id === 'all' || cat.id === 'latest') out.push({ id: cat.id, name: cat.name, source_count: enabled.length });
    else if (counts.get(cat.id)) out.push({ id: cat.id, name: cat.name, source_count: counts.get(cat.id)! });
  }
  return json(c, out, 200, LIST_CACHE);
});

app.get('/api/v1/sources', (c) =>
  json(
    c,
    SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      category: s.category,
      enabled: s.enabled,
      is_curated_positive: s.isCuratedPositive,
    })),
    200,
    LIST_CACHE,
  ),
);

app.get('/api/v1/articles', async (c) => {
  const errors: FieldError[] = [];
  const category = q(c, 'category') ?? 'all';
  const source = q(c, 'source') || null;
  const search = q(c, 'search');
  const page = intParam(errors, 'page', q(c, 'page'), 1, { ge: 1 });
  const perPage = intParam(errors, 'per_page', q(c, 'per_page'), 20, { ge: 1, le: 50 });
  const refreshRaw = q(c, 'refresh');
  boolParam(errors, 'refresh', refreshRaw);
  if (errors.length) return detail(c, 422, errors);

  let articles: Article[];
  let complete = true;
  // The first tab without a search also says when its brief was built (#414 step 3, for the web).
  const isToday = category === 'all' && !source && !search?.trim();
  let briefAt: number | null = null;
  if (source) {
    // No client sends source; it is computed from state exactly as before (O16).
    const s = SOURCES.find((x) => x.id === source);
    const state = s?.enabled ? await readState(c.env.CACHE) : null;
    const st = state && Object.hasOwn(state.sources, source) ? state.sources[source] : undefined;
    articles = st ? mergeForTab([trimSource(st.articles, Date.now(), s?.maxItems)], category) : [];
  } else {
    const feed = await readFeed(c.env.CACHE);
    if (!feed) {
      articles = [];
      complete = false;
    } else {
      // Search from the first tab (no category) covers every article, not just Today's brief.
      const tab = search?.trim() && category === 'all' && Object.hasOwn(feed.lists, 'latest') ? 'latest' : category;
      const idx = Object.hasOwn(feed.lists, tab) ? feed.lists[tab] : [];
      articles = idx.map((i) => feed.articles[i]);
      briefAt = feed.brief_at ?? null;
    }
  }

  if (search) {
    const term = search.trim().toLowerCase();
    if (term) {
      articles = articles.filter(
        (a) => a.title.toLowerCase().includes(term) || (a.summary ?? '').toLowerCase().includes(term),
      );
    }
  }
  const total = articles.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const body = {
    articles: articles.slice(start, start + perPage),
    pagination: { page, per_page: perPage, total, total_pages: totalPages },
    complete,
    ...(isToday ? { brief_at: iso(briefAt) } : {}),
  };
  const cache = refreshRaw === 'true' || !complete ? 'no-store' : LIST_CACHE;
  return json(c, body, 200, cache);
});

app.get('/api/v1/articles/reader', async (c) => {
  const url = q(c, 'url');
  if (url === null) return detail(c, 422, [missing('url')]);
  const { success } = await c.env.READER_LIMITER.limit({ key: ip(c) });
  if (!success) return detail(c, 429, 'Too Many Requests');
  const own = [new URL(c.req.url).hostname];
  const check = await checkUrl(url, own);
  if (!check.ok) return detail(c, 400, check.detail);
  const feed = await readFeed(c.env.CACHE);
  const meta = feed?.articles.find((a) => a.url === url);
  return c.json(await readArticle(url, meta, own));
});

app.get('/api/v1/status', async (c) => {
  const [feed, state] = await Promise.all([readFeed(c.env.CACHE), readState(c.env.CACHE)]);
  return c.json({
    feed_built_at: iso(feed?.built_at),
    articles: (feed?.lists.latest ?? feed?.lists.all)?.length ?? 0,
    today_built_at: iso(feed?.brief_at),
    today_stories: feed?.brief_at ? feed.lists.all.length : 0,
    state_written_at: iso(state?.written_at),
    run_seq: state?.run_seq ?? null,
    sources: enabledSources().map((s) => {
      const st = state && Object.hasOwn(state.sources, s.id) ? state.sources[s.id] : undefined;
      return {
        id: s.id,
        status: st?.status ?? null,
        colo: st?.colo ?? null,
        ok_at: iso(st?.ok_at),
        checked_at: iso(st?.checked_at),
        failures: st?.failures ?? null,
        articles: st?.articles.length ?? 0,
      };
    }),
  });
});

const KNOWN = new Set([
  '/health',
  '/api/v1/categories',
  '/api/v1/sources',
  '/api/v1/articles',
  '/api/v1/articles/reader',
  '/api/v1/status',
]);

app.notFound((c) => {
  const url = new URL(c.req.url);
  if (url.pathname.endsWith('/') && KNOWN.has(url.pathname.slice(0, -1))) {
    return c.redirect(`${url.pathname.slice(0, -1)}${url.search}`, 301);
  }
  if (KNOWN.has(url.pathname)) {
    const res = detail(c, 405, 'Method Not Allowed');
    res.headers.set('Allow', 'GET');
    return res;
  }
  return detail(c, 404, 'Not Found');
});

app.onError((err, c) => {
  console.error(JSON.stringify({ msg: 'api error', path: new URL(c.req.url).pathname, error: String(err) }));
  return detail(c, 500, 'Internal Server Error');
});

export default app;
