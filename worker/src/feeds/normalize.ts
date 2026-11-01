// Port of _normalize_entry and its helpers in backend/app/sources/rss_fetcher.py.

import type { Source } from '../sources.ts';
import type { Article } from '../types.ts';
import type { Entry } from './entry.ts';
import { cutSummary, stripHtml } from './text.ts';
import { formatDate, parseFeedDate } from './dates.ts';

const IMG_RE = /<img[^>]+src=["']([^"']+)["']/;

/** _extract_image_url: media:content, media:thumbnail, image enclosures, then <img> in HTML. */
export function extractImage(e: Entry): string | null {
  for (const m of e.mediaContent) {
    const type = m.type ?? '';
    if (m.url && (type.includes('image') || !type)) return m.url;
  }
  for (const t of e.mediaThumbnail) {
    if (t.url) return t.url;
  }
  for (const enc of e.enclosures) {
    if ((enc.type ?? '').includes('image')) return enc.url ?? null;
  }
  for (const html of [e.summary, e.content]) {
    if (!html) continue;
    const m = IMG_RE.exec(html);
    if (m) return m[1];
  }
  return null;
}

/** _parse_published_date: published, then updated. */
export function extractDate(e: Entry): string | null {
  const ms = parseFeedDate(e.published) ?? parseFeedDate(e.updated);
  return ms === null ? null : formatDate(ms);
}

/** _normalize_entry: null when title or link is missing, or for India Today visual stories. */
export function normalizeEntry(e: Entry, source: Source): Article | null {
  const title = e.title;
  const url = e.link;
  if (!title || !url) return null;
  if (url.includes('/visualstories/')) return null;
  return {
    title: stripHtml(title) || title,
    summary: cutSummary(stripHtml(e.summary || e.content)),
    url,
    image_url: extractImage(e),
    source_id: source.id,
    source_name: source.name,
    source_type: source.type,
    category: source.category,
    sentiment: null,
    published_at: extractDate(e),
  };
}
