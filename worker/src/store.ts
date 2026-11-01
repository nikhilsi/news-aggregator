// KV access for the two values the Worker keeps (spec section 4):
//   "state": what the cron knows per source (validators, times, articles)
//   "feed":  the merged lists the API serves
//   "ai":    labels, embeddings and the Today brief, by article URL (#414)
// Only the cron writes. Reads that fail to parse, or carry another schema
// version, count as missing, which makes the next cron run a full run (R5).

import { AI_VERSION, FEED_VERSION, STATE_VERSION, type AiStore, type Feed, type State } from './types.ts';
import type { Refresher } from './refresher.ts';

export interface Env {
  CACHE: KVNamespace;
  AI: Ai;
  ASSETS: Fetcher;
  API_LIMITER: RateLimit;
  READER_LIMITER: RateLimit;
  REFRESHER: DurableObjectNamespace<Refresher>;
}

export const STATE_KEY = 'state';
export const FEED_KEY = 'feed';
export const AI_KEY = 'ai';

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
export const readAi = (kv: KVNamespace) => readJson<AiStore>(kv, AI_KEY, AI_VERSION);
