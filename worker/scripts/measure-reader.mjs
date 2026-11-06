#!/usr/bin/env node
// Measures the reader view on production (#423, #436). It takes the newest
// articles of every enabled source and reads each through
// https://getclearnews.com/api/v1/articles/reader, as the apps do. Then it scores them.
//   node scripts/measure-reader.mjs run [per-source] [id,id]
//       5 per source by default. The optional list limits the run to those source ids.
//       Ends by comparing with the previous run of the same shape.
//   node scripts/measure-reader.mjs report <run>
//       Scores a saved run again (after a change to the scoring).
//   node scripts/measure-reader.mjs compare <older run> <newer run>
//       Run folders under .fixtures/reader-runs/, by name.
// Two settings for trying a reader change before it is deployed:
//   READER_BASE=http://localhost:8787   read through a local Worker (scripts/dev.sh start)
//   SAMPLE_FROM=<run>                   read that run's articles again instead of a new sample
// A local Worker fetches pages from this Mac, not from Cloudflare, so a publisher
// that blocks one and not the other shows up as opened or not opened between runs.
//
// Read-only on production. It reads the KV key "state" with the ClearNews token
// and calls the public reader. The reader keeps each result in its own cache
// for 6 hours (30 minutes for a block or timeout), as it does for any open.
// Reads are paced at 14 a minute, under the reader's limit of 20 a minute per
// IP. A 429 waits a minute and tries again. A lock file keeps two runs apart.
//
// Each run keeps the reader's responses (results.jsonl, one line per article)
// and the article pages in .fixtures/reader-runs/<UTC time>/, ignored by git.
// The pages are fetched from this Mac for the completeness yardstick. Scores
// are computed from those files every time, so a scoring change applies to
// old runs too.
//
// The measures follow docs/reviews/2026-11-01-reader-investigation.md. The Nov 1
// scripts were lost, so the definitions below are rebuilt from that doc and
// task #436; numbers line up with Nov 1 only roughly.
//   - Opened, or the reader's failure reason. "Not measured" when the script
//     got no reader answer (a 429 after three tries, a network error).
//   - Time to open, split into fresh reads and results from the reader's
//     cache, told apart by extracted_at. Cached results show the reader as it
//     was when they were extracted.
//   - Cut short: the reader keeps under 70% of the page's own text. Both sides
//     count words in paragraphs of 12 or more words. Two yardsticks:
//       plain: the page outside nav, header, footer and aside (as #436 says);
//       tight: also without dialogs, forms, hidden blocks, headings and junk
//         paragraphs (sign-up pop-ups, related headlines, subscribe pitches),
//         and a paragraph the page repeats (an author bio twice) counts once.
//     Pages with under 50 such words are not checked. Both still count author
//     bios and subtitles, so each cut needs a look before it is called a miss.
//   - Junk lines: blocks that open with page furniture (skip to content,
//     sign up, subscribe, N comments, follow topics, advertisement, the app
//     download line) or carry a support pitch.
//   - Empty bullets and empty blocks.
//   - Repeated text: a block repeated word for word, or with a few words
//     added (a caption shown again with its credit).
//   - Photo twice: the first photo in the text is the photo above the title.
//     Only for articles in the feed: the reader has no photo above the title
//     for the others.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { decodeBody, readCapped, USER_AGENT } from '../src/feeds/fetch.ts';
import { isNonLatin } from '../src/pipeline/merge.ts';
import { addressBlocked, checkUrl } from '../src/reader/ssrf.ts';
import { SOURCES } from '../src/sources.ts';
import { STATE_VERSION } from '../src/types.ts';

const READER_BASE = process.env.READER_BASE ?? 'https://getclearnews.com';
const READER = `${READER_BASE}/api/v1/articles/reader?url=`;
const PER_MINUTE = 14;
const RUNS = new URL('../.fixtures/reader-runs/', import.meta.url).pathname;
const LOCK = join(RUNS, '.lock');
const SCRIPT_UA = 'ClearNews reader measurement (worker/scripts/measure-reader.mjs)';
const PAGE_MAX_BYTES = 3 * 1024 * 1024;
const CUT = 0.7;
const MIN_PAGE_WORDS = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Production data

function readToken() {
  const env = {};
  for (const line of readFileSync(join(homedir(), '.secrets/cloudflare/clearnews.env'), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function readState() {
  const env = readToken();
  const kvId = /"binding":\s*"CACHE",\s*"id":\s*"(\w+)"/.exec(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))[1];
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${kvId}/values/state`,
    { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  );
  if (!res.ok) throw new Error(`KV state: ${res.status}`);
  const state = await res.json();
  if (state.v !== STATE_VERSION) throw new Error(`KV state is version ${state.v}; this code reads version ${STATE_VERSION}`);
  return state;
}

/**
 * The newest articles of each enabled source, in sources.ts order, without
 * non-Latin titles. A URL is read once: a feed that lists one article twice,
 * or two feeds that share it, give the next newest instead.
 */
function sample(state, perSource, only) {
  const seen = new Set();
  const picks = [];
  for (const s of SOURCES) {
    if (!s.enabled || (only && !only.has(s.id))) continue;
    const articles = (state.sources[s.id]?.articles ?? [])
      .filter((a) => !isNonLatin(a.title))
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
    let taken = 0;
    for (const a of articles) {
      if (taken === perSource) break;
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      taken++;
      picks.push({ source_id: s.id, source_name: s.name, url: a.url, title: a.title, published_at: a.published_at });
    }
  }
  return picks;
}

/** One article through the production reader. A 429 waits a minute, up to three times. */
async function readOne(url) {
  for (let attempt = 1; ; attempt++) {
    const at = new Date().toISOString();
    const t0 = performance.now();
    try {
      const res = await fetch(READER + encodeURIComponent(url), {
        headers: { 'User-Agent': SCRIPT_UA },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      const ms = Math.round(performance.now() - t0);
      if (res.status === 429 && attempt <= 3) {
        console.log('  429 from the reader: waiting a minute');
        await sleep(60_000);
        continue;
      }
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: kept as null, scored by its HTTP status.
      }
      return { at, http: res.status, ms, body };
    } catch (e) {
      return { at, http: 'error', ms: Math.round(performance.now() - t0), body: null, error: String(e) };
    }
  }
}

/**
 * The article page as this Mac gets it, for the yardstick. Each redirect hop
 * passes the reader's own URL check, and the addresses this Mac's resolver
 * gives are checked too, since that is where fetch connects.
 */
async function fetchPage(url) {
  const signal = AbortSignal.timeout(15_000);
  let current = url;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      const check = await checkUrl(current);
      if (!check.ok) return { status: 'url_not_allowed' };
      const local = await lookup(check.url.hostname, { all: true }).catch(() => []);
      if (!local.length || local.some((a) => addressBlocked(a.address))) return { status: 'url_not_allowed' };
      const res = await fetch(current, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return { status: `http_${res.status}` };
      }
      const bytes = await readCapped(res, PAGE_MAX_BYTES, true);
      return { status: 'ok', html: decodeBody(bytes, res.headers.get('content-type')) };
    }
    return { status: 'too_many_redirects' };
  } catch (e) {
    return { status: e?.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
}

// Scoring

const LEAF_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, figcaption, blockquote, div';
/** A block that opens like page furniture. */
const FURNITURE =
  /^(skip to (main )?content|skip past newsletter|sign up|subscribe|newsletter|advertisement|sponsored|follow (us|topics)|click here|download the |new you can now listen|listen to this article|share this|read more|related (stories|articles|coverage)|most (read|popular)|\d+ comments?\b|email \(required\)|enjoy today's videos|your browser does(n't| not) support)/i;
/** A support or subscription pitch, wherever it sits in the block. */
const PITCH =
  /support (our|independent) journalism|if you('re| are) enjoying (this|our)|great science journalism requires|when you subscribe|subscriptions keep|by purchasing a subscription|republish (this|our) (article|story)|you can republish|sign up for (our|the|a) (free )?.{0,30}newsletter/i;
const REPEAT_MIN_WORDS = 6;
/** Words a repeat may add, as a credit after a caption. */
const REPEAT_EXTRA_WORDS = 8;

const textOf = (n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim();
const wordsIn = (t) => (t ? t.split(' ').length : 0);
const isJunk = (t) => {
  const w = wordsIn(t);
  return (w > 0 && w <= 40 && FURNITURE.test(t)) || (w > 0 && w <= 200 && PITCH.test(t));
};

/** Words in paragraphs of 12 or more words. With `tight`, junk is skipped and a repeated paragraph counts once. */
function longParagraphWords(root, tight = false) {
  let n = 0;
  const seen = new Set();
  for (const p of root.querySelectorAll('p')) {
    const t = textOf(p);
    const w = wordsIn(t);
    if (w < 12) continue;
    if (tight && (isJunk(t) || seen.has(t))) continue;
    seen.add(t);
    n += w;
  }
  return n;
}

/** The two yardsticks: the page's long paragraphs, plain and tight. */
function pageWords(html) {
  const { document } = parseHTML(html);
  const drop = (sel) => {
    for (const n of [...document.querySelectorAll(sel)]) n.remove();
  };
  drop('nav, header, footer, aside, script, style, noscript, template');
  const plain = longParagraphWords(document);
  drop('dialog, form, [hidden], [aria-hidden="true"], h1, h2, h3, h4, h5, h6');
  return { plain, tight: longParagraphWords(document, true) };
}

/** The original address of a reader photo served from getclearnews.com/img. */
function originalPhoto(src) {
  try {
    const u = new URL(src, 'https://getclearnews.com/');
    if (u.hostname === 'getclearnews.com' && u.pathname === '/img') return u.searchParams.get('u') ?? src;
  } catch {
    // Not a URL: compared as it is.
  }
  return src;
}

/** File names too common to identify a photo (beehiiv calls pasted photos image.png). */
const GENERIC_NAME = /^(image|img|photo|picture|untitled|unnamed|default|original|download|file)(\d{0,3})$/;

/** Query parameters image services use for the original photo (NPR's Brightspot: ?url=). */
const ORIGINAL_PARAMS = ['url', 'u', 'src', 'image'];

/**
 * The photo's file name without size suffix or extension (as photoKey in
 * src/reader/reader.ts), keyed by the original photo when an image service
 * names it in a query parameter, also without Google's "=w528-h297" size suffix.
 * Generic names keep their whole path.
 */
function photoKey(src) {
  try {
    let u = new URL(src, 'https://x.invalid/');
    for (const p of ORIGINAL_PARAMS) {
      const inner = u.searchParams.get(p);
      if (inner && /^https?:\/\//i.test(inner)) {
        u = new URL(inner);
        break;
      }
    }
    const name = (u.pathname.split('/').pop() ?? '')
      .replace(/=[swh]\d+.*$/, '')
      .replace(/\.(jpe?g|png|webp|avif|gif)$/i, '')
      .replace(/[-_]\d{2,4}x\d{2,4}$/, '')
      .toLowerCase();
    return GENERIC_NAME.test(name) ? `${u.hostname}${u.pathname}` : name;
  } catch {
    return '';
  }
}

function samePhoto(a, b) {
  const x = originalPhoto(a), y = originalPhoto(b);
  return x === y || (photoKey(x) !== '' && photoKey(x) === photoKey(y));
}

/** True when one block repeats another, word for word or with a credit added. */
function repeats(t, earlier) {
  const w = wordsIn(t);
  for (const e of earlier) {
    if (t === e) return true;
    const [short, long] = e.length < t.length ? [e, t] : [t, e];
    if (wordsIn(short) >= REPEAT_MIN_WORDS && long.startsWith(short) && wordsIn(long) - wordsIn(short) <= REPEAT_EXTRA_WORDS && w >= REPEAT_MIN_WORDS) {
      return true;
    }
  }
  return false;
}

function scoreContent(html, heroUrl) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = document.body;
  const leaves = [...body.querySelectorAll(LEAF_BLOCKS)].filter((n) => !n.querySelector('p, li, div, blockquote, figure'));
  const junk = [];
  const repeated = [];
  const earlier = [];
  for (const n of leaves) {
    const t = textOf(n);
    if (isJunk(t)) junk.push(t);
    if (wordsIn(t) >= REPEAT_MIN_WORDS) {
      const key = t.toLowerCase();
      if (repeats(key, earlier)) repeated.push(t);
      else earlier.push(key);
    }
  }
  const textless = [...body.querySelectorAll('li')].filter((n) => !textOf(n));
  const emptyBullets = textless.filter((n) => !n.querySelector('img')).length;
  const emptyBlocks = [...body.querySelectorAll('p, div, figure, figcaption, blockquote, h1, h2, h3, h4, h5, h6')].filter(
    (n) => !textOf(n) && !n.querySelector('img, table'),
  ).length;
  const first = body.querySelector('img');
  return {
    paraWords: longParagraphWords(body),
    junk,
    repeated,
    emptyBullets,
    photoBullets: textless.length - emptyBullets,
    emptyBlocks,
    photoTwice: !!first && !!heroUrl && samePhoto(first.getAttribute('src') ?? '', heroUrl),
  };
}

function score(line, dir) {
  const r = line.reader;
  const measured = typeof r?.status === 'string';
  const opened = r?.status === 'ok';
  const s = {
    source_id: line.source_id,
    url: line.url,
    measured,
    opened,
    reason: opened ? null : measured ? r.reason ?? 'unknown' : `http_${line.http}`,
    // The reader fills source_name from the stored feed; without it there is no photo above the title.
    inFeed: !!r?.source_name,
    ms: line.ms,
    // A fresh read is extracted during the request; a cached one up to 6 hours before.
    cached: opened && !!r.extracted_at && Date.parse(r.extracted_at) < Date.parse(line.at) - 5_000,
    extractedAt: opened ? r.extracted_at : null,
    words: opened ? r.word_count ?? 0 : 0,
    paraWords: 0,
    junk: [],
    repeated: [],
    emptyBullets: 0,
    photoBullets: 0,
    emptyBlocks: 0,
    photoTwice: false,
    page: null,
  };
  if (opened && r.content_html) Object.assign(s, scoreContent(r.content_html, s.inFeed ? r.image_url : null));
  const file = line.page.file && join(dir, line.page.file);
  if (file && existsSync(file)) s.page = pageWords(readFileSync(file, 'utf8'));
  s.checked = opened && (s.page?.tight ?? 0) >= MIN_PAGE_WORDS;
  s.cut = s.checked && s.paraWords < CUT * s.page.tight;
  s.checkedPlain = opened && (s.page?.plain ?? 0) >= MIN_PAGE_WORDS;
  s.cutPlain = s.checkedPlain && s.paraWords < CUT * s.page.plain;
  return s;
}

function loadRun(name) {
  const dir = join(RUNS, name);
  const file = join(dir, 'results.jsonl');
  if (!existsSync(file)) throw new Error(`no run at ${dir}`);
  // The first read of each URL only (runs before Nov 5, 2026 could read one URL twice).
  const seen = new Set();
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => !seen.has(l.url) && seen.add(l.url));
  const metaFile = join(dir, 'meta.json');
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null;
  return { name, meta, lines, scores: lines.map((l) => score(l, dir)) };
}

// Reports

const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const nearestRank = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};
const secs = (ms) => `${(ms / 1000).toFixed(2)} s`;
/** A time statistic, or "none" when nothing was timed. */
const stat = (xs, f) => (xs.length ? secs(f(xs)) : 'none');
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '0%');
const countBy = (xs, key) => {
  const c = {};
  for (const x of xs) c[key(x)] = (c[key(x)] ?? 0) + 1;
  return c;
};
const listCounts = (c) => Object.entries(c).map(([k, n]) => `${k} ${n}`).join(', ');

function table(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)));
  return rows.map((r) => r.map((v, c) => (c === 0 ? String(v).padEnd(widths[c]) : String(v).padStart(widths[c]))).join('  ')).join('\n');
}

function totals(scores) {
  const opened = scores.filter((s) => s.opened);
  const notOpened = scores.filter((s) => s.measured && !s.opened);
  const reasons = {};
  for (const s of notOpened) (reasons[s.reason] ??= new Set()).add(s.source_id);
  const cachedAt = opened.filter((s) => s.cached).map((s) => s.extractedAt).sort();
  return {
    n: scores.length,
    sources: new Set(scores.map((s) => s.source_id)).size,
    measured: sum(scores, (s) => +s.measured),
    notMeasured: countBy(scores.filter((s) => !s.measured), (s) => s.reason),
    opened: opened.length,
    failed: countBy(notOpened, (s) => s.reason),
    reasons,
    fresh: opened.filter((s) => !s.cached).map((s) => s.ms),
    cached: opened.filter((s) => s.cached).map((s) => s.ms),
    oldestCached: cachedAt[0] ?? null,
    notInFeed: sum(opened, (s) => +!s.inFeed),
    checked: sum(scores, (s) => +s.checked),
    cut: sum(scores, (s) => +s.cut),
    checkedPlain: sum(scores, (s) => +s.checkedPlain),
    cutPlain: sum(scores, (s) => +s.cutPlain),
    junk: sum(scores, (s) => s.junk.length),
    emptyBullets: sum(scores, (s) => s.emptyBullets),
    photoBullets: sum(scores, (s) => s.photoBullets),
    emptyBlocks: sum(scores, (s) => s.emptyBlocks),
    repeated: sum(scores, (s) => s.repeated.length),
    repeatedArticles: sum(scores, (s) => +(s.repeated.length > 0)),
    photoChecked: sum(opened, (s) => +s.inFeed),
    photoTwice: sum(scores, (s) => +s.photoTwice),
  };
}

function bySource(scores) {
  const groups = new Map();
  for (const s of scores) {
    if (!groups.has(s.source_id)) groups.set(s.source_id, []);
    groups.get(s.source_id).push(s);
  }
  return groups;
}

function report(run) {
  const { scores } = run;
  const t = totals(scores);
  const out = [];
  const shape = run.meta ? `, newest ${run.meta.per_source} per source${run.meta.sources ? ` of ${run.meta.sources.join(', ')}` : ''}` : '';
  const where = run.meta?.reader ? `, read through ${run.meta.reader}${run.meta.sample_from ? ` (the articles of ${run.meta.sample_from})` : ''}` : '';
  out.push(`Reader measurement, run ${run.name}`);
  out.push(`Articles        ${t.n} from ${t.sources} sources${shape}${where}`);
  if (t.n !== t.measured) out.push(`Not measured    ${listCounts(t.notMeasured)} (no answer from the reader; left out below)`);
  out.push(`Opened          ${t.opened} of ${t.measured} (${pct(t.opened, t.measured)})`);
  const failed = Object.entries(t.failed).map(([r, n]) => `${r} ${n} (${[...t.reasons[r]].join(', ')})`);
  out.push(`Not opened      ${failed.join('; ') || 'none'}`);
  out.push(
    `Time to open    fresh reads (${t.fresh.length}): median ${stat(t.fresh, median)}, 90th percentile ${stat(t.fresh, (x) => nearestRank(x, 0.9))}, slowest ${stat(t.fresh, (x) => Math.max(...x))}`,
  );
  out.push(
    `                from the reader's cache (${t.cached.length}): median ${stat(t.cached, median)}${t.oldestCached ? `, oldest extracted ${t.oldestCached}` : ''}`,
  );
  out.push(`Cut short 30%+  ${t.cut} of ${t.checked} checked (${pct(t.cut, t.checked)}), tight yardstick`);
  out.push(`                ${t.cutPlain} of ${t.checkedPlain} checked (${pct(t.cutPlain, t.checkedPlain)}), plain yardstick (#436)`);
  out.push(`Junk lines      ${t.junk}`);
  out.push(`Empty bullets   ${t.emptyBullets} (and ${t.photoBullets} list items holding only a photo, as in galleries)`);
  out.push(`Empty blocks    ${t.emptyBlocks}`);
  out.push(`Repeated text   ${t.repeated} blocks in ${t.repeatedArticles} articles`);
  out.push(`Photo twice     ${t.photoTwice} of ${t.photoChecked} opened articles in the feed`);
  out.push(`Not in the feed ${t.notInFeed} opened (no feed data: no photo above the title, so no photo check)`);

  const rows = [['Source', 'Read', 'Opened', 'Words', 'Checked', 'Cut', 'Plain cut', 'Junk', 'Empty', 'Repeated', 'Photo twice', 'Not opened']];
  for (const [id, ss] of bySource(scores)) {
    const o = ss.filter((s) => s.opened);
    rows.push([
      id,
      ss.length,
      o.length,
      Math.round(median(o.map((s) => s.words))),
      sum(ss, (s) => +s.checked),
      sum(ss, (s) => +s.cut),
      sum(ss, (s) => +s.cutPlain),
      sum(ss, (s) => s.junk.length),
      sum(ss, (s) => s.emptyBullets + s.emptyBlocks),
      sum(ss, (s) => s.repeated.length),
      sum(ss, (s) => +s.photoTwice),
      listCounts(countBy(ss.filter((x) => !x.opened), (x) => x.reason)) || '-',
    ]);
  }
  out.push('', 'Per source (Words: median of opened articles. Checked and Cut: tight yardstick. Empty: bullets and blocks)', table(rows));

  const unchecked = scores.filter((s) => s.opened && !s.checked);
  if (unchecked.length) {
    const why = (s) => (!s.page ? 'page not fetched' : 'under 50 words in long paragraphs');
    out.push('', `Opened but not checked: ${unchecked.length}`);
    for (const [id, ss] of bySource(unchecked)) out.push(`  ${id}  ${listCounts(countBy(ss, why))}`);
  }
  const cuts = scores.filter((s) => s.cut || s.cutPlain);
  if (cuts.length) {
    out.push('', "Cut short: reader words in long paragraphs / the page's, tight and plain");
    for (const s of cuts) out.push(`  ${s.source_id}  ${s.paraWords} / ${s.page.tight}, ${s.page.plain}${s.cut ? '' : ' (plain only)'}  ${s.url}`);
  }
  const junk = scores.filter((s) => s.junk.length);
  if (junk.length) {
    out.push('', 'Junk lines');
    for (const s of junk) for (const j of s.junk) out.push(`  ${s.source_id}  "${j.slice(0, 90)}"  ${s.url}`);
  }
  const rep = scores.filter((s) => s.repeated.length);
  if (rep.length) {
    out.push('', 'Repeated text');
    for (const s of rep) for (const j of s.repeated) out.push(`  ${s.source_id}  "${j.slice(0, 90)}"  ${s.url}`);
  }
  const twice = scores.filter((s) => s.photoTwice);
  if (twice.length) {
    out.push('', 'Photo twice');
    for (const s of twice) out.push(`  ${s.source_id}  ${s.url}`);
  }
  const notFeed = scores.filter((s) => s.opened && !s.inFeed);
  if (notFeed.length) {
    out.push('', 'Not in the feed');
    for (const s of notFeed) out.push(`  ${s.source_id}  ${s.url}`);
  }
  const failedList = scores.filter((s) => !s.opened);
  if (failedList.length) {
    out.push('', 'Not opened or not measured');
    for (const s of failedList) out.push(`  ${s.source_id}  ${s.reason}  ${s.url}`);
  }
  return out;
}

function compare(a, b) {
  // Totals over the sources both runs read, so a run of a few sources compares fairly.
  const common = new Set(a.scores.map((s) => s.source_id).filter((id) => b.scores.some((s) => s.source_id === id)));
  const ta = totals(a.scores.filter((s) => common.has(s.source_id)));
  const tb = totals(b.scores.filter((s) => common.has(s.source_id)));
  const arrow = (x, y) => (x === y ? String(x) : `${x} → ${y}`);
  const out = [`Compared: ${a.name} → ${b.name} (${common.size} sources read by both)`];
  out.push(`Articles        ${arrow(ta.n, tb.n)}`);
  out.push(`Opened          ${arrow(`${ta.opened} of ${ta.measured}`, `${tb.opened} of ${tb.measured}`)}`);
  out.push(`Fresh median    ${arrow(stat(ta.fresh, median), stat(tb.fresh, median))}`);
  out.push(`From the cache  ${arrow(ta.cached.length, tb.cached.length)}`);
  out.push(`Cut short 30%+  ${arrow(`${ta.cut} of ${ta.checked}`, `${tb.cut} of ${tb.checked}`)} tight, ${arrow(`${ta.cutPlain} of ${ta.checkedPlain}`, `${tb.cutPlain} of ${tb.checkedPlain}`)} plain`);
  out.push(`Junk lines      ${arrow(ta.junk, tb.junk)}`);
  out.push(`Empty bullets   ${arrow(ta.emptyBullets, tb.emptyBullets)}`);
  out.push(`Empty blocks    ${arrow(ta.emptyBlocks, tb.emptyBlocks)}`);
  out.push(`Repeated text   ${arrow(ta.repeated, tb.repeated)}`);
  out.push(`Photo twice     ${arrow(`${ta.photoTwice} of ${ta.photoChecked}`, `${tb.photoTwice} of ${tb.photoChecked}`)}`);
  if (tb.cached.length) {
    out.push(
      `Note: ${tb.cached.length} result${tb.cached.length === 1 ? '' : 's'} in ${b.name} came from the reader's cache, the oldest extracted ${tb.oldestCached}.`,
      '      They show the reader as it was then. After a reader change, bump VERSION in src/reader/cache.ts so a rerun reads fresh.',
    );
  }

  const ga = bySource(a.scores), gb = bySource(b.scores);
  const rows = [['Source', 'Opened', 'Words', 'Cut', 'Junk', 'Empty', 'Repeated', 'Photo twice']];
  for (const id of new Set([...ga.keys(), ...gb.keys()])) {
    const x = ga.get(id) ?? [], y = gb.get(id) ?? [];
    const col = (f) => arrow(f(x), f(y));
    rows.push([
      id,
      col((ss) => `${sum(ss, (s) => +s.opened)}/${ss.length}`),
      col((ss) => Math.round(median(ss.filter((s) => s.opened).map((s) => s.words)))),
      col((ss) => sum(ss, (s) => +s.cut)),
      col((ss) => sum(ss, (s) => s.junk.length)),
      col((ss) => sum(ss, (s) => s.emptyBullets + s.emptyBlocks)),
      col((ss) => sum(ss, (s) => s.repeated.length)),
      col((ss) => sum(ss, (s) => +s.photoTwice)),
    ]);
  }
  out.push('', 'Per source (the articles differ between runs unless both ran close together)', table(rows));

  // The same article in both runs: what changed for it.
  const before = new Map(a.scores.map((s) => [s.url, s]));
  const changed = [];
  for (const s of b.scores) {
    const p = before.get(s.url);
    if (!p) continue;
    if (p.opened !== s.opened || Math.abs(s.words - p.words) >= 0.1 * Math.max(p.words, 1)) {
      changed.push(`  ${s.source_id}  ${p.opened ? p.words : p.reason} → ${s.opened ? s.words : s.reason} words  ${s.url}`);
    }
  }
  const same = b.scores.filter((s) => before.has(s.url)).length;
  out.push('', `Same article in both runs: ${same}; opened or words changed by 10% or more: ${changed.length}`, ...changed);
  return out;
}

// Commands

/** The newest earlier run with the same shape (per-source count and source list). */
function previousRun(name, meta) {
  const same = (m) => m && m.per_source === meta.per_source && JSON.stringify(m.sources) === JSON.stringify(meta.sources);
  return readdirSync(RUNS)
    .filter((n) => n < name && existsSync(join(RUNS, n, 'results.jsonl')))
    .filter((n) => existsSync(join(RUNS, n, 'meta.json')) && same(JSON.parse(readFileSync(join(RUNS, n, 'meta.json'), 'utf8'))))
    .sort()
    .pop();
}

function takeLock() {
  mkdirSync(RUNS, { recursive: true });
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      // No such process: a stale lock.
    }
    if (alive) throw new Error(`another run is going (PID ${pid}); two at once would pass the reader's rate limit`);
  }
  writeFileSync(LOCK, String(process.pid));
}

async function run(perSource, only) {
  takeLock();
  try {
    const picks = process.env.SAMPLE_FROM ? loadRun(process.env.SAMPLE_FROM).lines.map(({ source_id, source_name, url, title, published_at }) => ({ source_id, source_name, url, title, published_at })) : sample(await readState(), perSource, only);
    if (!picks.length) throw new Error('nothing to read: check the source ids');
    const name = new Date().toISOString().slice(0, 19).replace(/:/g, '-') + 'Z';
    const dir = join(RUNS, name);
    mkdirSync(join(dir, 'pages'), { recursive: true });
    const meta = {
      per_source: perSource,
      sources: only ? [...only].sort() : null,
      ...(process.env.READER_BASE ? { reader: READER_BASE } : {}),
      ...(process.env.SAMPLE_FROM ? { sample_from: process.env.SAMPLE_FROM } : {}),
    };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta) + '\n');
    const sources = new Set(picks.map((p) => p.source_id)).size;
    console.log(`${picks.length} articles from ${sources} sources at ${PER_MINUTE} a minute: about ${Math.ceil(picks.length / PER_MINUTE)} minutes`);
    console.log(`Saving to ${dir}`);
    const gap = 60_000 / PER_MINUTE;
    for (const [i, p] of picks.entries()) {
      const start = Date.now();
      const reader = await readOne(p.url);
      const page = await fetchPage(p.url);
      const file = page.html ? `pages/${i}.html` : null;
      if (file) writeFileSync(join(dir, file), page.html);
      const line = { i, ...p, at: reader.at, http: reader.http, ms: reader.ms, reader: reader.body, page: { status: page.status, file } };
      if (reader.error) line.error = reader.error;
      appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(line) + '\n');
      const r = reader.body;
      const what = r?.status === 'ok' ? `ok ${r.word_count} words` : `failed ${r?.reason ?? reader.http}`;
      console.log(`[${i + 1}/${picks.length}] ${p.source_id}  ${what}  ${secs(reader.ms)}  page ${page.status}`);
      await sleep(Math.max(0, gap - (Date.now() - start)));
    }
    const current = loadRun(name);
    const out = report(current);
    const previous = previousRun(name, meta);
    if (previous) out.push('', ...compare(loadRun(previous), current));
    writeFileSync(join(dir, 'summary.txt'), out.join('\n') + '\n');
    console.log('\n' + out.join('\n'));
  } finally {
    unlinkSync(LOCK);
  }
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === 'run') {
  const perSource = Number(x ?? 5);
  if (!Number.isInteger(perSource) || perSource < 1) throw new Error('per-source must be a whole number of 1 or more');
  await run(perSource, y ? new Set(y.split(',')) : null);
} else if (cmd === 'report' && x) {
  console.log(report(loadRun(x)).join('\n'));
} else if (cmd === 'compare' && x && y) {
  console.log(compare(loadRun(x), loadRun(y)).join('\n'));
} else {
  console.log(
    'usage: node scripts/measure-reader.mjs run [per-source] [id,id]\n' +
      '       node scripts/measure-reader.mjs report <run>\n' +
      '       node scripts/measure-reader.mjs compare <older run> <newer run>',
  );
  process.exit(1);
}
