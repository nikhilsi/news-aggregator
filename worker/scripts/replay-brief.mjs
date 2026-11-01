#!/usr/bin/env node
// Replays the Today brief (#414) on production's stored data with the real
// models, so a prompt or rule change can be tried before it is deployed.
// Read-only: it reads the KV keys "state" and "ai" and writes nothing.
//   node scripts/replay-brief.mjs [runs]           the brief with the code on disk, 3 runs by default
//   node scripts/replay-brief.mjs [runs] relabel   first relabel every stored article with the label prompt on disk
// Runs the Worker's TypeScript directly (Node 22.18 or later). Needs the ClearNews
// token with Workers AI Read (added Nov 1, 2026). Each run costs about 30 Neurons,
// a relabel about 1,000.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { askEditor, pickBrief, shortlist } from '../src/ai/brief.ts';
import { LABEL_BATCH, labelBatch } from '../src/ai/labels.ts';
import { groupStories } from '../src/ai/stories.ts';
import { isNonLatin } from '../src/pipeline/merge.ts';
import { SOURCES } from '../src/sources.ts';
import { AI_VERSION } from '../src/types.ts';

const runs = Number(process.argv[2] ?? 3);
const relabel = process.argv.includes('relabel');

const env = {};
for (const line of readFileSync(join(homedir(), '.secrets/cloudflare/clearnews.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const api = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
const auth = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
const kvId = /"binding":\s*"CACHE",\s*"id":\s*"(\w+)"/.exec(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))[1];

async function kv(key) {
  const res = await fetch(`${api}/storage/kv/namespaces/${kvId}/values/${key}`, { headers: auth });
  if (!res.ok) throw new Error(`KV ${key}: ${res.status}`);
  return res.json();
}

/** Workers AI over REST, in the shape the binding has. */
const ai = {
  async run(model, inputs) {
    const res = await fetch(`${api}/ai/run/${model}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(inputs),
    });
    const body = await res.json();
    if (!body.success) throw new Error(`${model}: ${JSON.stringify(body.errors)}`);
    return body.result;
  },
};

const [state, store] = await Promise.all([kv('state'), kv('ai')]);
if (store.v !== AI_VERSION) console.log(`note: stored labels are version ${store.v}, the code is version ${AI_VERSION}`);
const now = Date.now();
const enabled = new Set(SOURCES.filter((s) => s.enabled).map((s) => s.id));
// As the cron does: every enabled source's articles, without non-Latin headlines.
const articles = Object.entries(state.sources)
  .filter(([id]) => enabled.has(id))
  .flatMap(([, st]) => st.articles)
  .filter((a) => !isNonLatin(a.title));
const items = store.items;

if (relabel) {
  const byUrl = new Map();
  for (const a of articles) if (!byUrl.has(a.url)) byUrl.set(a.url, a);
  const newest = [...byUrl.values()].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const batches = [];
  for (let i = 0; i < newest.length; i += LABEL_BATCH) batches.push(newest.slice(i, i + LABEL_BATCH));
  const fresh = new Map();
  for (let i = 0; i < batches.length; i += 8) {
    const results = await Promise.allSettled(batches.slice(i, i + 8).map((b) => labelBatch(ai, b)));
    for (const r of results) {
      if (r.status === 'fulfilled') for (const [url, it] of r.value) fresh.set(url, it);
      else console.log('label batch failed:', String(r.reason).slice(0, 160));
    }
  }
  const count = (label) => {
    const c = {};
    for (const url of fresh.keys()) if (label(url)) for (const x of [].concat(label(url))) c[x] = (c[x] ?? 0) + 1;
    return JSON.stringify(c);
  };
  console.log(`RELABEL: ${fresh.size} of ${newest.length} articles`);
  console.log(`kinds before  ${count((u) => items[u]?.k)}\nkinds after   ${count((u) => fresh.get(u).k)}`);
  console.log(`topics before ${count((u) => items[u]?.t)}\ntopics after  ${count((u) => fresh.get(u).t)}`);
  console.log('changed (before -> after):');
  for (const a of newest) {
    const was = items[a.url], is = fresh.get(a.url);
    if (!was || !is || (was.k === is.k && was.t.join() === is.t.join())) continue;
    console.log(`  ${was.k} ${was.t.join(',')} -> ${is.k} ${is.t.join(',')} | ${a.source_id} | ${a.title.slice(0, 80)}`);
  }
  for (const [url, it] of fresh) items[url] = { ...it, ...(items[url]?.e ? { e: items[url].e } : {}) };
}

const order = new Map(SOURCES.map((s, i) => [s.id, i]));
const list = shortlist(groupStories(articles, items, now).values(), items, order, now);
console.log('\nSHORTLIST (score, outlets, source, title, topics)');
list.forEach((c, i) => console.log(`${i}. ${c.score.toFixed(2)} [${c.outlets.length}] ${c.rep.source_name} | ${c.rep.title.slice(0, 80)} | ${c.topics.join(',')}`));
for (let r = 1; r <= runs; r++) {
  const picks = await askEditor(ai, list);
  console.log(`\nRUN ${r}: editor picks ${JSON.stringify(picks)}`);
  pickBrief(list, picks).forEach((c, i) => console.log(`${i + 1}. ${c.rep.source_name} | ${c.rep.title.slice(0, 85)} | ${c.topics.join(',')}`));
}
