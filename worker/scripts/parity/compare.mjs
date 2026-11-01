// Parity check, comparison (spec section 9). Compares .fixtures/py-out.json
// (the droplet's Python pipeline) with .fixtures/ts-out.json (the Worker's),
// tab by tab and field by field, and prints every difference by kind.
//   node scripts/parity/compare.mjs [--show N]

import { readFileSync } from 'node:fs';

const fx = new URL('../../.fixtures/', import.meta.url);
const py = JSON.parse(readFileSync(new URL('py-out.json', fx), 'utf8'));
const ts = JSON.parse(readFileSync(new URL('ts-out.json', fx), 'utf8'));
const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;

const FIELDS = ['title', 'summary', 'url', 'image_url', 'source_id', 'source_name', 'source_type', 'category', 'sentiment', 'published_at'];
const diffs = new Map(); // kind -> [examples]
const add = (kind, ex) => {
  if (!diffs.has(kind)) diffs.set(kind, []);
  diffs.get(kind).push(ex);
};

let compared = 0;
for (const tab of new Set([...Object.keys(py), ...Object.keys(ts)])) {
  const a = py[tab] ?? [];
  const b = ts[tab] ?? [];
  if (!(tab in py) || !(tab in ts)) add('tab only on one side', `${tab}: py ${tab in py}, ts ${tab in ts}`);
  if (a.length !== b.length) add('list length', `${tab}: py ${a.length}, ts ${b.length}`);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    compared++;
    const x = a[i];
    const y = b[i];
    if (JSON.stringify(Object.keys(x)) !== JSON.stringify(Object.keys(y))) add('key order', `${tab}[${i}]`);
    if (x.url !== y.url) {
      add('order or membership', `${tab}[${i}] py ${x.source_id} ${x.url}\n      ts ${y.source_id} ${y.url}`);
      continue;
    }
    for (const f of FIELDS) {
      if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) {
        add(`${f} (${x.source_id})`, `${tab}[${i}] ${x.url}\n      py ${JSON.stringify(x[f])?.slice(0, 160)}\n      ts ${JSON.stringify(y[f])?.slice(0, 160)}`);
      }
    }
  }
}

console.log(`compared ${compared} article positions across ${Object.keys(py).length} tabs`);
if (!diffs.size) console.log('IDENTICAL');
for (const [kind, ex] of [...diffs.entries()].sort((p, q) => q[1].length - p[1].length)) {
  console.log(`\n${kind}: ${ex.length}`);
  for (const e of ex.slice(0, show)) console.log('  ' + e);
}
