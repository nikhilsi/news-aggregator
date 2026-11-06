// Port of _normalize_entry and its helpers in backend/app/sources/rss_fetcher.py.

import type { Source } from '../sources.ts';
import type { Article } from '../types.ts';
import type { Entry } from './entry.ts';
import { cutSummary, stripHtml } from './text.ts';
import { formatDate, parseFeedDate } from './dates.ts';

const IMG_RE = /<img[^>]+src=["']([^"']+)["']/g;

/**
 * An absolute http(s) address (a protocol-relative one gets https), or null.
 * NPR's feed has carried <img src='undefined'> (#453, Nov 2026); a value like
 * that must not count as a photo, so the cron looks up the page's og:image.
 */
export function webImage(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const abs = s.startsWith('//') ? `https:${s}` : s;
  try {
    const u = new URL(abs);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? abs : null;
  } catch {
    return null;
  }
}

/** Tracking pixels some feeds put in item HTML (NPR's npr-rss-pixel.png). */
const PIXEL = /\/tracking\/|pixel\.(png|gif)(\?|$)/i;

/** A web address that is not a tracking pixel, or null. */
const feedPhoto = (raw: string | null | undefined): string | null => {
  const u = webImage(raw);
  return u && !PIXEL.test(u) ? u : null;
};

/**
 * _extract_image_url: media:content, media:thumbnail, image enclosures, then <img> in HTML.
 * The first real photo address wins; placeholders and tracking pixels are skipped, so an
 * item without a photo gets the page's og:image from the cron.
 */
export function extractImage(e: Entry): string | null {
  for (const m of e.mediaContent) {
    const type = m.type ?? '';
    if (type.includes('image') || !type) {
      const u = feedPhoto(m.url);
      if (u) return u;
    }
  }
  for (const t of e.mediaThumbnail) {
    const u = feedPhoto(t.url);
    if (u) return u;
  }
  for (const enc of e.enclosures) {
    if ((enc.type ?? '').includes('image')) {
      const u = feedPhoto(enc.url);
      if (u) return u;
    }
  }
  for (const html of [e.summary, e.content]) {
    if (!html) continue;
    for (const m of html.matchAll(IMG_RE)) {
      const u = feedPhoto(m[1]);
      if (u) return u;
    }
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
