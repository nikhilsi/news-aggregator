// The output gate (spec section 3, review R2). The iOS app rejects a whole page
// when one article breaks its decoder, so nothing leaves the cron unless every
// field is the type the apps expect, every string is well formed (no lone
// surrogate), and the date is null or exactly YYYY-MM-DDTHH:MM:SSZ.

import type { Article } from '../types.ts';
import { DATE_RE } from '../feeds/dates.ts';

const wellFormed = (s: string) => s.toWellFormed();

const REQUIRED = ['title', 'url', 'source_id', 'source_name', 'source_type', 'category'] as const;

/** Returns a clean copy of the article, or null with a reason. */
export function gate(a: Article): { article: Article } | { reason: string } {
  for (const k of REQUIRED) {
    if (typeof a[k] !== 'string' || !a[k]) return { reason: `missing ${k}` };
  }
  if (a.summary !== null && typeof a.summary !== 'string') return { reason: 'bad summary' };
  if (a.image_url !== null && typeof a.image_url !== 'string') return { reason: 'bad image_url' };
  if (a.published_at !== null && !DATE_RE.test(a.published_at)) return { reason: 'bad published_at' };
  return {
    article: {
      title: wellFormed(a.title),
      summary: a.summary === null ? null : wellFormed(a.summary),
      url: wellFormed(a.url),
      image_url: a.image_url === null ? null : wellFormed(a.image_url),
      source_id: a.source_id,
      source_name: a.source_name,
      source_type: a.source_type,
      category: a.category,
      sentiment: null,
      published_at: a.published_at,
    },
  };
}
