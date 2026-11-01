// Network side of the feed refresh: one feed fetch, body decoding, and the
// og:image lookups. Ported from fetch_rss and _fetch_og_image in
// backend/app/sources/rss_fetcher.py, with the limits from spec section 4.

import type { Source } from '../sources.ts';
import type { Article } from '../types.ts';
import { parseEntries } from './entry.ts';
import { normalizeEntry } from './normalize.ts';
import { pool } from '../pool.ts';

/** The browser User-Agent the droplet sends today (main.py). */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const FEED_TIMEOUT_MS = 10_000;
export const FEED_MAX_BYTES = 5 * 1024 * 1024;
export const OG_TIMEOUT_MS = 5_000;
export const OG_READ_CHARS = 15_000;
export const OG_POOL = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bodies that are valid UTF-8 are decoded as UTF-8; otherwise by the charset
 * in Content-Type (spec section 3: fixes feeds that mislabel UTF-8, R10).
 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    const label = /charset=["']?([^"';\s]+)/i.exec(contentType ?? '')?.[1] ?? 'windows-1252';
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
}

/**
 * Reads a body stream up to `max` bytes. When it is longer: returns null, or
 * with `truncate` the first `max` bytes (enough for an og:image in the head).
 */
export async function readCapped(res: Response, max: number, truncate = false): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > max) {
      await reader.cancel();
      if (!truncate) return null;
      chunks.push(value.subarray(0, max - size));
      size = max;
      break;
    }
    size += value.byteLength;
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export type FeedResult =
  | { kind: 'not_modified' }
  | { kind: 'ok'; articles: Article[]; etag: string | null; lastModified: string | null; dropped: number }
  | { kind: 'error'; status: string };

export interface Validators {
  etag: string | null;
  last_modified: string | null;
  full_at: number | null;
}

/** Parses a feed document into normalized articles. Entries that fail are skipped. */
export function articlesFromXml(xml: string, source: Source): { articles: Article[]; dropped: number } {
  const articles: Article[] = [];
  let dropped = 0;
  for (const entry of parseEntries(xml)) {
    try {
      const a = normalizeEntry(entry, source);
      if (a) articles.push(a);
    } catch {
      dropped++;
    }
  }
  return { articles, dropped };
}

/** fetch_rss without the og:image step (the cron does that with carry-over). */
export async function fetchFeed(source: Source, v: Validators, now: number): Promise<FeedResult> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (v.full_at !== null && now - v.full_at < DAY_MS) {
    if (v.etag) headers['If-None-Match'] = v.etag;
    if (v.last_modified) headers['If-Modified-Since'] = v.last_modified;
  }
  let res: Response;
  try {
    res = await fetch(source.url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
  } catch (e) {
    return { kind: 'error', status: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
  if (res.status === 304) return { kind: 'not_modified' };
  if (!res.ok) {
    await res.body?.cancel();
    return { kind: 'error', status: `http_${res.status}` };
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await readCapped(res, FEED_MAX_BYTES);
  } catch (e) {
    return { kind: 'error', status: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
  if (bytes === null) return { kind: 'error', status: 'too_large' };
  let parsed: { articles: Article[]; dropped: number };
  try {
    parsed = articlesFromXml(decodeBody(bytes, res.headers.get('content-type')), source);
  } catch {
    return { kind: 'error', status: 'parse_error' };
  }
  return {
    kind: 'ok',
    ...parsed,
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  };
}

const OG_PROPERTY_FIRST = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/;
const OG_CONTENT_FIRST = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/;

/** The og:image match from _fetch_og_image, on the page's first 15,000 characters. */
export function ogFromHtml(html: string): string | null {
  const head = html.slice(0, OG_READ_CHARS);
  return OG_PROPERTY_FIRST.exec(head)?.[1] ?? OG_CONTENT_FIRST.exec(head)?.[1] ?? null;
}

/**
 * Looks up og:image for each URL through a pool of six (review R7). Each value
 * is the image, "" when the page answered and had none, or undefined when the
 * answer is not definite (timeout, network error, 5xx), so it is tried again on
 * the next full fetch. Like Python, any status is searched; 404 and 410 count
 * as definite. Nothing new starts after `deadline`.
 */
export async function lookupOg(urls: string[], deadline: number): Promise<Map<string, string | undefined>> {
  return pool(urls, OG_POOL, deadline, async (url) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(OG_TIMEOUT_MS),
      });
      const bytes = (await readCapped(res, 256 * 1024, true))!;
      const found = ogFromHtml(decodeBody(bytes, res.headers.get('content-type')));
      const definite = res.ok || res.status === 404 || res.status === 410;
      return found ?? (definite ? '' : undefined);
    } catch {
      return undefined;
    }
  });
}
