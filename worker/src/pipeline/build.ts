// Builds the Feed the API serves from per-source articles: one list per tab,
// computed the way get_articles computed it per request (spec section 4 step 6).

import { CATEGORIES, SOURCES } from '../sources.ts';
import { FEED_VERSION, type Article, type Feed } from '../types.ts';
import { mergeForTab } from './merge.ts';

export const enabledSources = () => SOURCES.filter((s) => s.enabled);

/** Sources for a tab, in sources order; "all" is every enabled source. */
export function sourcesForTab(category: string) {
  const enabled = enabledSources();
  return category === 'all' ? enabled : enabled.filter((s) => s.category === category);
}

export function buildFeed(articlesBySource: ReadonlyMap<string, Article[]>, now: number): Feed {
  const index = new Map<Article, number>();
  const articles: Article[] = [];
  const lists: Record<string, number[]> = {};
  const tabs = new Set(['all', ...CATEGORIES.map((c) => c.id), ...enabledSources().map((s) => s.category)]);
  for (const tab of tabs) {
    const perSource = sourcesForTab(tab).map((s) => articlesBySource.get(s.id) ?? []);
    lists[tab] = mergeForTab(perSource, tab).map((a) => {
      let i = index.get(a);
      if (i === undefined) {
        i = articles.length;
        index.set(a, i);
        articles.push(a);
      }
      return i;
    });
  }
  return { v: FEED_VERSION, built_at: now, articles, lists };
}
