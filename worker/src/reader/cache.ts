// Reader results kept in KV (#423): opening an article a second time is
// instant and does not hit the publisher again, and the cron reads Today's
// stories ahead after each new brief. The key carries a version, so a change
// to extraction or cleanup starts fresh.

import type { Article } from '../types.ts';
import { readArticle, type ReaderResult } from './reader.ts';
import { checkUrl } from './ssrf.ts';

/** Bump when extraction or cleanup changes. */
const VERSION = 2;
const KEEP_S = 6 * 3600;
/** A block or a timeout can pass: try again sooner. */
const KEEP_FAILED_S = 30 * 60;
/** Failures that will not change on a retry. */
const SETTLED = new Set(['video', 'extraction_empty']);
const AHEAD_POOL = 5;

export async function readerKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `reader:v${VERSION}:${hex}`;
}

const keepFor = (r: ReaderResult) => (r.status === 'ok' || SETTLED.has(r.reason ?? '') ? KEEP_S : KEEP_FAILED_S);

/**
 * The stored result for a URL that already passed checkUrl, or a fresh read
 * that is then stored (through `wait`, so the response does not wait for it).
 */
export async function readCached(
  kv: KVNamespace,
  url: string,
  meta: Article | undefined,
  ownHosts: string[],
  wait: (p: Promise<unknown>) => void,
): Promise<ReaderResult> {
  const key = await readerKey(url);
  const hit = await kv.get<ReaderResult>(key, 'json');
  if (hit) return hit;
  const r = await readArticle(url, meta, ownHosts);
  wait(kv.put(key, JSON.stringify(r), { expirationTtl: keepFor(r) }));
  return r;
}

export interface AheadSummary {
  read: number;
  already: number;
  failed: number;
}

/** Reads and stores the articles not stored yet, five at a time, giving up after `ms`. */
export async function readAhead(kv: KVNamespace, articles: Article[], ownHosts: string[], ms: number): Promise<AheadSummary> {
  const summary: AheadSummary = { read: 0, already: 0, failed: 0 };
  const queue = [...articles];
  const work = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const key = await readerKey(a.url);
      if ((await kv.get(key)) !== null) {
        summary.already++;
        continue;
      }
      if (!(await checkUrl(a.url, ownHosts)).ok) continue;
      const r = await readArticle(a.url, a, ownHosts);
      await kv.put(key, JSON.stringify(r), { expirationTtl: keepFor(r) });
      if (r.status === 'ok') summary.read++;
      else summary.failed++;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
  await Promise.race([Promise.all(Array.from({ length: AHEAD_POOL }, work)), stop]);
  if (timer !== undefined) clearTimeout(timer);
  queue.length = 0;
  return summary;
}
