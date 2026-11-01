// Reader view: fetch one article page, extract the main text, sanitize it.
// Port of backend/app/articles/reader.py with the changes in spec section 6:
// Readability on linkedom only (no trafilatura), sanitize-html with the nh3
// allowlist, SSRF checks on every redirect hop, a 3 MB read cap, no cache.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { decodeBody, readCapped, USER_AGENT } from '../feeds/fetch.ts';
import type { Article } from '../types.ts';
import { checkUrl } from './ssrf.ts';

const TIMEOUT_MS = 15_000;
const MAX_HOPS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const MIN_WORDS = 50;
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];

export interface ReaderResult {
  status: 'ok' | 'failed';
  url: string;
  title: string | null;
  author: string | null;
  content_html: string | null;
  word_count: number | null;
  image_url: string | null;
  source_name: string | null;
  published_at: string | null;
  extracted_at: string | null;
  reason: string | null;
}

/** nh3 settings from reader.py, expressed for sanitize-html. */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'figure', 'figcaption', 'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'sub', 'sup', 'hr', 'mark', 'del', 'ins',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'data'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: true,
  // Disallowed tags are unwrapped (text kept); these lose their content too.
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'iframe', 'textarea', 'option', 'noscript', 'template'],
  // nh3's link_rel: every link gets exactly this rel.
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }) },
};

const htmlToText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const countWords = (text: string) => (text ? text.split(/\s+/).filter(Boolean).length : 0);

function extractAuthor(html: string): string | null {
  const m =
    /<meta\s+name="author"\s+content="([^"]+)"/i.exec(html) ??
    /<meta\s+property="article:author"\s+content="([^"]+)"/i.exec(html);
  return m ? m[1].trim() : null;
}

function result(url: string, meta: Article | undefined, fields: Partial<ReaderResult>): ReaderResult {
  return {
    status: 'failed',
    url,
    title: meta?.title ?? null,
    author: null,
    content_html: null,
    word_count: null,
    image_url: meta?.image_url ?? null,
    source_name: meta?.source_name ?? null,
    published_at: meta?.published_at ?? null,
    extracted_at: null,
    reason: null,
    ...fields,
  };
}

type Fetched = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };

async function fetchPage(url: string, ownHosts: string[]): Promise<Fetched> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (hop > 0) {
        const check = await checkUrl(current, ownHosts);
        if (!check.ok) return { ok: false, reason: 'error' };
      }
      const res = await fetch(current, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel();
        current = new URL(res.headers.get('location')!, current).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return { ok: false, reason: res.status === 401 || res.status === 403 ? 'forbidden' : 'error' };
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (type && !HTML_TYPES.includes(type)) {
        await res.body?.cancel();
        return { ok: false, reason: 'extraction_empty' };
      }
      const bytes = (await readCapped(res, MAX_BYTES, true))!;
      return { ok: true, html: decodeBody(bytes, res.headers.get('content-type')), finalUrl: current };
    }
    return { ok: false, reason: 'error' };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
}

/** Readability on linkedom; null unless the result has at least 50 words. */
export function extract(html: string, finalUrl: string): { content: string; title: string | null } | null {
  try {
    const { document } = parseHTML(html);
    const head = document.head ?? document.documentElement;
    if (head) {
      // linkedom documents have no URL; a <base> lets Readability make links absolute.
      const base = document.createElement('base');
      base.setAttribute('href', finalUrl);
      head.insertBefore(base, head.firstChild);
    }
    const parsed = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
    if (!parsed?.content || countWords(htmlToText(parsed.content)) < MIN_WORDS) return null;
    return { content: parsed.content, title: parsed.title || null };
  } catch {
    return null;
  }
}

export function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE);
}

/** The reader response for a URL that already passed checkUrl. */
export async function readArticle(url: string, meta: Article | undefined, ownHosts: string[]): Promise<ReaderResult> {
  const page = await fetchPage(url, ownHosts);
  if (!page.ok) return result(url, meta, { reason: page.reason });
  const extracted = extract(page.html, page.finalUrl);
  if (!extracted) return result(url, meta, { reason: 'extraction_empty' });
  const content = sanitize(extracted.content);
  return result(url, meta, {
    status: 'ok',
    title: meta?.title ?? extracted.title,
    author: extractAuthor(page.html),
    content_html: content,
    word_count: countWords(htmlToText(content)),
    extracted_at: new Date().toISOString(),
  });
}
