// Breaking news (#487): finding stories, deciding them once, sending to phones that
// are due. Design: docs/435-notifications-design.md section 6.5.
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalize, pack } from '../src/ai/vectors.ts';
import type { ApnsConfig } from '../src/notify/apns.ts';
import { breakingDue, breakingPayload, findStories, runBreaking, type BreakingRule } from '../src/notify/breaking.ts';
import { createTables, signUp, type Device } from '../src/notify/devices.ts';
import { buildFeed } from '../src/pipeline/build.ts';
import { breakingRule, refresher } from '../src/refresher.ts';
import { SOURCES } from '../src/sources.ts';
import type { AiStore, Article, Feed, FeedStory, Kind } from '../src/types.ts';

afterEach(() => vi.restoreAllMocks());

const at = (iso: string) => Date.parse(iso);
const MIN = 60e3;
const TOKEN = (n: number) => n.toString(16).padStart(64, '0');
const RULE: BreakingRule = { minOutlets: 5, minImportance: 4 };
// Nov 10, 2026, 10:00 in Los Angeles.
const NOW = at('2026-11-10T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const inStore = <T>(fn: (sql: SqlStorage) => T | Promise<T>) =>
  runInDurableObject(refresher(env), (_inst, state) => {
    createTables(state.storage);
    return fn(state.storage.sql);
  });
const rows = () => inStore((sql) => sql.exec('SELECT * FROM devices ORDER BY token').toArray() as unknown as Device[]);

beforeEach(() =>
  inStore((sql) => {
    sql.exec('DELETE FROM devices');
    sql.exec('DELETE FROM apns_login');
    sql.exec('DELETE FROM breaking_stories');
  }),
);

const OUTLETS = ['NPR News', 'Fox News', 'CNBC', 'ABC News', 'DW World', 'The Verge'];
type Label = { k: Kind; imp: number } | null;
/** One story told by n outlets: member i published (60 + i) minutes ago, labeled by f(i). */
function story(n: number, f: (i: number) => Label, o: { key?: string; published?: (i: number) => string | null } = {}): FeedStory {
  return {
    key: o.key ?? 'https://news.test/0',
    members: Array.from({ length: n }, (_, i) => {
      const l = f(i);
      return {
        url: `https://news.test/${i}`,
        title: `Headline ${i}`,
        source_name: OUTLETS[i % OUTLETS.length],
        published_at: o.published ? o.published(i) : iso(NOW - (60 + i) * MIN),
        ...(l ? { k: l.k, imp: l.imp } : {}),
      };
    }),
  };
}
const feedOf = (...stories: FeedStory[]): Feed => ({ v: 1, built_at: NOW, articles: [], lists: { all: [], latest: [] }, brief_at: null, stories });
const good = (i: number): Label => (i === 1 ? { k: 'news', imp: 5 } : { k: 'news', imp: 3 });

describe('finding stories', () => {
  it('a story at the bar, headed by its most important news article', () => {
    const [s] = findStories(feedOf(story(5, (i) => (i === 2 ? { k: 'news', imp: 5 } : i === 0 ? { k: 'opinion', imp: 5 } : { k: 'news', imp: 3 }))), RULE, NOW);
    expect(s.outlets).toBe(5);
    expect(s.pick?.url).toBe('https://news.test/2');
    expect(s.firstAt).toBe(NOW - 64 * MIN);
    expect(findStories(feedOf(story(4, good)), RULE, NOW)).toEqual([]);
  });
  it('no headline without a news article of importance 4 or more', () => {
    expect(findStories(feedOf(story(5, (i) => (i === 0 ? { k: 'analysis', imp: 5 } : { k: 'news', imp: 3 }))), RULE, NOW)[0].pick).toBeNull();
  });
  it('a publish time in the future is ignored', () => {
    const [s] = findStories(feedOf(story(5, good, { published: (i) => (i === 0 ? iso(NOW + 5 * 60 * MIN) : iso(NOW - 8 * 60 * MIN)) })), RULE, NOW);
    expect(s.firstAt).toBe(NOW - 8 * 60 * MIN);
  });
  it('the bigger story comes first', () => {
    const small = story(5, good, { key: 'a' });
    const big = { ...story(6, good, { key: 'b' }), members: story(6, good).members.map((m) => ({ ...m, url: m.url + '-b' })) };
    expect(findStories(feedOf(small, big), RULE, NOW).map((s) => s.key)).toEqual(['b', 'a']);
  });
  it('the bar comes from the vars, or the default', () => {
    expect(breakingRule({ ...env, BREAKING_MIN_OUTLETS: '3', BREAKING_MIN_IMPORTANCE: '3' })).toEqual({ minOutlets: 3, minImportance: 3 });
    expect(breakingRule({ ...env, BREAKING_MIN_OUTLETS: undefined, BREAKING_MIN_IMPORTANCE: 'x' })).toEqual({ minOutlets: 5, minImportance: 4 });
  });
  it("on the feed buildFeed makes: the whole story counts, not the card", () => {
    // Five outlets on one story. The newest article (the card) is opinion; the others are news,
    // one with importance 5; the oldest is 10 hours old.
    const ids = ['npr-news', 'fox-news', 'cnbc-business', 'abc-business', 'dw-world'];
    const v = pack(normalize([1, 0.5, 0.25, 0.1]));
    const byId = new Map<string, Article[]>();
    const items: AiStore['items'] = {};
    ids.forEach((id, i) => {
      const src = SOURCES.find((s) => s.id === id)!;
      const url = `https://${id}.test/story`;
      byId.set(id, [{ title: `Story told by ${src.name}`, summary: null, url, image_url: null, source_id: id, source_name: src.name, source_type: 'rss', category: src.category, sentiment: null, published_at: iso(NOW - [10, 600, 120, 90, 60][i] * MIN) }]);
      items[url] = { k: i === 0 ? 'opinion' : 'news', t: ['world'], imp: i === 2 ? 5 : 3, e: v };
    });
    const feed = buildFeed(byId, NOW, { v: 2, items, brief: null });
    const cards = feed.lists.latest.length;
    expect(cards).toBe(1);
    const [s] = findStories(feed, RULE, NOW);
    expect(s.outlets).toBe(5);
    expect(s.pick?.url).toBe('https://cnbc-business.test/story');
    expect(s.firstAt).toBe(NOW - 600 * MIN);
    expect(s.key).toBe('https://fox-news.test/story');
  });
});

async function testConfig(): Promise<ApnsConfig> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...der));
  return {
    key: `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`,
    keyId: 'TESTKEY123',
    teamId: 'TEAM123456',
    topic: 'com.nikhilsi.ClearNews',
  };
}
function mockApple(replies: Record<string, { status: number; reason?: string }> = {}) {
  const calls: { token: string; headers: Headers; body: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo, init);
    const token = new URL(req.url).pathname.split('/').pop()!;
    calls.push({ token, headers: req.headers, body: (await req.json()) as Record<string, unknown> });
    const r = replies[token] ?? { status: 200 };
    return r.status === 200 ? new Response(null, { status: 200 }) : new Response(JSON.stringify({ reason: r.reason }), { status: r.status });
  });
  return calls;
}
const addPhone = (token: string, tz = 'America/Los_Angeles', morning: number | null = null) =>
  inStore((sql) => signUp(sql, { token, tz, morning, breaking: true }, NOW - 60 * MIN));
const run = (cfg: ApnsConfig | null, feed = feedOf(story(5, good)), now = NOW) => inStore((sql) => runBreaking(sql, cfg, feed, RULE, now));

describe('the breaking news sender', () => {
  it('sends the story once to a phone that is due, in the shape Apple expects', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    const calls = mockApple();
    const [log] = await run(cfg);
    expect(log).toMatchObject({ decision: 'send', outlets: 5, source: 'Fox News', title: 'Headline 1', importance: 5, age_min: 64 });
    expect(log.devices).toMatchObject({ due: 1, sent: 1 });
    expect(calls[0].headers.get('apns-collapse-id')).toBe('breaking');
    expect(calls[0].body).toEqual({
      aps: { alert: { title: 'Breaking: covered by 5 outlets', body: 'Fox News: Headline 1' }, sound: 'default' },
      url: 'https://news.test/1',
      title: 'Headline 1',
      source: 'Fox News',
    });
    expect((await rows())[0].breaking_at).toBe(NOW);
    // Once per story: the next minute decides nothing.
    expect(await run(cfg, undefined, NOW + MIN)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  it('the same event with every article replaced by a follow-up keeps its key: no second alert', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    const calls = mockApple();
    await run(cfg);
    const later = { ...story(5, good), members: story(5, good).members.map((m) => ({ ...m, url: m.url + '-update' })) };
    expect(await run(cfg, feedOf(later), NOW + 21 * 60 * MIN)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  it('quiet hours, a daily cap, and the switch: no send, but the story is still decided once', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1), 'Asia/Kolkata'); // 23:30 in India
    await addPhone(TOKEN(2));
    await inStore((sql) => sql.exec('UPDATE devices SET breaking_at = ? WHERE token = ?', NOW - 2 * 60 * MIN, TOKEN(2)));
    await inStore((sql) => signUp(sql, { token: TOKEN(3), tz: 'America/Los_Angeles', morning: 420, breaking: false }, NOW));
    const calls = mockApple();
    const [log] = await run(cfg);
    expect(log.decision).toBe('send');
    expect(log.devices).toMatchObject({ due: 0, sent: 0 });
    expect(calls).toHaveLength(0);
    expect(await run(cfg, undefined, NOW + MIN)).toEqual([]);
  });
  it('day hours on the phone clock: 7:00 to 21:59', () => {
    const d = { tz: 'America/Los_Angeles', breaking: 1, breaking_at: null };
    expect(breakingDue(d, at('2026-11-10T15:00:00Z'))).toBe(true); // 07:00
    expect(breakingDue(d, at('2026-11-10T14:59:00Z'))).toBe(false);
    expect(breakingDue(d, at('2026-11-11T05:59:00Z'))).toBe(true); // 21:59
    expect(breakingDue(d, at('2026-11-11T06:00:00Z'))).toBe(false); // 22:00
    expect(breakingDue({ ...d, breaking_at: NOW - 21 * 60 * MIN }, NOW)).toBe(true);
    expect(breakingDue({ ...d, breaking: 0 }, NOW)).toBe(false);
  });
  it('waits for labels before ruling a story out; then sends when they come', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    const calls = mockApple();
    expect(await run(cfg, feedOf(story(5, (i) => (i < 3 ? { k: 'news', imp: 3 } : null))))).toEqual([]);
    const [log] = await run(cfg, undefined, NOW + MIN);
    expect(log.decision).toBe('send');
    expect(calls).toHaveLength(1);
  });
  it('no important news article: skipped once, with the reason', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    const calls = mockApple();
    const weak = feedOf(story(5, (i) => (i === 0 ? { k: 'opinion', imp: 5 } : { k: 'news', imp: 2 })));
    const [log] = await run(cfg, weak);
    expect(log).toMatchObject({ decision: 'skip', why: 'no news article with importance 4 or more', outlets: 5 });
    expect(await run(cfg, weak, NOW + MIN)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it('a story whose first article is over 6 hours old is remembered quietly', async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    const calls = mockApple();
    const old = feedOf(story(5, good, { published: (i) => iso(NOW - (i === 3 ? 7 * 60 : 30) * MIN) }));
    expect(await run(cfg, old)).toEqual([]);
    expect(await inStore((sql) => sql.exec('SELECT COUNT(*) AS n FROM breaking_stories').one().n)).toBe(5);
    expect(calls).toHaveLength(0);
  });
  it('decides and logs stories even with no phone signed up', async () => {
    const [log] = await run(null);
    expect(log).toMatchObject({ decision: 'send', devices: { due: 0, sent: 0 } });
  });
  it("Apple's answers: gone deletes, busy gives the day's alert back", async () => {
    const cfg = await testConfig();
    await addPhone(TOKEN(1));
    await addPhone(TOKEN(2));
    mockApple({ [TOKEN(1)]: { status: 410, reason: 'Unregistered' }, [TOKEN(2)]: { status: 503, reason: 'ServiceUnavailable' } });
    const [log] = await run(cfg);
    expect(log.devices).toMatchObject({ due: 2, sent: 0, removed: 1 });
    expect((await rows()).map((r) => [r.token, r.breaking_at])).toEqual([[TOKEN(2), null]]);
  });
  it('payload: measured in bytes, the address left out when the whole would pass 3,500', () => {
    const m = story(5, good).members[1];
    expect(breakingPayload(5, m).url).toBe(m.url);
    const p = breakingPayload(5, { ...m, url: 'https://news.test/' + 'é'.repeat(1900) });
    expect(p.url).toBeUndefined();
    expect(p.aps.alert.body).toBe('Fox News: Headline 1');
  });
});

describe('the device list keeps breaking news', () => {
  it('upgrades a 3.7.0 table once, keeping its rows, even after a failed earlier try', () =>
    runInDurableObject(refresher(env), (_inst, state) => {
      const sql = state.storage.sql;
      sql.exec('DROP TABLE IF EXISTS devices');
      sql.exec(`CREATE TABLE devices (token TEXT PRIMARY KEY, tz TEXT NOT NULL, morning INTEGER NOT NULL, sent_at INTEGER,
        retry_at INTEGER, delivered_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
      sql.exec("INSERT INTO devices VALUES ('ab', 'UTC', 420, 5, NULL, 6, 1, 2)");
      // A leftover from an interrupted earlier try.
      sql.exec("CREATE TABLE devices_new (token TEXT PRIMARY KEY, tz TEXT NOT NULL)");
      sql.exec("INSERT INTO devices_new VALUES ('ab', 'UTC')");
      createTables(state.storage);
      createTables(state.storage);
      const [row] = sql.exec('SELECT * FROM devices').toArray();
      expect(row).toMatchObject({ token: 'ab', morning: 420, breaking: 0, breaking_at: null, sent_at: 5, delivered_at: 6 });
      signUp(sql, { token: 'ab', tz: 'UTC', morning: null, breaking: true }, 3);
      expect(sql.exec('SELECT morning, breaking FROM devices').toArray()).toEqual([{ morning: null, breaking: 1 }]);
    }));
  const post = (body: unknown) =>
    SELF.fetch('https://getclearnews.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify(body),
    });
  const base = { platform: 'ios', token: TOKEN(1), tz: 'America/Los_Angeles' };
  it('sign-up: breaking alone keeps the row, both off removes it, build 5 sends no breaking', async () => {
    expect((await post({ ...base, morning: null, breaking: true })).status).toBe(204);
    expect((await rows()).map((r) => [r.morning, r.breaking])).toEqual([[null, 1]]);
    expect((await post({ ...base, morning: '07:00' })).status).toBe(204);
    expect((await rows()).map((r) => [r.morning, r.breaking])).toEqual([[420, 0]]);
    expect((await post({ ...base, morning: null, breaking: false })).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect((await post({ ...base, morning: null, breaking: 'yes' })).status).toBe(422);
  });
});
