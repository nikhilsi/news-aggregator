// Reader view: fetch one article page, extract the main text, sanitize it,
// clean it. Port of backend/app/articles/reader.py with the changes in spec
// section 6 (sanitize-html with the nh3 allowlist, SSRF checks on every
// redirect hop, a 3 MB read cap), and #423 (Nov 1, 2026), measured on 250
// articles from all 53 sources:
//   - Defuddle first, Readability when it finds at least 25% more article
//     text (Defuddle sometimes drops opening paragraphs, as on Scientific
//     American). Readability alone cut 24 of 220 articles by 30% or more
//     (Ars Technica splits each story into three blocks and it kept one; BBC
//     too); the pair with the cleanup below cut 9, with junk lines 46 to 9.
//   - A cleanup pass for what both leave behind: "Skip to content", sign-up
//     and app lines, "N Comments", repeated captions, empty bullets, the photo
//     the clients already show above the title, broken image addresses.

import { Readability } from '@mozilla/readability';
import Defuddle from 'defuddle';
import { decodeHTML } from 'entities';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { decodeBody, readCapped, USER_AGENT } from '../feeds/fetch.ts';
import type { Article } from '../types.ts';
import { photoUrl, rewritePhotos } from './photos.ts';
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
  /** forbidden, timeout, extraction_empty, error, or video (a video page, not an article). */
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
  // video and audio lose their fallback text too ("Your browser does not support the video tag", #453).
  nonTextTags: ['script', 'style', 'iframe', 'textarea', 'option', 'noscript', 'template', 'video', 'audio'],
  // nh3's link_rel: every link gets exactly this rel.
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }) },
};

const htmlToText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const countWords = (text: string) => (text ? text.split(/\s+/).filter(Boolean).length : 0);

/** Words in paragraphs of 12 words or more: the article's own text, not captions or page junk. */
function articleWords(html: string): number {
  let n = 0;
  for (const m of html.matchAll(/<p[\s>][\s\S]*?<\/p>/g)) {
    const w = countWords(htmlToText(m[0]));
    if (w >= 12) n += w;
  }
  return n;
}

/** A clean byline, or null: entities decoded, no URLs, no "Sponsored". */
export function cleanAuthor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const author = decodeHTML(raw).replace(/\s+/g, ' ').trim();
  if (!author || author.length > 100 || /https?:|www\.|\.com\b|sponsored/i.test(author)) return null;
  return author;
}

function metaAuthor(html: string): string | null {
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

/** The widest candidate in a srcset ("url 768w, url 1200w"), or the last one. */
/**
 * Lazy-loaded photos keep their address outside src, and the sanitizer keeps only src
 * (#453): DW puts it in data-url with a ${formatId} size placeholder (605 is about 1,200
 * pixels wide). A photo without a real src gets one from its data attributes.
 */
function fillImageSources(document: ReturnType<typeof parseHTML>['document']) {
  for (const img of [...document.querySelectorAll('img')]) {
    const src = (img.getAttribute('src') ?? '').trim();
    if (src && !src.startsWith('data:')) continue;
    const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-url'].map((a) => (img.getAttribute(a) ?? '').trim()).find(Boolean);
    const pick = lazy?.replace('${formatId}', '605');
    if (pick && !pick.includes('${')) img.setAttribute('src', pick);
  }
}

/** A linkedom document with a <base>, so relative links and images become absolute. */
function pageDocument(html: string, finalUrl: string) {
  const { document } = parseHTML(html);
  const head = document.head ?? document.documentElement;
  if (head) {
    // linkedom documents have no URL; a <base> lets the extractors make links absolute.
    const base = document.createElement('base');
    base.setAttribute('href', finalUrl);
    head.insertBefore(base, head.firstChild);
  }
  fillImageSources(document);
  return document;
}

interface Extracted {
  content: string;
  title: string | null;
  author: string | null;
}

function byDefuddle(html: string, finalUrl: string): Extracted | null {
  try {
    const document = pageDocument(html, finalUrl);
    // parse() is synchronous and makes no network calls (parseAsync can).
    const r = new Defuddle(document as unknown as ConstructorParameters<typeof Defuddle>[0], { url: finalUrl }).parse();
    return r?.content ? { content: r.content, title: r.title || null, author: r.author || null } : null;
  } catch {
    return null;
  }
}

function byReadability(html: string, finalUrl: string): Extracted | null {
  try {
    const document = pageDocument(html, finalUrl);
    const parsed = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
    return parsed?.content ? { content: parsed.content, title: parsed.title || null, author: null } : null;
  } catch {
    return null;
  }
}

/**
 * The article, sanitized and cleaned: Defuddle's, unless Readability's has at
 * least 25% more article text or Defuddle's has under 50 words. Both are
 * cleaned before the comparison, so leftover junk (an author bio, a subscribe
 * pitch) cannot tip it. `hero` is the photo shown above the title; `author`
 * the byline to drop from the text. Null under 50 words.
 */
export function extract(html: string, finalUrl: string, hero: string | null = null, author: string | null = null): Extracted | null {
  const d0 = byDefuddle(html, finalUrl);
  const byline = author ?? cleanAuthor(d0?.author);
  const tidy = (e: Extracted | null) => (e ? { ...e, content: clean(sanitize(e.content), hero, byline) } : null);
  const d = tidy(d0);
  const r = tidy(byReadability(html, finalUrl));
  const words = (e: Extracted | null) => (e ? countWords(htmlToText(e.content)) : 0);
  const useReadability = !!r && (words(d) < MIN_WORDS || articleWords(r.content) > 1.25 * articleWords(d!.content));
  const pick = useReadability ? r : d;
  if (!pick || words(pick) < MIN_WORDS) return null;
  return { ...pick, author: d0?.author ?? null };
}

export function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE);
}

/** Whole lines of page furniture, matched against a block's entire text. */
const BOILERPLATE =
  /^(skip to (main )?content|skip past newsletter promotion|after newsletter promotion|advertisement|close|sponsored( content)?( by .{1,40})?|subscribed?( now)?|subscribe to .{1,60}|ai news without the hype.{0,60}|sign up( now)?|sign up for .{1,60}|sign up to .{0,50}newsletter|newsletter|click here to download .{1,60}|click here to read (the )?(previous|next)\b.{0,60}|download the .{1,40} app.{0,80}|new you can now listen to .{1,60}|listen to this article.{0,40}|\d+ comments?|read more( ?\|.{1,200}| of our stories about .{1,100})?|related( stories| articles| coverage)?:?|share this( article| story| .{1,100} with your friends.{0,3})?|follow (us|topics and authors)\b.{0,140}|most (read|popular)|email \(required\)|\d+ min read|your browser does(n't| not) support (the )?(html5 )?(video|audio)( tag| element)?\.?)$/i;
/** Support pitches written as whole paragraphs. */
const PITCH = /^(subscribe to the decoder\b|great science journalism requires|when you subscribe, you are supporting|subscriptions keep this engine running|support (our|independent) journalism|if you('re| are) enjoying (this|our) )/i;
/** A photo credit on its own line. */
const CREDIT = /^((photo|image|picture|illustration)s?( credit)?|credit|photograph)( by)?\s*:|getty images|shutterstock|picture alliance|ap photo/i;
/** A photo credit at the end of a block, after a sentence: "… thread. Image: Perplexity". */
const CREDIT_TAIL = /(^|[.!?"”)\]]\s*)(photograph|photo|image|illustration|picture|credit)s?( by)?\s*:.{1,100}$/i;
/** A block's text for comparing copies: lowercase, without final punctuation. */
const plainKey = (t: string) => t.replace(/[\s.,;:!?…"'”’)]+$/, '').toLowerCase();
/** The same without a trailing photo credit. */
const creditlessKey = (t: string) => plainKey(t.replace(CREDIT_TAIL, '$1'));
/** Whole blocks only: a link reading "close" inside a sentence stays. */
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, figcaption, blockquote, div';
const CONTAINERS = 'p, li, ul, ol, figure, figcaption, div, span, a, blockquote, h1, h2, h3, h4, h5, h6, b, strong, em, i';

/** Query parameters image services use for the original photo (NPR's Brightspot: ?url=). */
const ORIGINAL_PARAMS = ['url', 'u', 'src', 'image'];

/** The original photo's address: the one an image service names in a query parameter, else the address itself. */
function photoOriginal(src: string): URL {
  const u = new URL(src, 'https://x.invalid/');
  for (const p of ORIGINAL_PARAMS) {
    const inner = u.searchParams.get(p);
    if (inner && /^https?:\/\//i.test(inner)) return new URL(inner);
  }
  return u;
}

/** Host and path of the original photo, for telling apart photos that share a file name. */
function photoPath(src: string | null | undefined): string {
  try {
    const u = photoOriginal(src ?? '');
    return u.hostname + u.pathname;
  } catch {
    return '';
  }
}

/**
 * The last path segment of an image URL, without size suffixes or extension, to spot one
 * photo at two sizes. An image service address that names the original photo in a query
 * parameter is keyed by that original (#453: NPR's addresses end in "/", so every NPR
 * article showed its photo twice).
 */
export function photoKey(src: string | null | undefined): string {
  if (!src) return '';
  try {
    const name = photoOriginal(src).pathname.split('/').pop() ?? '';
    return name
      .replace(/\.(jpe?g|png|webp|avif|gif)$/i, '')
      .replace(/[-_]\d{2,4}x\d{2,4}$/, '')
      // DW: 79751428_6.jpg above the title, 79751428_605.jpg in the text (#453).
      .replace(/^(\d{6,})_\d{1,4}$/, '$1')
      .toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Removes what extraction leaves behind. `heroUrl` is the photo every client
 * already shows above the title; the same photo at the top of the text goes.
 * `author` is the byline every client shows; the same name at the top of the
 * text goes, with the bio line after it.
 */
export function clean(html: string, heroUrl: string | null, author: string | null = null): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = document.body;
  const text = (n: { textContent: string | null }) => (n.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Leaf-most blocks: those with no block inside them.
  const leaves = () => [...body.querySelectorAll(BLOCKS)].filter((n) => !n.querySelector('p, li, div, blockquote, figure'));

  // 1. Page furniture, by whole-line match, and support pitches. Twice: removing a pitch
  //    can leave the rest of its box as a block of its own (The Decoder's "… Subscribe now").
  for (let pass = 0; pass < 2; pass++) {
    for (const n of leaves()) if (BOILERPLATE.test(text(n)) || PITCH.test(text(n))) n.remove();
  }

  // 2. A block repeated (a caption shown twice, a subtitle repeated, #453), keeping the
  //    copy that is story text:
  //    - the same words (6+, final punctuation aside): the later copy goes, unless the earlier
  //      one is a list item or heading and the later one is not (a key-points bullet, a
  //      subtitle or a key-events entry repeating a paragraph: The Hindu, CNBC, live blogs);
  //    - the same words once a trailing photo credit is set aside ("… Image: Perplexity"):
  //      the copy with the credit, a caption, goes (The Verge, The Guardian).
  //    A block is never a repeat of a block it holds or sits in, and an inner copy stands
  //    for its wrapper (<div><h2>…</h2></div>, <div><figcaption>…</figcaption> Image: …</div>).
  type Leaf = ReturnType<typeof leaves>[number];
  const isHeading = (n: Leaf) => /^H[1-6]$/.test(n.tagName);
  const rank = (n: Leaf) => (n.tagName === 'LI' ? 0 : isHeading(n) ? 1 : 2);
  const same = new Map<string, Leaf>();
  const credited = new Map<string, Leaf>();
  const register = (map: Map<string, Leaf>, k: string, n: Leaf) => {
    const e = map.get(k);
    if (!e || !e.isConnected || e.contains(n)) map.set(k, n);
  };
  for (const n of leaves()) {
    if (!n.isConnected) continue;
    const t = text(n);
    const plain = countWords(t) >= 6 ? plainKey(t) : null;
    const bare = creditlessKey(t);
    const hasCredit = bare !== plainKey(t) && countWords(bare) >= 6;
    const other = (e: Leaf | undefined): e is Leaf => !!e && e.isConnected && !e.contains(n) && !n.contains(e);
    let drop: Leaf | undefined;
    const exact = plain ? same.get(plain) : undefined;
    const creditFirst = plain ? credited.get(plain) : undefined;
    const creditNow = hasCredit ? same.get(bare) : undefined;
    if (other(exact)) drop = rank(exact) < rank(n) ? exact : n;
    else if (other(creditNow)) drop = n;
    else if (other(creditFirst)) drop = creditFirst;
    if (drop) drop.remove();
    if (drop === n) continue;
    if (plain) register(same, plain, n);
    if (hasCredit) register(credited, bare, n);
  }

  // 3. Images: the first address of a comma-joined srcset, no tracking pixels.
  for (const img of [...body.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? '';
    if (/,\s*https?:/.test(src)) img.setAttribute('src', src.split(/,\s*(?=https?:)/)[0].trim().split(/\s+/)[0]);
    const w = Number(img.getAttribute('width')), h = Number(img.getAttribute('height'));
    if (!src || (w > 0 && w < 50) || (h > 0 && h < 50)) img.remove();
  }

  // 4. The photo above the title, again at the top of the text: remove it with its caption
  //    (the largest wrapper holding no other image and only caption text: a figcaption,
  //    the photo's own description, a credit or a short line).
  //    The first copy goes wherever it is; a further copy goes while no more than 60 words
  //    of text come before it (The Verge carries the photo twice, under its subtitle and
  //    byline; #453). A photo farther down, such as a player list's thumbnail, stays.
  const hero = photoKey(heroUrl);
  const wordsBefore = (img: Element) => {
    let n = 0;
    for (const el of body.querySelectorAll(`img, ${BLOCKS}`)) {
      if (el === img) break;
      if (el.tagName !== 'IMG' && !el.contains(img) && !el.querySelector('p, li, div, blockquote, figure')) n += countWords(text(el));
    }
    return n;
  };
  //    A further copy must also have the first copy's address: some sites give many photos
  //    one file name (beehiiv's image.png).
  let firstPath = '';
  for (let copy = 0; hero && copy < 3; copy++) {
    const first = body.querySelector('img');
    if (!first || photoKey(first.getAttribute('src')) !== hero) break;
    if (copy > 0 && (wordsBefore(first) > 60 || photoPath(first.getAttribute('src')) !== firstPath)) break;
    if (copy === 0) firstPath = photoPath(first.getAttribute('src'));
    const words = (n: { textContent: string | null }) => countWords(text(n));
    const total = words(body);
    const alt = (first.getAttribute('alt') ?? '').trim().slice(0, 30).toLowerCase();
    const captionLike = (t: string) => countWords(t) <= 12 || CREDIT.test(t) || (alt.length >= 10 && t.toLowerCase().startsWith(alt));
    let target = first;
    for (let p = first.parentElement; p && p !== body; p = p.parentElement) {
      const n = words(p);
      if (p.querySelectorAll('img').length > 1 || n > 60 || n > total / 2) break;
      const blocks = [...p.querySelectorAll(BLOCKS)].filter((b) => b.tagName !== 'FIGCAPTION' && !b.querySelector('p, li, div, blockquote, figure'));
      if (blocks.some((b) => text(b) && !captionLike(text(b)))) break;
      target = p;
    }
    // A caption in the block right after the photo goes with it (NPR keeps the photo and
    // its caption in sibling blocks, the caption ending in "hide caption"; #453).
    const next = target.nextElementSibling;
    target.remove();
    if (next && !next.querySelector('img') && words(next) <= 60) {
      const t = text(next);
      if (/\b(hide|toggle) caption\b/i.test(t) || (alt.length >= 10 && t.toLowerCase().startsWith(alt))) next.remove();
    }
  }

  // 5. Above the first paragraph: the byline and the bio line after it (shown in the
  //    meta row already), and photo credits whose photo is gone.
  const besidePhoto = (n: ReturnType<typeof leaves>[number]) =>
    !!n.closest('figure')?.querySelector('img') ||
    [n.previousElementSibling, n.parentElement?.previousElementSibling].some((s) => s && (s.tagName === 'IMG' || s.querySelector('img')));
  let afterByline = false;
  for (const n of leaves()) {
    const t = text(n);
    if (author && t.toLowerCase() === author.toLowerCase()) {
      n.remove();
      afterByline = true;
    } else if (afterByline && /^(is|was|has|covers|writes|reports)\b/.test(t)) {
      n.remove();
      afterByline = false;
    } else if (countWords(t) <= 12 && CREDIT.test(t) && !besidePhoto(n)) {
      n.remove();
    } else if (countWords(t) >= 12) {
      break;
    }
  }

  // 6. A figure left with only a short caption: its video or embed was removed ("See how
  //    Plan Assist works.", DeepMind, #453). A longer caption is kept: it can carry the
  //    article's own text even when its photo was lost.
  for (const f of [...body.querySelectorAll('figure')]) {
    const nodes = [...f.childNodes];
    const onlyCaption = nodes.every((n) => (n.nodeType === 1 ? (n as Element).tagName === 'FIGCAPTION' : !(n.textContent ?? '').trim()));
    if (onlyCaption && f.querySelector('figcaption') && countWords(text(f)) <= 12) f.remove();
  }

  // 7. Empty wrappers left behind (empty bullets, figures, paragraphs), innermost first.
  for (let pass = 0; pass < 4; pass++) {
    const empty = [...body.querySelectorAll(CONTAINERS)].filter((n) => !text(n) && !n.querySelector('img, br, hr, table'));
    if (!empty.length) break;
    for (const n of empty) n.remove();
  }
  return body.innerHTML.trim();
}

/** A video page, not an article: nothing to read. */
const VIDEO_PATH = /\/videos?\//i;

/**
 * The reader response for a URL that already passed checkUrl. With `photoKey`,
 * every photo (in the text and above the title) is served resized from
 * getclearnews.com.
 */
export async function readArticle(url: string, meta: Article | undefined, ownHosts: string[], photoKey?: string): Promise<ReaderResult> {
  const r = await read(url, meta, ownHosts);
  if (!photoKey) return r;
  return {
    ...r,
    image_url: r.image_url ? await photoUrl(photoKey, r.image_url) : null,
    content_html: r.content_html ? await rewritePhotos(r.content_html, photoKey) : null,
  };
}

async function read(url: string, meta: Article | undefined, ownHosts: string[]): Promise<ReaderResult> {
  if (VIDEO_PATH.test(new URL(url).pathname)) return result(url, meta, { reason: 'video' });
  const page = await fetchPage(url, ownHosts);
  if (!page.ok) return result(url, meta, { reason: page.reason });
  const byline = cleanAuthor(metaAuthor(page.html));
  const extracted = extract(page.html, page.finalUrl, meta?.image_url ?? null, byline);
  if (!extracted) return result(url, meta, { reason: 'extraction_empty' });
  return result(url, meta, {
    status: 'ok',
    title: meta?.title ?? extracted.title,
    author: byline ?? cleanAuthor(extracted.author),
    content_html: extracted.content,
    word_count: countWords(htmlToText(extracted.content)),
    extracted_at: new Date().toISOString(),
  });
}
