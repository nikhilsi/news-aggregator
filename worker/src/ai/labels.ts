// Labels for each article (#414): what kind of piece it is, its topics and how
// much it matters. The model only labels; nothing it writes reaches a reader.
// Tested on 275 live articles on Nov 1, 2026: 39 s, 380 Neurons, no failures.

import { KINDS, TOPICS, type AiItem, type Article, type Kind, type Topic } from '../types.ts';
import type { AiRunner } from './vectors.ts';

export const TEXT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
export const LABEL_BATCH = 25;

/** Never shown in any tab (Nikhil, Nov 1, 2026). */
export const DROPPED_KINDS: ReadonlySet<Kind> = new Set(['deals', 'betting', 'quiz', 'listicle', 'celebrity']);
/** The only kinds Today picks from. */
export const BRIEF_KINDS: ReadonlySet<Kind> = new Set(['news', 'analysis']);

const SYSTEM = `You label news items for a personal news reader. For every item return its index, kind, topics and importance.
kind, exactly one:
- news: reports a new event, decision, release, result or development
- analysis: explains or examines a news development
- feature: long-form story, profile, history, travel or science story that is not tied to a new event
- howto: advice, tips, guides, recipes, explainers of how to do something
- deals: shopping, sales, discounts, product roundups, gift and buying guides
- betting: odds, picks, predictions for bets, fantasy sports, sportsbook promo codes
- quiz: quizzes, puzzles, games
- listicle: numbered lists of trivia or curiosities
- celebrity: celebrity gossip, influencers, red carpet, reality TV
- opinion: an opinion column or editorial
topics, zero to three, main topic first: ai, physical_ai (robots, humanoids, self-driving cars, drones, embodied AI), space, seattle (Seattle or Washington state), india, markets (stocks, the economy, company earnings), us_politics, world, science, tech, health, sports, entertainment.
importance, 1 to 5: how much a well-informed general reader would want to know this today. 5 = major national or world event. 4 = significant development in its field. 3 = notable. 2 = minor. 1 = trivial.`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          kind: { type: 'string', enum: [...KINDS] },
          topics: { type: 'array', items: { type: 'string', enum: [...TOPICS] } },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['i', 'kind', 'topics', 'importance'],
      },
    },
  },
  required: ['items'],
};

/** The text a model sees for one article (also what gets embedded). */
export const articleText = (a: Article, chars = 200) => `${a.title} :: ${(a.summary ?? '').slice(0, chars)}`;

/** JSON text from a chat answer: OpenAI shape (Gemma 4) or the older { response }. */
export function chatContent(res: unknown): string {
  const r = res as { choices?: { message?: { content?: unknown } }[]; response?: unknown };
  const c = r?.choices?.[0]?.message?.content ?? r?.response;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') return JSON.stringify(c);
  throw new Error('chat: no content');
}

/** Asks the text model for JSON matching `schema`, thinking off (it costs 10 s and the answer). */
export function askJson(ai: AiRunner, system: string, user: string, name: string, schema: object, maxTokens: number) {
  return ai.run(TEXT_MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
    max_tokens: maxTokens,
    temperature: 0,
  });
}

const KIND_SET = new Set<string>(KINDS);
const TOPIC_SET = new Set<string>(TOPICS);

/** Labels up to 25 articles. Items the model skips or garbles are left out. */
export async function labelBatch(ai: AiRunner, batch: Article[]): Promise<Map<string, AiItem>> {
  const user = batch.map((a, i) => `${i}. [${a.source_name}] ${articleText(a)}`).join('\n');
  const res = await askJson(ai, SYSTEM, user, 'labels', SCHEMA, 3000);
  const parsed = JSON.parse(chatContent(res)) as { items?: { i: number; kind: string; topics: string[]; importance: number }[] };
  const out = new Map<string, AiItem>();
  for (const x of parsed.items ?? []) {
    const a = Number.isInteger(x?.i) ? batch[x.i] : undefined;
    if (!a || !KIND_SET.has(x.kind) || !Array.isArray(x.topics)) continue;
    const t = [...new Set(x.topics.filter((t) => TOPIC_SET.has(t)))].slice(0, 3) as Topic[];
    const imp = Math.min(5, Math.max(1, Math.round(Number(x.importance) || 1)));
    out.set(a.url, { k: x.kind as Kind, t, imp });
  }
  return out;
}
