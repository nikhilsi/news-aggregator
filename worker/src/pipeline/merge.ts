// Port of the merge steps in backend/app/articles/service.py: the non-Latin
// filter, dedup (URL, then title keywords within a category) and the two-tier
// sort. Same inputs in the same order give the same output as the Python code.

import type { Article } from '../types.ts';

const LETTER = /\p{L}/u;

/** _is_non_latin_text: more than 20 percent of letters above U+024F. */
export function isNonLatin(text: string, threshold = 0.2): boolean {
  if (!text) return false;
  let latin = 0;
  let nonLatin = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    if (ch.codePointAt(0)! <= 0x024f) latin++;
    else nonLatin++;
  }
  const total = latin + nonLatin;
  return total > 0 && nonLatin / total > threshold;
}

const STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'can', 'could', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or',
  'if', 'not', 'no', 'its', 'it', 'this', 'that', 'an', 'up', 'so', 'than',
  'new', 'says', 'how', 'why', 'what', 'who', 'when', 'where', 'about',
]);

const OVERLAP_THRESHOLD = 0.6;

export function titleKeywords(title: string): Set<string> {
  const t = title.toLowerCase().replaceAll("'s ", ' ').replaceAll("'s", '');
  const words = t.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => !STOP_WORDS.has(w) && w.length > 2));
}

function titlesMatch(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap / Math.min(a.size, b.size) >= OVERLAP_THRESHOLD;
}

/** _article_priority as one number: (is_direct, has_image) compared as a tuple. */
function priority(a: Article): number {
  const isDirect = a.source_name.includes('Google News') ? 0 : 1;
  const hasImage = a.image_url ? 1 : 0;
  return isDirect * 2 + hasImage;
}

/** _deduplicate, step for step. */
export function deduplicate(articles: Article[]): Article[] {
  if (!articles.length) return articles;
  const urlSeen = new Map<string, Article>();
  const catIndex = new Map<string, [Set<string>, Article][]>();
  const removed = new Set<Article>();
  const kept: Article[] = [];
  const bucket = (cat: string) => {
    let b = catIndex.get(cat);
    if (!b) catIndex.set(cat, (b = []));
    return b;
  };

  for (const article of articles) {
    const url = article.url;
    const cat = article.category;
    const p = priority(article);

    const existing = urlSeen.get(url);
    if (existing) {
      if (p > priority(existing)) {
        removed.add(existing);
        urlSeen.set(url, article);
        bucket(cat).push([titleKeywords(article.title), article]);
        kept.push(article);
      }
      continue;
    }

    const keywords = titleKeywords(article.title);
    let isDupe = false;
    for (const [kw, other] of catIndex.get(cat) ?? []) {
      if (removed.has(other)) continue;
      if (titlesMatch(keywords, kw)) {
        if (p > priority(other)) {
          removed.add(other);
          urlSeen.delete(other.url);
          urlSeen.set(url, article);
          bucket(cat).push([keywords, article]);
          kept.push(article);
        }
        isDupe = true;
        break;
      }
    }
    if (!isDupe) {
      urlSeen.set(url, article);
      bucket(cat).push([keywords, article]);
      kept.push(article);
    }
  }
  return removed.size ? kept.filter((a) => !removed.has(a)) : kept;
}

/**
 * _tiered_sort. Newest first; undated articles go last (Python raised a
 * TypeError when dated and undated articles met, O1). Stable, like Python's sort.
 */
export function tieredSort(articles: Article[], category: string): Article[] {
  if (!articles.length) return articles;
  const key = (a: Article) => a.published_at ?? '';
  // ISO strings in one format sort the same as the dates they hold.
  const sorted = articles
    .map((a, i) => [a, i] as const)
    .sort(([a, i], [b, j]) => {
      const ka = key(a);
      const kb = key(b);
      if (ka !== kb) return ka < kb ? 1 : -1;
      return i - j;
    })
    .map(([a]) => a);

  const tier1 = new Set<Article>();
  if (category === 'all') {
    const firstPerSource = new Map<string, Article>();
    for (const a of sorted) if (!firstPerSource.has(a.source_id)) firstPerSource.set(a.source_id, a);
    const perCat = new Map<string, number>();
    for (const a of firstPerSource.values()) {
      const n = perCat.get(a.category) ?? 0;
      if (n < 3) {
        perCat.set(a.category, n + 1);
        tier1.add(a);
      }
    }
  } else {
    const perSource = new Map<string, number>();
    for (const a of sorted) {
      const n = perSource.get(a.source_id) ?? 0;
      if (n < 5) {
        perSource.set(a.source_id, n + 1);
        tier1.add(a);
      }
    }
  }
  return [...sorted.filter((a) => tier1.has(a)), ...sorted.filter((a) => !tier1.has(a))];
}

/**
 * The list for one tab, as get_articles built it per request: the given
 * sources' articles in sources order, the non-Latin filter, dedup, then the
 * two-tier sort for `category`. Until Nov 1, 2026 the India tab kept
 * non-Latin (Hindi) titles; Nikhil chose to hide them there too (#413).
 */
export function mergeForTab(perSource: Article[][], category: string): Article[] {
  const all = perSource.flat().filter((a) => !isNonLatin(a.title));
  return tieredSort(deduplicate(all), category);
}
