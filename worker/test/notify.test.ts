// The morning edition (#435): the device list, the sign-up endpoint and the
// sender. Design: docs/435-notifications-design.md.
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApnsConfig } from '../src/notify/apns.ts';
import { canonicalTimeZone, createTables, isDue, localMinutes, MAX_DEVICES, minutesPast, signUp, type Device } from '../src/notify/devices.ts';
import { morningPayload, runMorning, type MorningSummary } from '../src/notify/morning.ts';
import { refresher } from '../src/refresher.ts';
import type { Feed, FeedArticle } from '../src/types.ts';

afterEach(() => vi.restoreAllMocks());

const at = (iso: string) => Date.parse(iso);
const MIN = 60e3;
const TOKEN = (n: number) => n.toString(16).padStart(64, '0');
const dev = (o: Partial<Device>) => ({ tz: 'America/Los_Angeles', morning: 420, sent_at: null, retry_at: null, ...o });

/** Runs code against the Refresher's own SQLite storage. */
const inStore = <T>(fn: (sql: SqlStorage) => T | Promise<T>) =>
  runInDurableObject(refresher(env), (_inst, state) => {
    createTables(state.storage);
    return fn(state.storage.sql);
  });
const rows = () => inStore((sql) => sql.exec('SELECT * FROM devices ORDER BY token').toArray() as unknown as Device[]);

// Durable Object storage carries over between tests in a file: start each one empty.
beforeEach(() =>
  inStore((sql) => {
    sql.exec('DELETE FROM devices');
    sql.exec('DELETE FROM apns_login');
  }),
);

describe('the phone clock', () => {
  it('7:00 to 8:00 Pacific is due, 6:59 and 8:01 are not', () => {
    // Nov 10, 2026 is standard time: 07:00 PST is 15:00 UTC.
    expect(isDue(dev({}), at('2026-11-10T15:00:00Z'))).toBe(true);
    expect(isDue(dev({}), at('2026-11-10T16:00:00Z'))).toBe(true);
    expect(isDue(dev({}), at('2026-11-10T14:59:00Z'))).toBe(false);
    expect(isDue(dev({}), at('2026-11-10T16:01:00Z'))).toBe(false);
  });
  it('fall back (Nov 1, 2026): 01:30 happens twice, the edition goes out once', () => {
    const d = dev({ morning: 90 });
    const first = at('2026-11-01T08:30:00Z'); // 01:30 PDT
    const second = at('2026-11-01T09:30:00Z'); // 01:30 PST
    expect(localMinutes('America/Los_Angeles', first)).toBe(90);
    expect(localMinutes('America/Los_Angeles', second)).toBe(90);
    expect(isDue(d, first)).toBe(true);
    expect(isDue({ ...d, sent_at: first }, second)).toBe(false);
  });
  it('spring forward (Mar 8, 2026): 02:30 never happens, the edition goes out at 03:00', () => {
    const d = dev({ morning: 150 });
    expect(isDue(d, at('2026-03-08T09:59:00Z'))).toBe(false); // 01:59 PST
    expect(localMinutes('America/Los_Angeles', at('2026-03-08T10:00:00Z'))).toBe(180); // 03:00 PDT
    expect(isDue(d, at('2026-03-08T10:00:00Z'))).toBe(true);
    // 02:00 itself is skipped too: 03:00 is 60 minutes past it, still inside the hour.
    expect(isDue(dev({ morning: 120 }), at('2026-03-08T10:00:00Z'))).toBe(true);
    expect(isDue(dev({ tz: 'America/Santiago', morning: 0 }), at('2026-09-06T04:00:00Z'))).toBe(true);
  });
  it('7:00 on both change days', () => {
    expect(isDue(dev({}), at('2026-11-01T15:00:00Z'))).toBe(true); // 07:00 PST
    expect(isDue(dev({}), at('2026-03-08T14:00:00Z'))).toBe(true); // 07:00 PDT
  });
  it('India, under its current and its older name', () => {
    for (const tz of ['Asia/Kolkata', 'Asia/Calcutta']) {
      expect(canonicalTimeZone(tz)).toMatch(/^Asia\/(Kolkata|Calcutta)$/);
      expect(isDue(dev({ tz }), at('2026-11-10T01:30:00Z'))).toBe(true); // 07:00 IST
    }
  });
  it('time zones: one spelling per zone; offsets and odd names refused', () => {
    expect(canonicalTimeZone('america/los_angeles')).toBe('America/Los_Angeles');
    expect(canonicalTimeZone('AMERICA/LOS_ANGELES')).toBe('America/Los_Angeles');
    expect(canonicalTimeZone('UTC')).toBe('UTC');
    for (const bad of ['Mars/Olympus', '+05:30', '-0800', 'Factory', '', 'x'.repeat(65)]) expect(canonicalTimeZone(bad), bad).toBeNull();
  });
  it('one edition a day: due again the next morning, not after a retry wait inside the hour', () => {
    const now = at('2026-11-10T15:00:00Z');
    expect(isDue(dev({ sent_at: now }), now + 24 * 60 * MIN)).toBe(true);
    expect(isDue(dev({ retry_at: now + 15 * MIN }), now + 10 * MIN)).toBe(false);
    expect(isDue(dev({ retry_at: now + 15 * MIN }), now + 15 * MIN)).toBe(true);
    expect(minutesPast({ tz: 'America/Los_Angeles', morning: 420 }, now + 59 * MIN)).toBe(59);
  });
});

const post = (body: unknown, ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) =>
  SELF.fetch('https://getclearnews.com/api/v1/notifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { platform: 'ios', token: TOKEN(1), tz: 'America/Los_Angeles', morning: '07:00' };

describe('POST /api/v1/notifications', () => {
  it('saves the device, then replaces it, then null removes it', async () => {
    const res = await post({ ...good, token: TOKEN(1).toUpperCase(), tz: 'america/los_angeles' });
    expect(res.status).toBe(204);
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
    expect((await rows()).map((r) => [r.token, r.tz, r.morning])).toEqual([[TOKEN(1), 'America/Los_Angeles', 420]]);
    expect((await post({ ...good, tz: 'America/New_York', morning: '06:45' })).status).toBe(204);
    expect((await rows()).map((r) => [r.tz, r.morning])).toEqual([['America/New_York', 405]]);
    // Turning off works whatever the time zone says.
    expect((await post({ ...good, tz: 'Mars/Olympus', morning: null })).status).toBe(204);
    expect(await rows()).toEqual([]);
  });
  it('a new time starts the day fresh, but not while its hour is open', async () => {
    const t = at('2026-11-10T22:30:00Z');
    const state = () => rows().then((r) => r.map((x) => [x.sent_at, x.retry_at]));
    await inStore((sql) => {
      signUp(sql, { token: TOKEN(1), tz: 'UTC', morning: 1320 }, t);
      sql.exec('UPDATE devices SET sent_at = 5, retry_at = 6');
      signUp(sql, { token: TOKEN(1), tz: 'UTC', morning: 1320 }, t); // same time: kept
    });
    expect(await state()).toEqual([[5, 6]]);
    // 22:00 moved to 07:00 at 22:30: tomorrow's 07:00 must go out.
    await inStore((sql) => signUp(sql, { token: TOKEN(1), tz: 'UTC', morning: 420 }, t));
    expect(await state()).toEqual([[null, null]]);
    // Delivered at 07:00, then nudged to 07:05 at 07:10: no second edition.
    const seven = at('2026-11-11T07:00:00Z');
    await inStore((sql) => sql.exec('UPDATE devices SET sent_at = ?', seven));
    await inStore((sql) => signUp(sql, { token: TOKEN(1), tz: 'UTC', morning: 425 }, seven + 10 * MIN));
    const [row] = await rows();
    expect([row.morning, row.sent_at]).toEqual([425, seven]);
    expect(isDue(row, seven + 11 * MIN)).toBe(false);
    // 09:00 moved to 07:00 at 07:10, inside the new hour: the new time is kept.
    await inStore((sql) => {
      sql.exec('UPDATE devices SET morning = 540, sent_at = ?', seven - 22 * 60 * MIN);
      signUp(sql, { token: TOKEN(1), tz: 'UTC', morning: 420 }, seven + 10 * MIN);
    });
    const [moved] = await rows();
    expect(moved.morning).toBe(420);
    expect(isDue(moved, seven + 11 * MIN)).toBe(true);
  });
  it('JSON only: other content types get 415', async () => {
    const res = await SELF.fetch('https://getclearnews.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '10.1.2.3' },
      body: JSON.stringify(good),
    });
    expect(res.status).toBe(415);
    expect(await rows()).toEqual([]);
  });
  it('refuses bad input with a 422 per field and stores nothing', async () => {
    const res = await post({ platform: 'android', token: 'abc', tz: 'Mars/Olympus', morning: '25:00' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { detail: { loc: string[] }[] };
    expect(body.detail.map((e) => e.loc[1])).toEqual(['platform', 'token', 'tz', 'morning']);
    const missing = await post({ platform: 'ios', token: TOKEN(2), tz: 'UTC' });
    expect(((await missing.json()) as { detail: { type: string }[] }).detail[0].type).toBe('missing');
    expect((await post('{not json')).status).toBe(422);
    expect((await post({ ...good, pad: 'x'.repeat(3000) })).status).toBe(413);
    expect(await rows()).toEqual([]);
  });
  it('other methods get 405 with Allow: POST', async () => {
    const res = await SELF.fetch('https://getclearnews.com/api/v1/notifications');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
  it('has its own limit of 10 a minute per address', async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await post({ ...good, token: TOKEN(100 + i) }, '10.9.9.9')).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.filter((s) => s === 204).length).toBeLessThanOrEqual(20);
  });
});

describe('a full list', () => {
  const fill = (delivered: boolean) =>
    inStore((sql) => {
      for (let i = 0; i < MAX_DEVICES; i++) signUp(sql, { token: TOKEN(5000 + i), tz: 'UTC', morning: 420 }, 1000 + i);
      if (delivered) sql.exec('UPDATE devices SET delivered_at = 1');
      else sql.exec('UPDATE devices SET delivered_at = 1 WHERE token != ?', TOKEN(5000));
    });
  it('a new device replaces the oldest one that never had a delivery', async () => {
    await fill(false);
    expect((await post({ ...good, token: TOKEN(9) })).status).toBe(204);
    const tokens = new Set((await rows()).map((r) => r.token));
    expect(tokens.size).toBe(MAX_DEVICES);
    expect(tokens.has(TOKEN(9))).toBe(true);
    expect(tokens.has(TOKEN(5000))).toBe(false);
  });
  it('answers 503 when every device has had a delivery', async () => {
    await fill(true);
    expect((await post({ ...good, token: TOKEN(9) })).status).toBe(503);
  });
});

// --- The sender ------------------------------------------------------------

const NOW = at('2026-11-10T15:00:00Z'); // 07:00 Pacific

async function testConfig(): Promise<{ cfg: ApnsConfig; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...der));
  const key = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
  return { cfg: { key, keyId: 'TESTKEY123', teamId: 'TEAM123456', topic: 'com.nikhilsi.ClearNews' }, publicKey: pair.publicKey };
}

const article = (i: number, o: Partial<FeedArticle> = {}): FeedArticle => ({
  title: `Headline ${i}`,
  summary: null,
  url: `https://www.npr.org/${i}`,
  image_url: null,
  source_id: 'npr-news',
  source_name: 'NPR News',
  source_type: 'rss',
  category: 'general',
  sentiment: null,
  published_at: '2026-11-10T13:00:00Z',
  topics: [],
  coverage: [],
  ...o,
});
const feedWith = (briefAt: number | null): Feed => ({
  v: 1,
  built_at: NOW,
  articles: [article(0), article(1)],
  lists: { all: [0, 1], latest: [0, 1] },
  brief_at: briefAt,
});

type Reply = { status: number; reason?: string };
/** Mocks Apple: each token gets its replies in order (the last one repeats). */
function mockApple(replies: Record<string, Reply[]>) {
  const calls: { token: string; headers: Headers; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo, init);
    const token = new URL(req.url).pathname.split('/').pop()!;
    calls.push({ token, headers: req.headers, body: await req.json() });
    const list = replies[token] ?? [{ status: 200 }];
    const r = list.length > 1 ? list.shift()! : list[0];
    return r.status === 200
      ? new Response(null, { status: 200, headers: { 'apns-id': 'x' } })
      : new Response(JSON.stringify({ reason: r.reason }), { status: r.status });
  });
  return calls;
}

async function addDevices(...tokens: string[]) {
  await inStore((sql) => {
    for (const t of tokens) signUp(sql, { token: t, tz: 'America/Los_Angeles', morning: 420 }, NOW - 60 * MIN);
  });
}
const send = (cfg: ApnsConfig | null, feed: Feed | null = feedWith(NOW - 60 * MIN), now = NOW) =>
  inStore((sql) => runMorning(sql, cfg, async () => feed, now)) as Promise<MorningSummary | null>;

describe('the morning sender', () => {
  it('sends Today to a due device, in the shape Apple expects, signed with the key', async () => {
    const { cfg, publicKey } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({});
    const s = await send(cfg);
    expect(s).toMatchObject({ due: 1, sent: 1, removed: 0, retry: 0 });
    expect(calls).toHaveLength(1);
    const h = calls[0].headers;
    expect([h.get('apns-topic'), h.get('apns-push-type'), h.get('apns-priority'), h.get('apns-collapse-id')]).toEqual([
      'com.nikhilsi.ClearNews', 'alert', '10', 'morning',
    ]);
    expect(Number(h.get('apns-expiration'))).toBe(NOW / 1000 + 7200);
    expect(calls[0].body).toEqual({
      aps: { alert: { title: 'Today: 2 stories', body: 'NPR News: Headline 0' }, sound: 'default' },
      url: 'https://www.npr.org/0',
      title: 'Headline 0',
      source: 'NPR News',
    });
    // The login token is a valid ES256 JWT for this key.
    const [head, claims, sig] = h.get('authorization')!.replace('bearer ', '').split('.');
    const dec = (s: string) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
    expect(dec(head)).toEqual({ alg: 'ES256', kid: 'TESTKEY123' });
    expect(dec(claims)).toEqual({ iss: 'TEAM123456', iat: NOW / 1000 });
    const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (sig.length % 4)) % 4)), (c) => c.charCodeAt(0));
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, raw, new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
    const [row] = await rows();
    expect([row.sent_at, row.delivered_at]).toEqual([NOW, NOW]);
  });
  it('one edition a day, even when the sender runs twice in a minute; again the next morning', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({});
    await send(cfg);
    expect(await send(cfg, undefined, NOW + 30e3)).toBeNull();
    expect(calls).toHaveLength(1);
    await send(cfg, feedWith(NOW + 23 * 60 * MIN), NOW + 24 * 60 * MIN);
    expect(calls).toHaveLength(2);
  });
  it('sends nothing without a brief under 6 hours old, or without the key', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({});
    expect((await send(cfg, feedWith(NOW - 7 * 60 * MIN)))?.skipped).toBe('no fresh brief');
    expect((await send(cfg, feedWith(null)))?.skipped).toBe('no fresh brief');
    expect((await send(cfg, null))?.skipped).toBe('no fresh brief');
    expect((await send(null))?.skipped).toBe('apns not configured');
    expect(calls).toHaveLength(0);
    expect((await rows())[0].sent_at).toBeNull();
  });
  it('a device that is not due gets nothing', async () => {
    const { cfg } = await testConfig();
    await inStore((sql) => signUp(sql, { token: TOKEN(1), tz: 'America/New_York', morning: 420 }, NOW));
    const calls = mockApple({});
    expect(await send(cfg)).toBeNull(); // 10:00 in New York
    expect(calls).toHaveLength(0);
  });
  it('deletes devices Apple says are gone', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1), TOKEN(2), TOKEN(3), TOKEN(4));
    mockApple({
      [TOKEN(1)]: [{ status: 410, reason: 'Unregistered' }],
      [TOKEN(2)]: [{ status: 400, reason: 'BadDeviceToken' }],
      [TOKEN(3)]: [{ status: 400, reason: 'DeviceTokenNotForTopic' }],
    });
    const s = await send(cfg);
    expect(s).toMatchObject({ sent: 1, removed: 3 });
    expect(s!.failures.map((f) => f.token)).toEqual([TOKEN(1), TOKEN(2), TOKEN(3)].map((t) => t.slice(0, 8)));
    expect((await rows()).map((r) => r.token)).toEqual([TOKEN(4)]);
  });
  it('never-delivered devices always go, even when many fail alike', async () => {
    const { cfg } = await testConfig();
    const tokens = [1, 2, 3, 4, 5, 6].map(TOKEN);
    await addDevices(...tokens);
    mockApple(Object.fromEntries(tokens.map((t) => [t, [{ status: 400, reason: 'BadDeviceToken' }]])));
    expect(await send(cfg)).toMatchObject({ removed: 6 });
    expect(await rows()).toEqual([]);
  });
  it('known devices failing alike are kept (a topic typo, say); one alone goes', async () => {
    const { cfg } = await testConfig();
    const tokens = [1, 2, 3, 4].map(TOKEN);
    await addDevices(...tokens);
    await inStore((sql) => sql.exec('UPDATE devices SET delivered_at = 1'));
    mockApple(Object.fromEntries(tokens.map((t) => [t, [{ status: 400, reason: 'DeviceTokenNotForTopic' }]])));
    const s = await send(cfg);
    expect(s).toMatchObject({ removed: 0 });
    expect(s!.stopped).toMatch(/most failed alike/);
    expect(await rows()).toHaveLength(4);

    await inStore((sql) => sql.exec('DELETE FROM devices'));
    await addDevices(TOKEN(7));
    await inStore((sql) => sql.exec('UPDATE devices SET delivered_at = 1'));
    mockApple({ [TOKEN(7)]: [{ status: 410, reason: 'Unregistered' }] });
    expect(await send(cfg)).toMatchObject({ removed: 1 });
    expect(await rows()).toEqual([]);
  });
  it('a new sign-up in the same minute does not defeat the guard', async () => {
    const { cfg } = await testConfig();
    const known = [1, 2, 3, 4].map(TOKEN);
    await addDevices(...known);
    await inStore((sql) => sql.exec('UPDATE devices SET delivered_at = 1'));
    await addDevices(TOKEN(9));
    mockApple(Object.fromEntries([...known, TOKEN(9)].map((t) => [t, [{ status: 400, reason: 'DeviceTokenNotForTopic' }]])));
    const s = await send(cfg);
    expect(s).toMatchObject({ removed: 1 });
    expect((await rows()).map((r) => r.token)).toEqual(known);
  });
  it('410 always deletes: Apple says the app is gone from that phone', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1), TOKEN(2));
    await inStore((sql) => sql.exec('UPDATE devices SET delivered_at = 1'));
    mockApple({ [TOKEN(1)]: [{ status: 410, reason: 'Unregistered' }], [TOKEN(2)]: [{ status: 410, reason: 'Unregistered' }] });
    expect(await send(cfg)).toMatchObject({ removed: 2 });
    expect(await rows()).toEqual([]);
  });
  it('an uninstall in the same minute does not defeat the guard', async () => {
    const { cfg } = await testConfig();
    const known = [1, 2, 3].map(TOKEN);
    await addDevices(...known, TOKEN(8));
    await inStore((sql) => sql.exec('UPDATE devices SET delivered_at = 1'));
    mockApple({
      ...Object.fromEntries(known.map((t) => [t, [{ status: 400, reason: 'DeviceTokenNotForTopic' }]])),
      [TOKEN(8)]: [{ status: 410, reason: 'Unregistered' }],
    });
    expect(await send(cfg)).toMatchObject({ removed: 1 });
    expect((await rows()).map((r) => r.token)).toEqual(known);
  });
  it('a connection that fails at once stops the minute; the rest go next minute', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1), TOKEN(2), TOKEN(3));
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection lost.'));
    const s = await send(cfg);
    expect(s!.stopped).toMatch(/^connection: /);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await rows()).map((r) => r.sent_at)).toEqual([NOW, null, null]);
    spy.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await send(cfg, undefined, NOW + MIN)).toMatchObject({ due: 2, sent: 2 });
  });
  it('two runs at once send each device once', async () => {
    const { cfg } = await testConfig();
    const tokens = [1, 2, 3].map(TOKEN);
    await addDevices(...tokens);
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      calls.push(new URL(String(input instanceof Request ? input.url : input)).pathname.split('/').pop()!);
      await new Promise((r) => setTimeout(r, 20));
      return new Response(null, { status: 200 });
    });
    const feed = feedWith(NOW - 60 * MIN);
    await inStore((sql) => Promise.all([runMorning(sql, cfg, async () => feed, NOW), runMorning(sql, cfg, async () => feed, NOW + 30e3)]));
    expect(calls.sort()).toEqual(tokens);
  });
  it('a timeout or dropped connection counts as sent: no second push', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('The operation was aborted due to timeout'));
    const s = await send(cfg);
    expect(s).toMatchObject({ sent: 0, retry: 0 });
    expect(s!.failures[0].status).toBe(0);
    const [row] = await rows();
    expect([row.sent_at, row.retry_at]).toEqual([NOW, null]);
  });
  it('429 TooManyRequests waits 15 minutes', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    mockApple({ [TOKEN(1)]: [{ status: 429, reason: 'TooManyRequests' }] });
    expect(await send(cfg)).toMatchObject({ retry: 1 });
    expect((await rows())[0].retry_at).toBe(NOW + 15 * MIN);
  });
  it('stops starting sends when the time budget is spent, touching nothing', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({});
    const s = (await inStore((sql) => runMorning(sql, cfg, async () => feedWith(NOW - 60 * MIN), NOW, 0))) as MorningSummary;
    expect(s.stopped).toBe('time budget');
    expect(calls).toHaveLength(0);
    expect((await rows())[0].sent_at).toBeNull();
  });
  it('a bad key fails the minute before any device is marked', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({});
    await expect(send({ ...cfg, key: 'not a key' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    expect((await rows())[0].sent_at).toBeNull();
  });
  it('payload: text cut to 300 without a broken character; an address too long for Apple is left out', () => {
    const long = 'a'.repeat(299) + '😀 rest';
    const feed = feedWith(NOW);
    feed.articles[0] = article(0, { title: long });
    const p = morningPayload(feed)!;
    expect(p.title!.length).toBe(299);
    expect(p.title!.isWellFormed()).toBe(true);
    feed.articles[0] = article(0, { url: 'https://example.com/' + 'x'.repeat(4000) });
    const q = morningPayload(feed)!;
    expect(q.url).toBeUndefined();
    expect(q.aps.alert.body).toBe('NPR News: Headline 0');
  });
  it('an expired login token is renewed once and the send retried', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    // A login signed 30 minutes ago: old enough to renew, young enough to reuse.
    await inStore((sql) => sql.exec("INSERT INTO apns_login (id, kid, jwt, iat) VALUES (1, 'TESTKEY123', 'old.jwt.x', ?)", NOW - 30 * MIN));
    const calls = mockApple({ [TOKEN(1)]: [{ status: 403, reason: 'ExpiredProviderToken' }, { status: 200 }] });
    expect(await send(cfg)).toMatchObject({ sent: 1 });
    expect(calls[0].headers.get('authorization')).toBe('bearer old.jwt.x');
    expect(calls[1].headers.get('authorization')).not.toBe('bearer old.jwt.x');
  });
  it('a setup error stops the minute, deletes nothing and retries in 15 minutes', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1), TOKEN(2));
    const calls = mockApple({ [TOKEN(1)]: [{ status: 403, reason: 'InvalidProviderToken' }] });
    const s = await send(cfg);
    expect(s!.stopped).toBe('setup: 403 InvalidProviderToken');
    expect(calls).toHaveLength(1);
    const [one, two] = await rows();
    expect([one.sent_at, one.retry_at]).toEqual([null, NOW + 15 * MIN]);
    expect(two.sent_at).toBeNull();
  });
  it("Apple's 5xx: one retry 15 minutes later inside the hour; too late in the hour, the morning is missed", async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    const calls = mockApple({ [TOKEN(1)]: [{ status: 503, reason: 'ServiceUnavailable' }, { status: 200 }] });
    expect(await send(cfg)).toMatchObject({ retry: 1, sent: 0 });
    expect(await send(cfg, undefined, NOW + 5 * MIN)).toBeNull();
    expect(await send(cfg, undefined, NOW + 15 * MIN)).toMatchObject({ sent: 1 });
    expect(calls).toHaveLength(2);

    await inStore((sql) => sql.exec('DELETE FROM devices'));
    await addDevices(TOKEN(2));
    mockApple({ [TOKEN(2)]: [{ status: 500, reason: 'InternalServerError' }] });
    expect(await send(cfg, undefined, NOW + 50 * MIN)).toMatchObject({ retry: 0, sent: 0 });
    expect((await rows())[0].sent_at).toBe(NOW + 50 * MIN);
  });
  it('any other answer is logged and the device kept', async () => {
    const { cfg } = await testConfig();
    await addDevices(TOKEN(1));
    mockApple({ [TOKEN(1)]: [{ status: 400, reason: 'PayloadTooLarge' }] });
    const s = await send(cfg);
    expect(s!.failures).toEqual([{ token: TOKEN(1).slice(0, 8), status: 400, reason: 'PayloadTooLarge' }]);
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0].sent_at).toBe(NOW);
  });
});
