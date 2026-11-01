import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildFeed } from '../src/pipeline/build.ts';
import { FEED_KEY } from '../src/store.ts';
import type { Article } from '../src/types.ts';

const BASE = 'https://getclearnews.com';
const get = (path: string, init?: RequestInit) => SELF.fetch(`${BASE}${path}`, { redirect: 'manual', ...init });

const art = (i: number, o: Partial<Article> = {}): Article => ({
  title: `Alpha${i} bravo${i} charlie${i}`,
  summary: i % 2 ? `Summary ${i}` : null,
  url: `https://www.theverge.com/${i}`,
  image_url: null,
  source_id: 'the-verge',
  source_name: 'The Verge',
  source_type: 'rss',
  category: 'tech',
  sentiment: null,
  published_at: `2026-11-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
  ...o,
});

async function seed(n = 45) {
  const verge = Array.from({ length: n }, (_, i) => art(i));
  const bbc = [art(100, { url: 'https://bbc.test/h', source_id: 'bbc-health', source_name: 'BBC Health', category: 'health', title: 'Health news today' })];
  const feed = buildFeed(new Map([['the-verge', verge], ['bbc-health', bbc]]), Date.now());
  await env.CACHE.put(FEED_KEY, JSON.stringify(feed));
}

const SEC = [
  'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options',
  'x-xss-protection', 'referrer-policy', 'permissions-policy',
];
const expectSecurity = (res: Response) => {
  for (const h of SEC) expect(res.headers.get(h), h).toBeTruthy();
  expect(res.headers.get('content-security-policy')).not.toContain('unsafe-eval');
};

describe('health, categories, sources', () => {
  it('/health is exactly {"status":"ok"}', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"status":"ok"}');
    expectSecurity(res);
  });
  it('categories: bare array, Today (id all) then Latest first, Finance listed (its RSS feeds replace FMP)', async () => {
    const res = await get('/api/v1/categories');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const cats = (await res.json()) as { id: string; name: string; source_count: number }[];
    expect(cats[0]).toEqual({ id: 'all', name: 'Today', source_count: expect.any(Number) });
    expect(cats[1]).toEqual({ id: 'latest', name: 'Latest', source_count: cats[0].source_count });
    expect(cats.map((c) => c.id)).toContain('finance');
    expect(Object.keys(cats[1])).toEqual(['id', 'name', 'source_count']);
  });
  it('sources: every configured source with the old field names', async () => {
    const res = await get('/api/v1/sources');
    const list = (await res.json()) as Record<string, unknown>[];
    expect(Object.keys(list[0])).toEqual(['id', 'name', 'type', 'category', 'enabled', 'is_curated_positive']);
    expect(list.some((s) => s.type === 'financial_api')).toBe(false);
  });
});

describe('articles', () => {
  beforeEach(() => seed());

  it('keeps the response shape, field order and pagination math', async () => {
    const res = await get('/api/v1/articles?category=tech&page=2&per_page=20');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await res.json()) as { articles: Article[]; pagination: Record<string, number>; complete: boolean };
    expect(Object.keys(body)).toEqual(['articles', 'pagination', 'complete']);
    // 45 seeded from one source; a source shows at most its newest 30 (#413).
    expect(body.pagination).toEqual({ page: 2, per_page: 20, total: 30, total_pages: 2 });
    expect(body.complete).toBe(true);
    // The apps' fields in their old order, then two for the web (#414); the apps ignore unknown keys.
    expect(Object.keys(body.articles[0])).toEqual([
      'title', 'summary', 'url', 'image_url', 'source_id', 'source_name', 'source_type', 'category', 'sentiment', 'published_at',
      'topics', 'coverage',
    ]);
    expect(body.articles[0].sentiment).toBeNull();
  });
  it('past the end: empty list, totals kept; unknown and prototype categories: empty 200 (R11)', async () => {
    let b = (await (await get('/api/v1/articles?page=99&per_page=50')).json()) as { articles: unknown[]; pagination: Record<string, number> };
    expect(b.articles).toEqual([]);
    expect(b.pagination.total_pages).toBe(1);
    for (const cat of ['nope', 'constructor', '__proto__', 'toString']) {
      const res = await get(`/api/v1/articles?category=${cat}`);
      expect(res.status, cat).toBe(200);
      b = (await res.json()) as typeof b;
      expect(b.pagination).toEqual({ page: 1, per_page: 20, total: 0, total_pages: 1 });
    }
  });
  it('search: trimmed, case-insensitive, title or summary; "+" decodes to a space', async () => {
    const b = (await (await get('/api/v1/articles?search=%20HEALTH%20')).json()) as { articles: Article[] };
    expect(b.articles.map((a) => a.url)).toEqual(['https://bbc.test/h']);
    const plus = (await (await get('/api/v1/articles?search=health+news')).json()) as { articles: Article[] };
    expect(plus.articles).toHaveLength(1);
  });
  it('refresh=true answers no-store and complete true', async () => {
    const res = await get('/api/v1/articles?refresh=true');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as { complete: boolean }).complete).toBe(true);
  });
  it('FastAPI 422 bodies, with no-store', async () => {
    const cases: [string, unknown][] = [
      ['page=0', { type: 'greater_than_equal', loc: ['query', 'page'], msg: 'Input should be greater than or equal to 1', input: '0', ctx: { ge: 1 } }],
      ['per_page=500', { type: 'less_than_equal', loc: ['query', 'per_page'], msg: 'Input should be less than or equal to 50', input: '500', ctx: { le: 50 } }],
      ['page=abc', { type: 'int_parsing', loc: ['query', 'page'], msg: 'Input should be a valid integer, unable to parse string as an integer', input: 'abc' }],
      ['refresh=abc', { type: 'bool_parsing', loc: ['query', 'refresh'], msg: 'Input should be a valid boolean, unable to interpret input', input: 'abc' }],
    ];
    for (const [qs, err] of cases) {
      const res = await get(`/api/v1/articles?${qs}`);
      expect(res.status, qs).toBe(422);
      expect(await res.json()).toEqual({ detail: [err] });
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('dates leave as YYYY-MM-DDTHH:MM:SSZ', async () => {
    const b = (await (await get('/api/v1/articles?per_page=50')).json()) as { articles: Article[] };
    for (const a of b.articles) expect(a.published_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe('Today and Latest (#414)', () => {
  it('Today serves the brief; Latest the full list; search from the first tab covers Latest', async () => {
    const now = Date.now();
    const iso = (h: number) => new Date(now - h * 3600e3).toISOString().slice(0, 19) + 'Z';
    const verge = Array.from({ length: 12 }, (_, i) => art(i, { published_at: iso(i + 1) }));
    const bbc = [art(100, { url: 'https://bbc.test/h', source_id: 'bbc-health', source_name: 'BBC Health', category: 'health', title: 'Health news today', published_at: iso(2) })];
    const brief = { at: now, urls: [verge[3].url, bbc[0].url] };
    const feed = buildFeed(new Map([['the-verge', verge], ['bbc-health', bbc]]), now, { v: 1, items: {}, brief });
    await env.CACHE.put(FEED_KEY, JSON.stringify(feed));
    const today = (await (await get('/api/v1/articles')).json()) as { articles: Article[]; brief_at?: string | null };
    expect(today.articles.map((a) => a.url)).toEqual(brief.urls);
    // For the web's Today page (step 3): only the first tab without a search says when its brief was built.
    expect(Object.keys(today)).toEqual(['articles', 'pagination', 'complete', 'brief_at']);
    expect(today.brief_at).toBe(new Date(now).toISOString());
    const latest = (await (await get('/api/v1/articles?category=latest&per_page=50')).json()) as { pagination: { total: number } };
    expect(latest.pagination.total).toBe(13);
    const found = (await (await get('/api/v1/articles?search=Alpha7')).json()) as { articles: Article[] };
    expect(found.articles.map((a) => a.url)).toEqual([verge[7].url]);
    expect(Object.keys(found)).toEqual(['articles', 'pagination', 'complete']);
    const inTab = (await (await get('/api/v1/articles?category=health&search=Alpha7')).json()) as { articles: Article[] };
    expect(inTab.articles).toEqual([]);
  });
  it('without a brief, Today shows the full list and brief_at is null', async () => {
    const now = Date.now();
    const verge = Array.from({ length: 3 }, (_, i) => art(i, { published_at: new Date(now - (i + 1) * 3600e3).toISOString().slice(0, 19) + 'Z' }));
    await env.CACHE.put(FEED_KEY, JSON.stringify(buildFeed(new Map([['the-verge', verge]]), now)));
    const today = (await (await get('/api/v1/articles')).json()) as { articles: Article[]; brief_at: string | null };
    expect(today.articles).toHaveLength(3);
    expect(today.brief_at).toBeNull();
  });
});

describe('articles before the first cron run', () => {
  it('empty page, complete false, no-store, so the apps retry after 3 s', async () => {
    await env.CACHE.delete(FEED_KEY);
    const res = await get('/api/v1/articles');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ articles: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 }, complete: false, brief_at: null });
  });
});

describe('routing', () => {
  it('HEAD answers like GET without a body', async () => {
    const res = await get('/api/v1/categories', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
  it('other methods: 405 with Allow: GET; unknown API path: 404 detail', async () => {
    const post = await get('/api/v1/articles', { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
    expect(await post.json()).toEqual({ detail: 'Method Not Allowed' });
    const nope = await get('/api/v1/nope');
    expect(nope.status).toBe(404);
    expect(await nope.json()).toEqual({ detail: 'Not Found' });
  });
  it('trailing slash on a known API path: 301 without it, query kept (O19)', async () => {
    const res = await get('/api/v1/categories/?x=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toMatch(/\/api\/v1\/categories\?x=1$/);
  });
  it('www redirects to the apex with path and query', async () => {
    const res = await SELF.fetch('https://www.getclearnews.com/article?url=https%3A%2F%2Fa.test', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://getclearnews.com/article?url=https%3A%2F%2Fa.test');
    expectSecurity(res);
  });
  it('reader: missing url is FastAPI 422, bad scheme 400', async () => {
    const missing = await get('/api/v1/articles/reader');
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['query', 'url'], msg: 'Field required', input: null }] });
    const ftp = await get('/api/v1/articles/reader?url=ftp%3A%2F%2Fexample.com%2F');
    expect(ftp.status).toBe(400);
    expect(await ftp.json()).toEqual({ detail: 'URL scheme not allowed' });
  });
});

describe('the site', () => {
  it('pages and the app-linked static pages carry the security headers', async () => {
    for (const path of ['/', '/about', '/article?url=https%3A%2F%2Fa.test', '/privacy', '/support']) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type'), path).toContain('text/html');
      expectSecurity(res);
    }
  });
  it('the privacy page no longer mentions financial APIs and still says no analytics', async () => {
    const html = await (await get('/privacy')).text();
    expect(html).not.toMatch(/financial news APIs/);
    expect(html).toMatch(/not<\/strong> use analytics/);
  });
  it('no Google Analytics anywhere in the home page', async () => {
    expect(await (await get('/')).text()).not.toContain('googletagmanager');
  });
  it('unknown page: the export 404 page with status 404 and no-store', async () => {
    const res = await get('/no-such-page');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expectSecurity(res);
  });
  it('files that must not be served are not', async () => {
    expect((await get('/social-card.html')).status).toBe(404);
  });
});
