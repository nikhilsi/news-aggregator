// Builds the Feed the API serves from per-source articles: one list per tab,
// computed the way get_articles computed it per request (spec section 4 step 6),
// plus the AI step's results (#414 step 2):
//   - "latest" is what the first tab showed until Nov 1, 2026: every source merged
//   - "all" (named Today) is the hourly brief, or the Latest list without one
//   - deals, betting, quizzes, listicles and celebrity items are dropped everywhere
//   - each tab shows one card per story; the card lists the other outlets
//   - AI, Physical AI and Space also show matching stories from other sources

import { CATEGORIES, SOURCES } from '../sources.ts';
import { BRIEF_MAX_AGE_MS } from '../ai/brief.ts';
import { DROPPED_KINDS } from '../ai/labels.ts';
import { groupStories, type Story } from '../ai/stories.ts';
import { FEED_VERSION, type AiItem, type AiStore, type Article, type Coverage, type Feed, type FeedArticle, type Topic } from '../types.ts';
import { mergeForTab } from './merge.ts';
import { trimSource } from './trim.ts';

export const enabledSources = () => SOURCES.filter((s) => s.enabled);

/** Sources for a tab, in sources order; "all" and "latest" are every enabled source. */
export function sourcesForTab(category: string) {
  const enabled = enabledSources();
  return category === 'all' || category === 'latest' ? enabled : enabled.filter((s) => s.category === category);
}

/** Tabs that also take matching stories from other sources, by the model's topics. */
const TAGGED: Record<string, (t: Topic[]) => boolean> = {
  ai: (t) => t[0] === 'ai',
  physical_ai: (t) => t.includes('physical_ai'),
  space: (t) => t.includes('space'),
};

/** Keeps the first card of each story; articles outside any story stay. */
function onePerStory(list: Article[], storyOf: ReadonlyMap<Article, Story>): Article[] {
  const seen = new Set<Story>();
  return list.filter((a) => {
    const s = storyOf.get(a);
    if (!s) return true;
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * The other outlets in a story, one entry each. One article can sit in two feeds
 * (Ars Technica AI and Tech share URLs), so an entry with the card's own URL or a
 * URL already listed is skipped (#453): it would open the same article and count
 * one outlet twice in "Covered by N outlets".
 */
function coverage(a: Article, story: Story | undefined): Coverage[] {
  if (!story) return [];
  const names = new Set([a.source_name]);
  const urls = new Set([a.url]);
  const out: Coverage[] = [];
  for (const m of story.members) {
    if (names.has(m.source_name) || urls.has(m.url)) continue;
    names.add(m.source_name);
    urls.add(m.url);
    out.push({ source_name: m.source_name, title: m.title, url: m.url });
  }
  return out;
}

export function buildFeed(articlesBySource: ReadonlyMap<string, Article[]>, now: number, ai: AiStore | null = null): Feed {
  const items: Readonly<Record<string, AiItem>> = ai?.items ?? {};
  const label = (a: Article) => (Object.hasOwn(items, a.url) ? items[a.url] : undefined);
  const shown = (a: Article) => {
    const k = label(a)?.k;
    return !k || !DROPPED_KINDS.has(k);
  };
  const trimmed = new Map(
    enabledSources().map((s) => [s.id, trimSource(articlesBySource.get(s.id) ?? [], now, s.maxItems).filter(shown)]),
  );
  const storyOf = groupStories([...trimmed.values()].flat(), items, now);

  const index = new Map<Article, number>();
  const articles: FeedArticle[] = [];
  const idx = (a: Article) => {
    let i = index.get(a);
    if (i === undefined) {
      i = articles.length;
      index.set(a, i);
      articles.push({ ...a, topics: label(a)?.t ?? [], coverage: coverage(a, storyOf.get(a)) });
    }
    return i;
  };

  const lists: Record<string, number[]> = {};
  const tabs = new Set([...CATEGORIES.map((c) => c.id), ...enabledSources().map((s) => s.category)]);
  tabs.delete('all');
  for (const tab of tabs) {
    const own = sourcesForTab(tab);
    const perSource = own.map((s) => trimmed.get(s.id) ?? []);
    const match = Object.hasOwn(TAGGED, tab) ? TAGGED[tab] : null;
    if (match) {
      const ownIds = new Set(own.map((s) => s.id));
      const extra = enabledSources()
        .filter((s) => !ownIds.has(s.id))
        .flatMap((s) => trimmed.get(s.id) ?? [])
        .filter((a) => match(label(a)?.t ?? []));
      if (extra.length) perSource.push(extra);
    }
    lists[tab] = onePerStory(mergeForTab(perSource, tab === 'latest' ? 'all' : tab), storyOf).map(idx);
  }

  // Today: the brief while it is under 6 hours old, else the Latest list.
  const brief = ai?.brief && now - ai.brief.at <= BRIEF_MAX_AGE_MS ? ai.brief : null;
  let briefAt: number | null = null;
  lists.all = lists.latest;
  if (brief) {
    const byUrl = new Map<string, Article>();
    for (const a of [...trimmed.values()].flat()) if (!byUrl.has(a.url)) byUrl.set(a.url, a);
    const picked = brief.urls.flatMap((u) => (byUrl.has(u) ? [byUrl.get(u)!] : []));
    if (picked.length) {
      lists.all = picked.map(idx);
      briefAt = brief.at;
    }
  }
  return { v: FEED_VERSION, built_at: now, articles, lists, brief_at: briefAt };
}
