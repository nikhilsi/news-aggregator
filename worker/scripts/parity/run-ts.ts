// Parity check, TypeScript side (spec section 9). Runs the Worker's feed
// pipeline on the recorded fixtures and writes every tab's list.
// Run with Node 26 (it runs .ts files directly), TZ=UTC:
//   TZ=UTC node scripts/parity/run-ts.ts
// Writes .fixtures/ts-out.json and .fixtures/og-wanted.json (imageless URLs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SOURCES } from '../../src/sources.ts';
import { articlesFromXml, decodeBody, ogFromHtml } from '../../src/feeds/fetch.ts';
import { buildFeed, enabledSources } from '../../src/pipeline/build.ts';
import { gate } from '../../src/pipeline/gate.ts';
import type { Article } from '../../src/types.ts';

const fx = new URL('../../.fixtures/', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, fx));

writeFileSync(
  new URL('sources.json', fx),
  JSON.stringify(SOURCES.map((s) => ({ ...s })), null, 1),
);

const bySource = new Map<string, Article[]>();
const ogWanted: string[] = [];
let ogMissing = 0;

for (const s of enabledSources()) {
  const meta = JSON.parse(read(`feeds/${s.id}.json`).toString());
  if (meta.status < 200 || meta.status >= 300) {
    bySource.set(s.id, []);
    continue;
  }
  const xml = decodeBody(new Uint8Array(read(`feeds/${s.id}.xml`)), meta.content_type);
  const { articles } = articlesFromXml(xml, s);
  for (const a of articles) {
    if (a.image_url) continue;
    ogWanted.push(a.url);
    const key = createHash('sha1').update(a.url).digest('hex');
    const path = new URL(`og/${key}.json`, fx);
    if (!existsSync(path)) {
      ogMissing++;
      continue;
    }
    const rec = JSON.parse(readFileSync(path, 'utf8'));
    if (rec.head) a.image_url = ogFromHtml(rec.head);
  }
  const kept: Article[] = [];
  for (const a of articles) {
    const g = gate(a);
    if ('article' in g) kept.push(g.article);
    else console.error(`gate dropped ${s.id}: ${g.reason}`);
  }
  bySource.set(s.id, kept);
}

const feed = buildFeed(bySource, Date.now());
const out: Record<string, Article[]> = {};
for (const [tab, idx] of Object.entries(feed.lists)) out[tab] = idx.map((i) => feed.articles[i]);
writeFileSync(new URL('ts-out.json', fx), JSON.stringify(out));
writeFileSync(new URL('og-wanted.json', fx), JSON.stringify([...new Set(ogWanted)]));
console.log(
  `tabs ${Object.keys(out).length}, all=${out.all.length}, og wanted ${new Set(ogWanted).size}, og fixtures missing ${ogMissing}`,
);
