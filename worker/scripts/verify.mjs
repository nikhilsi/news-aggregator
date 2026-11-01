#!/usr/bin/env node
// Live checks against a deployed Worker (spec section 9). Read-only GETs.
//   node scripts/verify.mjs [https://getclearnews.com]
// Default base: production. Exits 1 on any failure.

const BASE = process.argv[2] ?? 'https://getclearnews.com';
const PROD = new URL(BASE).hostname === 'getclearnews.com';

// The apps' own user agents, with no browser headers (review R1).
const IOS_UA = 'GetClearNews/2 CFNetwork/3826.500.111 Darwin/24.4.0';
const ANDROID_UA = 'okhttp/4.12.0';
const SECURITY = [
  'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options',
  'referrer-policy', 'permissions-policy',
];
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

let pass = 0;
const fails = [];
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fails.push(`${name}${info ? `: ${info}` : ''}`);
};
const get = (path, headers = {}) => fetch(BASE + path, { headers, redirect: 'manual' });

// Health and the app paths, as each client sends them.
{
  const r = await get('/health');
  check('/health 200', r.status === 200, r.status);
  check('/health body', (await r.text()) === '{"status":"ok"}');
  for (const h of SECURITY) check(`/health ${h}`, r.headers.has(h));
}
for (const [who, ua] of [['ios', IOS_UA], ['android', ANDROID_UA]]) {
  for (const path of ['/api/v1/categories', '/api/v1/articles?page=1&per_page=20', '/api/v1/articles?category=india&page=2&per_page=20']) {
    const r = await get(path, { 'User-Agent': ua });
    const type = r.headers.get('content-type') ?? '';
    check(`${who} ${path}`, r.status === 200 && type.includes('application/json'), `${r.status} ${type}`);
  }
}

// Categories and articles.
const cats = await (await get('/api/v1/categories')).json();
check('categories: all first', cats[0]?.id === 'all');
check('categories: finance listed', cats.some((c) => c.id === 'finance'), 'Finance hidden: no finance source enabled');
{
  const r = await get('/api/v1/articles?per_page=50');
  const b = await r.json();
  check('articles complete', b.complete === true, `complete=${b.complete}`);
  check('articles cache-control', r.headers.get('cache-control') === 'public, max-age=300', r.headers.get('cache-control'));
  check('articles keys', JSON.stringify(Object.keys(b.articles[0] ?? {})) ===
    '["title","summary","url","image_url","source_id","source_name","source_type","category","sentiment","published_at"]');
  check('articles dates', b.articles.every((a) => a.published_at === null || DATE.test(a.published_at)));
  check('articles total', b.pagination.total > 500, `total=${b.pagination.total}`);
}
{
  const r = await get('/api/v1/articles?refresh=true&per_page=1');
  check('refresh no-store', r.headers.get('cache-control') === 'no-store');
}
{
  const r = await get('/api/v1/articles?page=0');
  check('422 on page=0', r.status === 422 && (await r.json()).detail?.[0]?.type === 'greater_than_equal');
}

// Feed freshness (review R3).
{
  const s = await (await get('/api/v1/status')).json();
  const age = s.feed_built_at ? (Date.now() - Date.parse(s.feed_built_at)) / 60000 : Infinity;
  check('feed built within 30 minutes', age < 30, `built ${s.feed_built_at}`);
  const stale = s.sources.filter((x) => !x.ok_at || Date.now() - Date.parse(x.ok_at) > 24 * 3600e3).map((x) => x.id);
  check('every source succeeded in the last 24 hours', stale.length === 0, stale.join(', '));
  const failing = s.sources.filter((x) => x.status && !['ok', 'not_modified'].includes(x.status)).map((x) => `${x.id}=${x.status}`);
  if (failing.length) console.log(`note: sources failing right now: ${failing.join(', ')}`);
}

// Reader on the newest article.
{
  const b = await (await get('/api/v1/articles?category=health&per_page=1')).json();
  const url = b.articles[0]?.url;
  if (url) {
    const r = await get(`/api/v1/articles/reader?url=${encodeURIComponent(url)}`);
    const d = await r.json();
    check('reader 200 with status', r.status === 200 && ['ok', 'failed'].includes(d.status), `${r.status} ${d.status} ${d.reason ?? ''}`);
  }
  const bad = await get('/api/v1/articles/reader?url=http%3A%2F%2F127.0.0.1%2F');
  check('reader blocks 127.0.0.1', bad.status === 400);
}

// The site.
for (const path of ['/', '/about', '/article?url=https%3A%2F%2Fexample.com', '/privacy', '/support']) {
  const r = await get(path);
  check(`${path} 200 html`, r.status === 200 && (r.headers.get('content-type') ?? '').includes('text/html'), r.status);
  for (const h of SECURITY) check(`${path} ${h}`, r.headers.has(h));
  check(`${path} no unsafe-eval`, !(r.headers.get('content-security-policy') ?? '').includes('unsafe-eval'));
  if (path === '/') check('no GA tag', !(await r.text()).includes('googletagmanager'));
}
{
  const r = await get('/no-such-page');
  check('404 page', r.status === 404);
}
{
  const r = await get('/_next/static/does-not-matter.js');
  check('static 404 for missing file', r.status === 404);
}

// Redirects on the real hostnames only.
if (PROD) {
  const www = await fetch('https://www.getclearnews.com/about?x=1', { redirect: 'manual' });
  check('www 301', www.status === 301 && www.headers.get('location') === 'https://getclearnews.com/about?x=1', `${www.status} ${www.headers.get('location')}`);
  const http = await fetch('http://getclearnews.com/about?x=1', { redirect: 'manual' });
  check('http to https', [301, 308].includes(http.status) && (http.headers.get('location') ?? '').startsWith('https://getclearnews.com/about'), `${http.status} ${http.headers.get('location')}`);
}

console.log(`\n${BASE}: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
