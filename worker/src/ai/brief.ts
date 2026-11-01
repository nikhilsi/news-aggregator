// The Today brief (#414): about 10 stories, rebuilt hourly. A score makes a
// shortlist of 40; one model call picks and orders 14 as an editor would; then
// near repeats and too many India or US politics stories are dropped and the
// first 10 kept. The score alone made a poor brief on live data (three India
// politics items, market commentary), the editor pass a good one (Nov 1, 2026).
// The model picks; every word shown stays the publisher's.

import type { AiItem, Article, Topic } from '../types.ts';
import { askJson, BRIEF_KINDS, chatContent } from './labels.ts';
import type { Story } from './stories.ts';
import { dot, type AiRunner } from './vectors.ts';

export const BRIEF_SIZE = 10;
export const BRIEF_EVERY_MS = 60 * 60e3;
/** An older brief is not shown; Today falls back to the full list. */
export const BRIEF_MAX_AGE_MS = 6 * 60 * 60e3;
const SHORTLIST = 40;
const EDITOR_PICKS = 14;
const CANDIDATE_MS = 30 * 3600e3;
/**
 * Two picks this similar are too close for one brief. On live data (Nov 1, 2026)
 * pairs from 0.70 to 0.75 were the same event or a close follow-up (cyclone
 * updates, one rally from two outlets); pairs near 0.62 were different stories
 * (two separate OpenAI stories), so a lower cutoff would drop real news.
 */
export const NEAR_REPEAT = 0.7;
const CAPS: Partial<Record<Topic, number>> = { india: 2, us_politics: 2 };
const BOOST: Partial<Record<Topic, number>> = { physical_ai: 1.5, ai: 1, space: 1, seattle: 1, india: 0.5, markets: 0.5 };

export interface Candidate {
  story: Story;
  /** The article Today shows: the most important, then one with an image, then the first source listed. */
  rep: Article;
  outlets: string[];
  topics: Topic[];
  score: number;
}

const time = (a: Article) => (a.published_at ? Date.parse(a.published_at) : 0);

/** Stories from the last 30 hours with a news or analysis piece, best score first. */
export function shortlist(
  stories: Iterable<Story>,
  items: Readonly<Record<string, AiItem>>,
  sourceOrder: ReadonlyMap<string, number>,
  now: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const story of new Set(stories)) {
    const labeled = story.members.filter((a) => Object.hasOwn(items, a.url));
    const eligible = labeled.filter((a) => BRIEF_KINDS.has(items[a.url].k));
    if (!eligible.length || now - Math.max(...story.members.map(time)) > CANDIDATE_MS) continue;
    const rep = [...eligible].sort(
      (a, b) =>
        items[b.url].imp - items[a.url].imp ||
        Number(!!b.image_url) - Number(!!a.image_url) ||
        (sourceOrder.get(a.source_id) ?? 0) - (sourceOrder.get(b.source_id) ?? 0),
    )[0];
    const outlets = [...new Set(story.members.map((a) => a.source_name))];
    const topics = [...new Set([...items[rep.url].t, ...labeled.flatMap((a) => items[a.url].t)])];
    const imp = Math.max(...labeled.map((a) => items[a.url].imp));
    const boost = Math.max(0, ...topics.map((t) => BOOST[t] ?? 0));
    const ageHours = (now - Math.max(...story.members.map(time))) / 3600e3;
    out.push({ story, rep, outlets, topics, score: imp + 0.75 * Math.min(outlets.length - 1, 3) + boost - ageHours / 24 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, SHORTLIST);
}

const EDITOR = `You are the editor of a short morning news brief for one reader in Seattle. The reader wants the most important US and world news of the day, plus their interests: AI, physical AI (robots, humanoids, self-driving cars), space, technology, Seattle and Washington state, India, and markets.
From the numbered candidate stories, pick ${EDITOR_PICKS} and order them most important first. Each candidate lists the outlets that covered it.
Rules:
- Prefer concrete news (what happened) over commentary, previews and advice.
- A story covered by more outlets usually matters more.
- Mix the brief: include at least one AI or physical AI story, and at least three of the reader's interests in total.
- At most 2 stories about India and at most 2 about US politics.
- For US politics, keep a balance of right- and left-leaning coverage: prefer stories covered by both Fox News and NPR News, or pick one covered by each.
- Do not pick two stories about the same event.`;

const EDITOR_SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'integer' } } }, required: ['picks'] };

/** The editor's picks as shortlist indices, most important first. */
export async function askEditor(ai: AiRunner, list: Candidate[]): Promise<number[]> {
  const user = list
    .map((c, i) => `${i}. [${c.outlets.join(', ')}] [${c.topics.join(', ')}] ${c.rep.title} :: ${(c.rep.summary ?? '').slice(0, 160)}`)
    .join('\n');
  const res = await askJson(ai, EDITOR, user, 'brief', EDITOR_SCHEMA, 300);
  const picks = (JSON.parse(chatContent(res)) as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) throw new Error('editor: no picks');
  return picks.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < list.length);
}

/**
 * The brief: the editor's picks in order (or the shortlist order when there are
 * none), then the rest of the shortlist to fill; near repeats and stories over
 * the India and US politics caps are skipped.
 */
export function pickBrief(list: Candidate[], picks: number[] | null): Candidate[] {
  const order = [...new Set([...(picks ?? []), ...list.keys()])];
  const kept: Candidate[] = [];
  const perTopic = new Map<Topic, number>();
  for (const i of order) {
    const c = list[i];
    if (kept.some((k) => dot(k.story.centroid, c.story.centroid) >= NEAR_REPEAT)) continue;
    if (c.topics.some((t) => CAPS[t] !== undefined && (perTopic.get(t) ?? 0) >= CAPS[t]!)) continue;
    for (const t of c.topics) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
    kept.push(c);
    if (kept.length === BRIEF_SIZE) break;
  }
  return kept;
}
