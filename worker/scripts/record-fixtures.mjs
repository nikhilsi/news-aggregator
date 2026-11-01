// Records every RSS source's feed once (body bytes and the headers that matter)
// into worker/.fixtures/feeds/, for the Python versus TypeScript parity check.
// Fixtures are third-party content, so they stay out of git (.gitignore).
//
// Usage: node scripts/record-fixtures.mjs            (all sources in src/sources.ts)
//        node scripts/record-fixtures.mjs og <list>  (og:image page heads, see parity.md)

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOURCES } from '../src/sources.ts';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const root = new URL('../.fixtures/', import.meta.url);

async function recordFeeds() {
  const dir = new URL('feeds/', root);
  await mkdir(dir, { recursive: true });
  const rss = SOURCES.filter((s) => s.type === 'rss' && !s.url.includes('news.google.com'));
  const results = await Promise.all(
    rss.map(async (s) => {
      try {
        const res = await fetch(s.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
        const body = new Uint8Array(await res.arrayBuffer());
        const meta = {
          id: s.id,
          url: s.url,
          status: res.status,
          content_type: res.headers.get('content-type'),
          etag: res.headers.get('etag'),
          last_modified: res.headers.get('last-modified'),
          bytes: body.length,
          recorded_at: new Date().toISOString(),
        };
        await writeFile(new URL(`${s.id}.xml`, dir), body);
        await writeFile(new URL(`${s.id}.json`, dir), JSON.stringify(meta, null, 2));
        return `${s.id.padEnd(26)} ${res.status} ${String(body.length).padStart(8)} B`;
      } catch (e) {
        return `${s.id.padEnd(26)} ERROR ${e.name}`;
      }
    }),
  );
  console.log(results.join('\n'));
}

// og:image page heads: reads a JSON list of article URLs and stores the first
// 15,000 characters of each page (what the Python backfill reads), or the error.
async function recordOg(listPath) {
  const dir = new URL('og/', root);
  await mkdir(dir, { recursive: true });
  const urls = JSON.parse(await readFile(listPath, 'utf8'));
  let done = 0;
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const key = createHash('sha1').update(url).digest('hex');
      let rec;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
        const text = await res.text();
        rec = { url, status: res.status, head: text.slice(0, 15000) };
      } catch (e) {
        rec = { url, status: 0, error: e.name };
      }
      await writeFile(new URL(`${key}.json`, dir), JSON.stringify(rec));
      done++;
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`og pages recorded: ${done}`);
}

if (process.argv[2] === 'og') await recordOg(process.argv[3]);
else await recordFeeds();
