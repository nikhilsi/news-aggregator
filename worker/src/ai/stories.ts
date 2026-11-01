// Groups articles about the same story (#414), so each tab shows one card per
// story and Today can count how many outlets covered it. Greedy grouping by
// meaning: newest first, an article joins the closest story when cosine
// similarity to its center is at least 0.75 (0.70 merged unrelated stories,
// 0.80 split the Binance hack in three; prototype on live data, Nov 1, 2026).

import type { AiItem, Article } from '../types.ts';
import { dot, normalize, unpack } from './vectors.ts';

export const STORY_THRESHOLD = 0.75;
/** Only articles this recent are grouped (and embedded). */
export const STORY_WINDOW_MS = 48 * 3600e3;

export interface Story {
  id: number;
  /** Newest first. */
  members: Article[];
  centroid: Float32Array;
}

const time = (a: Article) => (a.published_at ? Date.parse(a.published_at) : NaN);

export const isRecent = (a: Article, now: number) => now - time(a) <= STORY_WINDOW_MS;

export function groupStories(articles: Article[], items: Readonly<Record<string, AiItem>>, now: number): Map<Article, Story> {
  const vectors = new Map<string, Float32Array>();
  const recent = articles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => isRecent(a, now) && Object.hasOwn(items, a.url) && items[a.url].e)
    .sort((x, y) => time(y.a) - time(x.a) || x.i - y.i);

  const stories: (Story & { sum: Float32Array })[] = [];
  const storyOf = new Map<Article, Story>();
  for (const { a } of recent) {
    let v = vectors.get(a.url);
    if (!v) vectors.set(a.url, (v = unpack(items[a.url].e!)));
    let best: (typeof stories)[number] | undefined;
    let bestSim = STORY_THRESHOLD;
    for (const s of stories) {
      const sim = dot(v, s.centroid);
      if (sim >= bestSim) {
        bestSim = sim;
        best = s;
      }
    }
    if (best) {
      best.members.push(a);
      for (let k = 0; k < v.length; k++) best.sum[k] += v[k];
      best.centroid = normalize(best.sum);
    } else {
      best = { id: stories.length, members: [a], centroid: v, sum: Float32Array.from(v) };
      stories.push(best);
    }
    storyOf.set(a, best);
  }
  return storyOf;
}
