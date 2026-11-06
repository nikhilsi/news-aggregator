import { describe, expect, it } from 'vitest';
import { askEditor, pickBrief, shortlist, type Candidate } from '../src/ai/brief.ts';
import { enrich } from '../src/ai/enrich.ts';
import { chatContent, labelBatch } from '../src/ai/labels.ts';
import { groupStories, type Story } from '../src/ai/stories.ts';
import { EMBED_MODEL, normalize, pack, unpack, dot, type AiRunner } from '../src/ai/vectors.ts';
import { buildFeed } from '../src/pipeline/build.ts';
import { SOURCES } from '../src/sources.ts';
import type { AiItem, AiStore, Article } from '../src/types.ts';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600e3).toISOString().slice(0, 19) + 'Z';
let n = 0;
/** An article from a real source, `h` hours old. */
const art = (sourceId: string, title: string, h = 1, o: Partial<Article> = {}): Article => {
  const s = SOURCES.find((x) => x.id === sourceId)!;
  return {
    title,
    summary: `About ${title}`,
    url: `https://${sourceId}.test/${++n}`,
    image_url: `https://${sourceId}.test/${n}.jpg`,
    source_id: s.id,
    source_name: s.name,
    source_type: 'rss',
    category: s.category,
    sentiment: null,
    published_at: ago(h),
    ...o,
  };
};
const chat = (body: unknown) => ({ choices: [{ message: { content: JSON.stringify(body) } }] });
const axisVector = (axis: number, dims = 64) => {
  const v = new Array<number>(dims).fill(0);
  v[axis] = 1;
  return v;
};

/**
 * A stand-in for Workers AI. Embeddings: texts naming a keyword share its axis,
 * every other text gets its own. Labels: by words in the title. Editor: `picks`.
 */
function fakeAi(o: { picks?: number[]; labelsDown?: boolean } = {}) {
  const KEYS = ['binance', 'robot', 'artemis'];
  const axes = new Map<string, number>();
  const calls: string[] = [];
  const ai: AiRunner = {
    async run(model, inputs) {
      if (model === EMBED_MODEL) {
        calls.push('embed');
        return {
          data: (inputs.text as string[]).map((t) => {
            const k = KEYS.findIndex((w) => t.toLowerCase().includes(w));
            if (k >= 0) return axisVector(k);
            if (!axes.has(t)) axes.set(t, KEYS.length + axes.size);
            return axisVector(axes.get(t)!);
          }),
        };
      }
      const [system, user] = (inputs.messages as { content: string }[]).map((m) => m.content);
      if (system.startsWith('You label')) {
        calls.push('labels');
        if (o.labelsDown) throw new Error('down');
        const items = user.split('\n').map((line, i) => {
          const t = line.toLowerCase();
          return {
            i,
            kind: t.includes('deal') ? 'deals' : t.includes('star ') ? 'celebrity' : 'news',
            topics: t.includes('robot') ? ['physical_ai', 'tech'] : t.includes('india') ? ['india'] : t.includes('artemis') ? ['space'] : ['tech'],
            importance: t.includes('binance') ? 5 : 3,
          };
        });
        return chat({ items });
      }
      calls.push('editor');
      return chat({ picks: o.picks ?? [...Array(14).keys()] });
    },
  };
  return { ai, calls };
}

const item = (o: Partial<AiItem> & { v?: number[] } = {}): AiItem => {
  const { v, ...rest } = o;
  return { k: 'news', t: ['tech'], imp: 3, ...(v ? { e: pack(normalize(v)) } : {}), ...rest };
};

describe('vectors', () => {
  it('8-bit packing keeps the direction', () => {
    const v = normalize(Array.from({ length: 1024 }, (_, i) => Math.sin(i * 1.7) * (i % 7)));
    const packed = pack(v);
    expect(packed.length).toBeLessThan(1400);
    expect(dot(v, unpack(packed))).toBeGreaterThan(0.999);
  });
});

describe('labels', () => {
  it('reads the OpenAI answer shape; skips unknown kinds and bad indices; cleans topics and importance', async () => {
    const batch = [art('the-verge', 'One'), art('the-verge', 'Two'), art('the-verge', 'Three')];
    const ai: AiRunner = {
      run: async () =>
        chat({
          items: [
            { i: 0, kind: 'news', topics: ['ai', 'ai', 'nonsense', 'tech'], importance: 9 },
            { i: 1, kind: 'gossip', topics: [], importance: 2 },
            { i: 7, kind: 'news', topics: [], importance: 2 },
            { i: 2, kind: 'deals', topics: ['tech'], importance: 0 },
          ],
        }),
    };
    const out = await labelBatch(ai, batch);
    expect([...out.keys()]).toEqual([batch[0].url, batch[2].url]);
    expect(out.get(batch[0].url)).toEqual({ k: 'news', t: ['ai', 'tech'], imp: 5 });
    expect(out.get(batch[2].url)).toEqual({ k: 'deals', t: ['tech'], imp: 1 });
  });
  it('an India story is never also US politics', async () => {
    const batch = [art('ndtv', 'Opposition rally in Delhi'), art('npr-news', 'Senate race tightens')];
    const ai: AiRunner = {
      run: async () =>
        chat({
          items: [
            { i: 0, kind: 'news', topics: ['india', 'us_politics'], importance: 3 },
            { i: 1, kind: 'news', topics: ['us_politics'], importance: 3 },
          ],
        }),
    };
    const out = await labelBatch(ai, batch);
    expect(out.get(batch[0].url)!.t).toEqual(['india']);
    expect(out.get(batch[1].url)!.t).toEqual(['us_politics']);
  });
  it('chat content: OpenAI shape, the older { response } shape, or an error', () => {
    expect(chatContent(chat({ a: 1 }))).toBe('{"a":1}');
    expect(chatContent({ response: { a: 1 } })).toBe('{"a":1}');
    expect(() => chatContent({})).toThrow();
  });
});

describe('stories', () => {
  it('groups by meaning within 48 hours, newest first', () => {
    const a = art('the-verge', 'Binance hack', 2);
    const b = art('guardian-business', 'Binance stolen funds', 3);
    const c = art('robot-report', 'Robot arm', 1);
    const old = art('wired', 'Binance last week', 50);
    const items = {
      [a.url]: item({ v: axisVector(0) }),
      [b.url]: item({ v: [0.9, 0.3, ...new Array(62).fill(0)] }),
      [c.url]: item({ v: axisVector(1) }),
      [old.url]: item({ v: axisVector(0) }),
    };
    const storyOf = groupStories([a, b, c, old], items, NOW);
    expect(storyOf.get(a)).toBe(storyOf.get(b));
    expect(storyOf.get(a)!.members).toEqual([a, b]);
    expect(storyOf.get(c)).not.toBe(storyOf.get(a));
    expect(storyOf.has(old)).toBe(false);
  });
});

describe('brief', () => {
  const order = new Map(SOURCES.map((s, i) => [s.id, i]));
  it('shortlist: news and analysis from the last 30 hours; the most important article represents the story', () => {
    const a = art('the-verge', 'Binance hack', 2);
    const b = art('guardian-business', 'Binance stolen funds', 3);
    const fluff = art('wired', 'Star gossip', 1);
    const old = art('new-scientist', 'Old news', 40);
    const items = {
      [a.url]: item({ v: axisVector(0), imp: 3 }),
      [b.url]: item({ v: axisVector(0), imp: 5, t: ['markets'] }),
      [fluff.url]: item({ v: axisVector(5), k: 'celebrity' }),
      [old.url]: item({ v: axisVector(6) }),
    };
    const list = shortlist(groupStories([a, b, fluff, old], items, NOW).values(), items, order, NOW);
    expect(list).toHaveLength(1);
    expect(list[0].rep).toBe(b);
    expect(list[0].outlets).toEqual(['The Verge', 'The Guardian Business']);
    expect(list[0].topics).toEqual(['markets', 'tech']);
  });

  const cand = (title: string, v: number[], topics: Candidate['topics'] = ['tech']): Candidate => {
    // Each candidate from its own outlet unless a test says otherwise.
    const rep = art('the-verge', title, 1, { source_id: `outlet-${n}` });
    const story: Story = { id: ++n, members: [rep], centroid: normalize(v) };
    return { story, rep, outlets: ['The Verge'], topics, score: 0 };
  };
  it('pick: editor order first, then the shortlist; near repeats and over-cap topics skipped', () => {
    const list = [
      cand('A', axisVector(0)),
      cand('A again', [0.7, 0.7, ...new Array(62).fill(0)]),
      cand('India 1', axisVector(2), ['india']),
      cand('India 2', axisVector(3), ['india']),
      cand('India 3', axisVector(4), ['india', 'world']),
      cand('B', axisVector(5)),
    ];
    const brief = pickBrief(list, [5, 0, 1, 2, 3, 4]);
    expect(brief.map((c) => c.rep.title)).toEqual(['B', 'A', 'India 1', 'India 2']);
  });
  it('pick: at most 2 stories from one outlet', () => {
    const list = [0, 1, 2, 3].map((i) => cand(`CNBC ${i}`, axisVector(i)));
    for (const c of list) Object.assign(c.rep, { source_id: 'cnbc-top-news', source_name: 'CNBC' });
    list.push(cand('Other', axisVector(9)));
    expect(pickBrief(list, [0, 1, 2, 3, 4]).map((c) => c.rep.title)).toEqual(['CNBC 0', 'CNBC 1', 'Other']);
  });
  it('editor: indices outside the shortlist are ignored', async () => {
    const list = [cand('A', axisVector(0)), cand('B', axisVector(1))];
    const ai: AiRunner = { run: async () => chat({ picks: [1, 5, -1, 0.5, 0] }) };
    expect(await askEditor(ai, list)).toEqual([1, 0]);
  });
});

describe('buildFeed with the AI step', () => {
  const bySource = (articles: Article[]) => {
    const m = new Map<string, Article[]>();
    for (const a of articles) m.set(a.source_id, [...(m.get(a.source_id) ?? []), a]);
    return m;
  };
  const verge = art('the-verge', 'Binance hack', 2);
  const guardian = art('guardian-business', 'Binance stolen funds', 3);
  const deal = art('wired', 'Laptop deal', 1);
  const robot = art('the-verge', 'Robot taxi', 4);
  const report = art('robot-report', 'Humanoid factory', 5);
  const items: Record<string, AiItem> = {
    [verge.url]: item({ v: axisVector(0) }),
    [guardian.url]: item({ v: axisVector(0), t: ['markets'] }),
    [deal.url]: item({ k: 'deals' }),
    [robot.url]: item({ v: axisVector(1), t: ['physical_ai', 'tech'] }),
    [report.url]: item({ v: axisVector(2), t: ['physical_ai'] }),
  };
  const store = (brief: AiStore['brief']): AiStore => ({ v: 1, items, brief });
  const urls = (f: ReturnType<typeof buildFeed>, tab: string) => f.lists[tab].map((i) => f.articles[i].url);

  it('drops fluff, shows one card per story with the other outlets, and tags into Physical AI', () => {
    const f = buildFeed(bySource([verge, guardian, deal, robot, report]), NOW, store(null));
    expect(urls(f, 'latest')).not.toContain(deal.url);
    expect(urls(f, 'tech')).toEqual([verge.url, robot.url]);
    expect(urls(f, 'latest').filter((u) => u === verge.url || u === guardian.url)).toEqual([verge.url]);
    const card = f.articles[f.lists.latest.find((i) => f.articles[i].url === verge.url)!];
    expect(card.coverage).toEqual([{ source_name: 'The Guardian Business', title: guardian.title, url: guardian.url }]);
    expect(card.topics).toEqual(['tech']);
    expect(urls(f, 'physical_ai')).toEqual([robot.url, report.url]);
  });
  it('coverage leaves out the card\'s own article from another feed and lists a URL once (#453)', () => {
    // Ars Technica AI and Tech carry the same article; two outlets share one URL.
    const tech = art('ars-technica-tech', 'Agility robots list on Nasdaq', 2);
    const aiCopy = { ...art('ars-technica-ai', 'Agility robots list on Nasdaq', 2), url: tech.url };
    const rr = art('robot-report', 'Agility begins trading', 3);
    const tcCopy = { ...art('techcrunch-robotics', 'Agility begins trading', 3), url: rr.url };
    const same = { [tech.url]: item({ v: axisVector(7) }), [rr.url]: item({ v: axisVector(7) }) };
    const f = buildFeed(bySource([tech, aiCopy, rr, tcCopy]), NOW, { v: 1, items: same, brief: null });
    for (const a of f.articles) {
      const listed = a.coverage.map((c) => c.url);
      expect(listed).not.toContain(a.url);
      expect(new Set(listed).size).toBe(listed.length);
    }
    const card = f.articles[f.lists.latest[0]];
    expect(card.coverage).toHaveLength(1);
  });
  it('Today is the brief while under 6 hours old, else the Latest list', () => {
    const fresh = buildFeed(bySource([verge, guardian, robot, report]), NOW, store({ at: NOW - 3600e3, urls: [report.url, verge.url] }));
    expect(urls(fresh, 'all')).toEqual([report.url, verge.url]);
    expect(fresh.brief_at).toBe(NOW - 3600e3);
    const stale = buildFeed(bySource([verge, guardian, robot, report]), NOW, store({ at: NOW - 7 * 3600e3, urls: [report.url] }));
    expect(stale.lists.all).toEqual(stale.lists.latest);
    expect(stale.brief_at).toBeNull();
    const none = buildFeed(bySource([verge, guardian]), NOW);
    expect(none.lists.all).toEqual(none.lists.latest);
  });
});

describe('enrich', () => {
  const order = new Map(SOURCES.map((s, i) => [s.id, i]));
  const news = () => [
    art('the-verge', 'Binance hack', 2),
    art('guardian-business', 'Binance stolen funds', 3),
    art('robot-report', 'Robot arm', 1),
    art('nasaspaceflight', 'Artemis plan', 4),
    art('wired', 'Laptop deal', 1),
    ...['Chips', 'Phones', 'Cables', 'Storage', 'Browsers', 'Satellites'].map((t, i) => art('ars-technica-tech', t, 5 + i)),
  ];
  const deadline = () => Date.now() + 40_000;

  it('labels, embeds and picks the brief; an hour later it is not rebuilt', async () => {
    const { ai, calls } = fakeAi({ picks: [2, 0, 1, 3, 4, 5, 6, 7, 8] });
    const articles = news();
    const r = await enrich(ai, articles, null, order, NOW, deadline());
    expect(r.changed).toBe(true);
    expect(r.summary).toMatchObject({ labeled: 11, embedded: 11, label_failures: 0, unlabeled_left: 0 });
    expect(Object.keys(r.store.items)).toHaveLength(11);
    expect(r.store.brief!.at).toBe(NOW);
    // The two Binance articles are one story; the deal never reaches Today.
    const titles = r.store.brief!.urls.map((u) => articles.find((a) => a.url === u)!.title);
    expect(titles.filter((t) => t.startsWith('Binance'))).toHaveLength(1);
    expect(titles).not.toContain('Laptop deal');
    expect(titles.length).toBeGreaterThanOrEqual(5);

    calls.length = 0;
    const again = await enrich(ai, articles, r.store, order, NOW + 30 * 60e3, deadline());
    expect(again.changed).toBe(false);
    expect(calls).toEqual([]);
    expect(again.summary.brief).toBe('not due');
  });
  it('Hindi headlines are never labeled, picked or waited for', async () => {
    const { ai } = fakeAi();
    const hindi = art('ndtv', 'भारत में चुनाव आयोग पर विपक्ष का हमला', 1);
    const r = await enrich(ai, [hindi, ...news()], null, order, NOW, deadline());
    expect(Object.hasOwn(r.store.items, hindi.url)).toBe(false);
    expect(r.summary.unlabeled_left).toBe(0);
    expect(r.store.brief!.urls).not.toContain(hindi.url);
  });
  it('Workers AI down: no error, nothing labeled, no brief', async () => {
    const { ai } = fakeAi({ labelsDown: true });
    const r = await enrich(ai, news(), null, order, NOW, deadline());
    expect(r.summary.labeled).toBe(0);
    expect(r.summary.label_failures).toBe(1);
    expect(r.summary.brief).toMatch(/^waiting for \d+ labels$/);
    expect(r.store.brief).toBeNull();
  });
  it('forgets articles the cron no longer holds, and embeddings past 48 hours', async () => {
    const kept = art('the-verge', 'Kept', 60);
    const prev: AiStore = { v: 1, items: { [kept.url]: item({ v: axisVector(0) }), 'https://gone.test/1': item() }, brief: null };
    const r = await enrich(undefined, [kept], prev, order, NOW, deadline());
    expect(r.store.items).toEqual({ [kept.url]: { k: 'news', t: ['tech'], imp: 3 } });
    expect(r.changed).toBe(true);
  });
});
