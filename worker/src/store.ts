// KV access for the two values the Worker keeps (spec section 4):
//   "state": what the cron knows per source (validators, times, articles)
//   "feed":  the merged lists the API serves
// Only the cron writes. Reads that fail to parse, or carry another schema
// version, count as missing, which makes the next cron run a full run (R5).

import { FEED_VERSION, STATE_VERSION, type Feed, type State } from './types.ts';

export interface Env {
  CACHE: KVNamespace;
  ASSETS: Fetcher;
  API_LIMITER: RateLimit;
  READER_LIMITER: RateLimit;
}

export const STATE_KEY = 'state';
export const FEED_KEY = 'feed';

async function readJson<T extends { v: number }>(kv: KVNamespace, key: string, v: number): Promise<T | null> {
  try {
    const value = await kv.get<T>(key, { type: 'json' });
    return value && value.v === v ? value : null;
  } catch {
    return null;
  }
}

export const readState = (kv: KVNamespace) => readJson<State>(kv, STATE_KEY, STATE_VERSION);
export const readFeed = (kv: KVNamespace) => readJson<Feed>(kv, FEED_KEY, FEED_VERSION);
