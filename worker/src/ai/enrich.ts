// The AI step of each cron run (#414 step 2), after the feeds are fetched:
//   1. forget articles the cron no longer holds
//   2. label new articles, newest first (batches of 25, up to 8 at once)
//   3. embed labeled articles from the last 48 hours
//   4. once an hour, when everything recent is labeled and embedded, pick the
//      Today brief
// Each call has a time limit inside the run's deadline; whatever is left waits
// for the next run. If Workers AI fails, nothing breaks: unlabeled articles
// count as news and Today keeps its last brief (or shows the full list).

import { isNonLatin } from '../pipeline/merge.ts';
import { AI_VERSION, type AiStore, type Article } from '../types.ts';
import { askEditor, BRIEF_EVERY_MS, pickBrief, shortlist } from './brief.ts';
import { LABEL_BATCH, labelBatch } from './labels.ts';
import { groupStories, isRecent } from './stories.ts';
import { embed, pack, type AiRunner } from './vectors.ts';

const LABEL_WAVE = 8;
const MIN_LEFT_LABEL_MS = 20_000;
const MIN_LEFT_EMBED_MS = 5_000;
const MIN_LEFT_BRIEF_MS = 8_000;
const BRIEF_WINDOW_MS = 30 * 3600e3;
/** Fewer stories than this and Today keeps its last brief (or the full list). */
const MIN_BRIEF = 5;

export interface EnrichSummary {
  labeled: number;
  label_failures: number;
  embedded: number;
  unlabeled_left: number;
  brief: string;
}

/** `p`, or a timeout error after `ms`; the timer stops when `p` settles. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timeout')), ms)));
  return Promise.race([p, timeout]).finally(() => timer !== undefined && clearTimeout(timer));
}

const embedText = (a: Article) => `${a.title}. ${a.summary ?? ''}`.slice(0, 400);

export async function enrich(
  ai: AiRunner | undefined,
  held: Article[],
  prev: AiStore | null,
  sourceOrder: ReadonlyMap<string, number>,
  now: number,
  deadline: number,
): Promise<{ store: AiStore; changed: boolean; summary: EnrichSummary }> {
  const store: AiStore = prev ? { ...prev, items: { ...prev.items } } : { v: AI_VERSION, items: {}, brief: null };
  let changed = prev === null;
  const summary: EnrichSummary = { labeled: 0, label_failures: 0, embedded: 0, unlabeled_left: 0, brief: 'not due' };
  const left = () => deadline - Date.now();
  // Hindi and other non-Latin headlines are hidden in every tab (#413): never labeled or picked.
  const articles = held.filter((a) => !isNonLatin(a.title));

  // 1. Forget what the cron no longer holds; drop embeddings past 48 hours.
  const byUrl = new Map<string, Article>();
  for (const a of articles) if (!byUrl.has(a.url)) byUrl.set(a.url, a);
  for (const [url, item] of Object.entries(store.items)) {
    const a = byUrl.get(url);
    if (!a) {
      delete store.items[url];
      changed = true;
    } else if (item.e && !isRecent(a, now)) {
      store.items[url] = { k: item.k, t: item.t, imp: item.imp };
      changed = true;
    }
  }

  // 2. Labels, newest first.
  const newest = [...byUrl.values()].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const unlabeled = newest.filter((a) => !Object.hasOwn(store.items, a.url));
  if (ai && unlabeled.length && left() >= MIN_LEFT_LABEL_MS) {
    const batches: Article[][] = [];
    for (let i = 0; i < unlabeled.length && batches.length < LABEL_WAVE; i += LABEL_BATCH) batches.push(unlabeled.slice(i, i + LABEL_BATCH));
    const results = await Promise.allSettled(batches.map((b) => within(labelBatch(ai, b), left() - 3_000)));
    for (const r of results) {
      if (r.status === 'rejected') {
        summary.label_failures++;
        console.warn(JSON.stringify({ msg: 'ai labels failed', error: String(r.reason) }));
        continue;
      }
      for (const [url, item] of r.value) store.items[url] = item;
      summary.labeled += r.value.size;
      if (r.value.size) changed = true;
    }
  }
  summary.unlabeled_left = newest.filter((a) => !Object.hasOwn(store.items, a.url)).length;

  // 3. Embeddings for labeled articles from the last 48 hours.
  const toEmbed = newest.filter((a) => Object.hasOwn(store.items, a.url) && !store.items[a.url].e && isRecent(a, now));
  if (ai && toEmbed.length && left() >= MIN_LEFT_EMBED_MS) {
    try {
      const vectors = await within(embed(ai, toEmbed.map(embedText)), left() - 2_000);
      toEmbed.forEach((a, i) => (store.items[a.url] = { ...store.items[a.url], e: pack(vectors[i]) }));
      summary.embedded = toEmbed.length;
      changed = true;
    } catch (e) {
      console.warn(JSON.stringify({ msg: 'ai embeddings failed', error: String(e) }));
    }
  }

  // 4. The hourly brief, once the articles from the last 30 hours are labeled and
  // embedded (a few stragglers the model keeps skipping may not block it).
  const due = !store.brief || now - store.brief.at >= BRIEF_EVERY_MS;
  if (ai && due) {
    const recent = newest.filter((a) => a.published_at && now - Date.parse(a.published_at) <= BRIEF_WINDOW_MS);
    const missing = recent.filter((a) => !(Object.hasOwn(store.items, a.url) && store.items[a.url].e)).length;
    const ready = missing <= Math.max(2, Math.floor(recent.length * 0.05));
    if (!ready) summary.brief = `waiting for ${missing} labels`;
    else if (left() < MIN_LEFT_BRIEF_MS) summary.brief = 'no time left';
    else {
      const list = shortlist(groupStories(articles, store.items, now).values(), store.items, sourceOrder, now);
      try {
        if (list.length < MIN_BRIEF) throw new Error(`only ${list.length} candidates`);
        const picks = await within(askEditor(ai, list), left() - 2_000);
        const brief = pickBrief(list, picks);
        if (brief.length < MIN_BRIEF) throw new Error(`only ${brief.length} stories picked`);
        store.brief = { at: now, urls: brief.map((c) => c.rep.url) };
        changed = true;
        summary.brief = `built ${brief.length}`;
        console.log(
          JSON.stringify({
            msg: 'brief built',
            picks,
            brief: brief.map((c) => `${c.rep.source_name} | ${c.rep.title} | ${c.outlets.length} outlets`),
            shortlist: list.map((c, i) => `${i}. ${c.score.toFixed(2)} ${c.rep.source_name} | ${c.rep.title}`),
          }),
        );
      } catch (e) {
        summary.brief = 'editor failed';
        console.warn(JSON.stringify({ msg: 'ai brief failed', error: String(e) }));
      }
    }
  }
  return { store, changed, summary };
}
