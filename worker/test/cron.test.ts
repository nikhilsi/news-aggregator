import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDue, runCron } from '../src/cron.ts';
import { enabledSources } from '../src/pipeline/build.ts';
import { AI_KEY, FEED_KEY, readAi, readFeed, readState, STATE_KEY } from '../src/store.ts';
import { EMBED_MODEL } from '../src/ai/vectors.ts';
import type { State } from '../src/types.ts';

const MIN = 60_000;
const T0 = Date.parse('2026-11-01T12:00:00Z');

/** One small RSS document per source; items without images get og lookups. */
const rss = (id: string, n = 2, withImage = true) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${id}</title><link>https://${id}.test</link><description>d</description>` +
  Array.from({ length: n }, (_, i) =>
    `<item><title>alpha${id.replace(/-/g, '')}${i} bravo${id.replace(/-/g, '')}${i} charlie${id.replace(/-/g, '')}${i}</title><link>https://${id}.test/a${i}</link>` +
    `<pubDate>Sun, 01 Nov 2026 1${i}:00:00 GMT</pubDate><description>Summary ${i}</description>` +
    (withImage ? `<media:thumbnail url="https://${id}.test/i${i}.jpg"/>` : '') +
    `</item>`,
  ).join('') +
  `</channel></rss>`;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
let calls: string[];

beforeEach(async () => {
  calls = [];
  await env.CACHE.delete(STATE_KEY);
  await env.CACHE.delete(FEED_KEY);
  await env.CACHE.delete(AI_KEY);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/cdn-cgi/trace')) return new Response('fl=1\ncolo=SEA\n');
    calls.push(url);
    return handler(url, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const feedUrls = () => new Map(enabledSources().map((s) => [s.url, s.id]));

describe('isDue', () => {
  const st = (checked: number, failures = 0) => ({ checked_at: checked, failures }) as State['sources'][string];
  it('15 minutes after the last check, 5 after a failure', () => {
    expect(isDue(undefined, T0)).toBe(true);
    expect(isDue(st(T0 - 14 * MIN), T0)).toBe(false);
    expect(isDue(st(T0 - 15 * MIN), T0)).toBe(true);
    expect(isDue(st(T0 - 5 * MIN, 1), T0)).toBe(true);
    expect(isDue(st(T0 - 4 * MIN, 1), T0)).toBe(false);
  });
});

describe('runCron', () => {
  it('first run is a full run: every enabled source, feed then state written', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'), { headers: { etag: '"e1"' } });
    const r = await runCron(env, T0);
    expect(r.full).toBe(true);
    expect(Object.keys(r.fetched)).toHaveLength(enabledSources().length);
    expect(r.feed_written && r.state_written).toBe(true);
    const feed = (await readFeed(env.CACHE))!;
    expect(feed.lists.all.length).toBe(enabledSources().length * 2);
    const state = (await readState(env.CACHE))!;
    expect(state.run_seq).toBe(1);
    expect(r.colo).toBe('SEA');
    expect(state.sources['the-verge'].colo).toBe('SEA');
    expect(state.sources['the-verge'].etag).toBe('"e1"');
  });

  it('next minute: nothing due, nothing fetched or written', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'));
    await runCron(env, T0);
    calls = [];
    const r = await runCron(env, T0 + MIN);
    expect(calls).toEqual([]);
    expect(r.state_written).toBe(false);
  });

  it('sends validators when due, and a 304 keeps the articles', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'), { headers: { etag: '"e1"', 'last-modified': 'Sun, 01 Nov 2026 11:00:00 GMT' } });
    await runCron(env, T0);
    const seen: Record<string, string | null> = {};
    handler = (u, init) => {
      seen[u] = new Headers(init?.headers).get('if-none-match');
      return new Response(null, { status: 304 });
    };
    const r = await runCron(env, T0 + 15 * MIN);
    expect(Object.values(r.fetched).every((s) => s === 'not_modified')).toBe(true);
    expect(Object.values(seen).every((v) => v === '"e1"')).toBe(true);
    expect(r.feed_written).toBe(false);
    expect((await readFeed(env.CACHE))!.lists.all.length).toBe(enabledSources().length * 2);
  });

  it('the AI step labels and embeds every article and picks a 10-story Today (#414)', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'));
    const texts = new Map<string, number>();
    const answer = (body: unknown) => ({ choices: [{ message: { content: JSON.stringify(body) } }] });
    vi.mocked(env.AI.run).mockImplementation((async (model: string, inputs: Record<string, unknown>) => {
      if (model === EMBED_MODEL) {
        return {
          data: (inputs.text as string[]).map((t) => {
            if (!texts.has(t)) texts.set(t, texts.size);
            return Array.from({ length: 256 }, (_, i) => (i === texts.get(t) ? 1 : 0));
          }),
        };
      }
      const [system, user] = (inputs.messages as { content: string }[]).map((m) => m.content);
      if (system.startsWith('You label')) {
        return answer({ items: user.split('\n').map((_, i) => ({ i, kind: 'news', topics: ['tech'], importance: 3 })) });
      }
      return answer({ picks: [...Array(14).keys()] });
    }) as never);
    const r = await runCron(env, T0);
    const total = enabledSources().length * 2;
    expect(r.ai).toMatchObject({ labeled: total, embedded: total, label_failures: 0, brief: 'built 10' });
    const feed = (await readFeed(env.CACHE))!;
    expect(feed.lists.latest).toHaveLength(total);
    expect(feed.lists.all).toHaveLength(10);
    expect(feed.brief_at).toBe(T0);
    expect(Object.keys((await readAi(env.CACHE))!.items)).toHaveLength(total);
  });

  it('with Workers AI down the run still writes the feed, and Today is the full list', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'));
    const r = await runCron(env, T0);
    expect(r.feed_written).toBe(true);
    expect(r.ai.labeled).toBe(0);
    const feed = (await readFeed(env.CACHE))!;
    expect(feed.lists.all).toEqual(feed.lists.latest);
    expect(feed.brief_at).toBeNull();
  });

  it('a source whose URL changed is fetched without the old validators', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'), { headers: { etag: '"e1"' } });
    await runCron(env, T0);
    const state = (await readState(env.CACHE))!;
    expect(state.sources['the-verge'].url).toBe(enabledSources().find((s) => s.id === 'the-verge')!.url);
    state.sources['the-verge'].url = 'https://old.test/feed';
    await env.CACHE.put(STATE_KEY, JSON.stringify(state));
    const seen = new Map<string, string | null>();
    handler = (u, init) => {
      seen.set(urls.get(u) ?? u, new Headers(init?.headers).get('if-none-match'));
      return new Response(rss(urls.get(u) ?? 'x'), { headers: { etag: '"e2"' } });
    };
    await runCron(env, T0 + 15 * MIN);
    expect(seen.get('the-verge')).toBeNull();
    expect(seen.get('wired')).toBe('"e1"');
    expect((await readState(env.CACHE))!.sources['the-verge'].url).not.toBe('https://old.test/feed');
  });

  it('no conditional headers once the last full fetch is over 24 hours old (O3)', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'), { headers: { etag: '"e1"' } });
    await runCron(env, T0);
    handler = () => new Response(null, { status: 304 });
    await runCron(env, T0 + 16 * 60 * MIN);
    let sent: string | null = 'unset';
    handler = (u, init) => {
      sent = new Headers(init?.headers).get('if-none-match');
      return new Response(rss(urls.get(u) ?? 'x'));
    };
    await runCron(env, T0 + 25 * 60 * MIN);
    expect(sent).toBeNull();
  });

  it('a failing source keeps its articles, is retried after 5 minutes, and ages out after 24 hours (O2, R6)', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'));
    await runCron(env, T0);
    handler = (u) => (urls.get(u) === 'the-verge' ? new Response('no', { status: 403 }) : new Response(null, { status: 304 }));
    let r = await runCron(env, T0 + 15 * MIN);
    expect(r.fetched['the-verge']).toBe('http_403');
    let st = (await readState(env.CACHE))!.sources['the-verge'];
    expect(st.articles).toHaveLength(2);
    expect(st.failures).toBe(1);
    r = await runCron(env, T0 + 20 * MIN);
    expect(r.fetched['the-verge']).toBe('http_403');
    // Keep the others fresh, then pass the 24 hour mark for the failing one.
    const agedOut: string[] = [];
    for (let t = T0 + 30 * MIN; t <= T0 + 25 * 60 * MIN; t += 15 * MIN) agedOut.push(...(await runCron(env, t)).aged_out);
    expect(agedOut).toEqual(['the-verge']);
    st = (await readState(env.CACHE))!.sources['the-verge'];
    expect(st.articles).toEqual([]);
    const feed = (await readFeed(env.CACHE))!;
    expect(feed.articles.some((a) => a.source_id === 'the-verge')).toBe(false);
  });

  it('og:image: looked up once, carried over by URL afterwards (R7)', async () => {
    const urls = feedUrls();
    let og = 0;
    handler = (u) => {
      if (urls.has(u)) return new Response(rss(urls.get(u)!, 2, false));
      og++;
      return new Response(`<html><head><meta property="og:image" content="${u}.jpg"></head></html>`, {
        headers: { 'content-type': 'text/html' },
      });
    };
    await runCron(env, T0);
    expect(og).toBe(enabledSources().length * 2);
    const feed = (await readFeed(env.CACHE))!;
    expect(feed.articles.every((a) => a.image_url?.endsWith('.jpg'))).toBe(true);
    og = 0;
    await runCron(env, T0 + 15 * MIN);
    expect(og).toBe(0);
  });

  it('a feed over 5 MB is a recorded failure, not a crashed run (R4)', async () => {
    const urls = feedUrls();
    const big = new Uint8Array(5 * 1024 * 1024 + 10).fill(32);
    handler = (u) => (urls.get(u) === 'av-club' ? new Response(big) : new Response(rss(urls.get(u) ?? 'x')));
    const r = await runCron(env, T0);
    expect(r.fetched['av-club']).toBe('too_large');
    expect(r.feed_written).toBe(true);
  });

  it('a state with another version means a full run (R5)', async () => {
    const urls = feedUrls();
    handler = (u) => new Response(rss(urls.get(u) ?? 'x'));
    await runCron(env, T0);
    await env.CACHE.put(STATE_KEY, JSON.stringify({ v: 999, run_seq: 5, written_at: T0, sources: {} }));
    calls = [];
    const r = await runCron(env, T0 + MIN);
    expect(r.full).toBe(true);
    expect(calls.length).toBe(enabledSources().length);
  });

  it('articles that fail the gate are dropped, the rest stored (R2)', async () => {
    const urls = feedUrls();
    handler = (u) =>
      new Response(
        urls.get(u) === 'wired'
          ? `<rss version="2.0"><channel><title>w</title><link>https://w.test</link><description>d</description><item><title>ok</title><link>https://w.test/1</link></item><item><title>also ok</title><link>https://w.test/2</link><pubDate>Mon, 01 Jan 10000 00:00:00 GMT</pubDate></item></channel></rss>`
          : rss(urls.get(u) ?? 'x'),
      );
    await runCron(env, T0);
    const st = (await readState(env.CACHE))!.sources['wired'];
    expect(st.articles.map((a) => a.published_at)).toEqual([null, null]);
  });
});
