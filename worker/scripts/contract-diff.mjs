#!/usr/bin/env node
// Contract diff (spec section 9): the same read-only calls against the droplet
// and the Worker, compared on status, Content-Type, Cache-Control and JSON
// shape (keys, key order, types). Error bodies are compared exactly. Article
// lists are compared on shape only, since two live systems hold different
// items; "sources" adds per-source article totals side by side.
//   node scripts/contract-diff.mjs [old=https://getclearnews.com] [new=<workers.dev>] [sources]

const opt = (k, d) => process.argv.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const OLD = opt('old', 'https://getclearnews.com');
const NEW = opt('new', 'https://clearnews.nikhil-58a.workers.dev');

// Differences the spec lists on purpose (section 3).
const EXPECTED = [
  [/cache-control/, /^4\d\d$/, 'errors are no-store now (O6)'],
  [/body/, /\/api\/v1\/sources$/, 'FMP sources removed, finance feeds added'],
  [/body/, /\/api\/v1\/categories$/, 'Finance hidden until its feeds are on; counts differ'],
];

async function call(base, path) {
  const r = await fetch(base + path, { redirect: 'manual', headers: { 'User-Agent': 'okhttp/4.12.0' } });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: r.status,
    type: (r.headers.get('content-type') ?? '').split(';')[0],
    cache: r.headers.get('cache-control'),
    json,
  };
}

/** Shape: every path with the set of JSON types seen there, and key order per object path. */
function shape(v, path = '$', out = new Map(), order = new Map()) {
  const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  if (!out.has(path)) out.set(path, new Set());
  out.get(path).add(t);
  if (t === 'array') v.forEach((x) => shape(x, `${path}[]`, out, order));
  if (t === 'object') {
    const keys = Object.keys(v).join(',');
    if (!order.has(path)) order.set(path, new Set());
    order.get(path).add(keys);
    for (const [k, x] of Object.entries(v)) shape(x, `${path}.${k}`, out, order);
  }
  return { types: out, order };
}

const cats = (await (await fetch(`${NEW}/api/v1/categories`)).json()).map((c) => c.id);
const paths = [
  '/health',
  '/api/v1/categories',
  '/api/v1/sources',
  '/api/v1/articles',
  '/api/v1/articles?page=2&per_page=20',
  '/api/v1/articles?per_page=50',
  ...cats.map((c) => `/api/v1/articles?category=${c}&page=1&per_page=20`),
  '/api/v1/articles?search=the&per_page=20',
  '/api/v1/articles?page=99999&per_page=50',
  '/api/v1/articles?category=nope',
  '/api/v1/articles?source=nope',
  '/api/v1/articles?page=0',
  '/api/v1/articles?per_page=500',
  '/api/v1/articles?page=abc',
  '/api/v1/articles?refresh=abc',
  '/api/v1/articles/reader',
  '/api/v1/articles/reader?url=ftp%3A%2F%2Fexample.com%2F',
  '/api/v1/articles/reader?url=http%3A%2F%2F127.0.0.1%2Fadmin',
  '/api/v1/nope',
];

let compared = 0;
const diffs = [];
const note = (path, what, detail) => {
  const exp = EXPECTED.find(([w, p]) => w.test(what) && (p.test(path) || p.test(String(detail.status))));
  diffs.push({ path, what, detail: detail.text, expected: exp?.[2] });
};

for (const path of paths) {
  const [a, b] = await Promise.all([call(OLD, path), call(NEW, path)]);
  compared++;
  if (a.status !== b.status) note(path, 'status', { text: `${a.status} vs ${b.status}` });
  if (a.type !== b.type) note(path, 'content-type', { text: `${a.type} vs ${b.type}` });
  if (a.cache !== b.cache) note(path, 'cache-control', { text: `${a.cache} vs ${b.cache}`, status: b.status });
  if (a.status >= 400) {
    if (JSON.stringify(a.json) !== JSON.stringify(b.json)) note(path, 'error body', { text: `${JSON.stringify(a.json)} vs ${JSON.stringify(b.json)}` });
    continue;
  }
  if (a.json === undefined || b.json === undefined) continue;
  const sa = shape(a.json);
  const sb = shape(b.json);
  for (const [p, types] of sb.types) {
    const old = sa.types.get(p);
    if (!old) note(path, 'body', { text: `new path ${p} (${[...types]})` });
    else for (const t of types) if (!old.has(t) && !(t === 'null' || old.has('null'))) note(path, 'body', { text: `${p}: new type ${t}, old ${[...old]}` });
  }
  for (const p of sa.types.keys()) if (!sb.types.has(p) && !p.includes('[]')) note(path, 'body', { text: `missing ${p}` });
  for (const [p, orders] of sb.order) {
    const old = sa.order.get(p);
    if (old && [...orders].some((o) => !old.has(o))) note(path, 'body', { text: `key order at ${p}` });
  }
  if (path === '/api/v1/sources' || path === '/api/v1/categories') {
    if (JSON.stringify(a.json) !== JSON.stringify(b.json)) note(path, 'body', { text: 'content differs' });
  }
}

console.log(`${OLD} vs ${NEW}: ${compared} calls`);
const unexpected = diffs.filter((d) => !d.expected);
for (const d of diffs) console.log(`${d.expected ? 'expected ' : 'DIFF     '} ${d.path}  ${d.what}: ${d.detail}${d.expected ? `  (${d.expected})` : ''}`);
console.log(`\n${unexpected.length} unexpected differences`);

if (process.argv.includes('sources')) {
  const ids = (await (await fetch(`${NEW}/api/v1/sources`)).json()).filter((s) => s.enabled).map((s) => s.id);
  console.log('\nper-source totals (droplet vs worker):');
  for (const id of ids) {
    const [x, y] = await Promise.all([OLD, NEW].map(async (b) => (await (await fetch(`${b}/api/v1/articles?source=${id}&per_page=1`)).json()).pagination.total));
    console.log(`${id.padEnd(24)} ${String(x).padStart(4)} ${String(y).padStart(4)}${y < x ? '   <- fewer on the Worker' : ''}`);
  }
}
process.exit(unexpected.length ? 1 : 0);
