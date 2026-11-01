// What one source may show (#413): at most its newest 30 items and nothing
// older than 7 days. Feed order is kept, so dedup still sees items in the
// order the publisher lists them. Undated items count as the oldest.

import { MAX_AGE_DAYS, MAX_PER_SOURCE } from '../sources.ts';
import { formatDate } from '../feeds/dates.ts';
import type { Article } from '../types.ts';

export function trimSource(articles: Article[], now: number): Article[] {
  const cutoff = formatDate(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const fresh = articles.filter((a) => a.published_at === null || a.published_at >= cutoff);
  if (fresh.length <= MAX_PER_SOURCE) return fresh;
  const keep = new Set(
    fresh
      .map((a, i) => [a, i] as const)
      .sort(([a, i], [b, j]) => {
        const ka = a.published_at ?? '';
        const kb = b.published_at ?? '';
        return ka !== kb ? (ka < kb ? 1 : -1) : i - j;
      })
      .slice(0, MAX_PER_SOURCE)
      .map(([a]) => a),
  );
  return fresh.filter((a) => keep.has(a));
}
