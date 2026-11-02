import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressBlocked, checkUrl, checkUrlShape } from '../src/reader/ssrf.ts';
import { readAhead, readCached, readerKey } from '../src/reader/cache.ts';
import { cleanAuthor, clean, extract, readArticle, sanitize } from '../src/reader/reader.ts';

describe('checkUrlShape (spec section 6, review R12)', () => {
  const detail = (u: string) => {
    const r = checkUrlShape(u, ['clearnews.example.workers.dev']);
    return r.ok ? 'ok' : r.detail;
  };
  it('keeps the three 400 messages', () => {
    expect(detail('ftp://example.com/')).toBe('URL scheme not allowed');
    expect(detail('example.com')).toBe('URL scheme not allowed');
    expect(detail('')).toBe('URL scheme not allowed');
    expect(detail('https://user:pw@example.com/')).toBe('Invalid URL');
    expect(detail('http://127.0.0.1/admin')).toBe('URL not allowed');
  });
  it('rejects IP literals in every form WHATWG normalizes', () => {
    for (const u of ['http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://[::ffff:7f00:1]/', 'http://1.1.1.1/']) {
      expect(detail(u)).toBe('URL not allowed');
    }
  });
  it('rejects local names, single labels and our own hosts, with or without a trailing dot', () => {
    for (const u of [
      'http://localhost/', 'http://intranet/', 'http://a.local/', 'http://b.internal/', 'http://c.localhost/',
      'https://GetClearNews.com./x', 'https://www.getclearnews.com/', 'https://clearnews.example.workers.dev/',
    ]) {
      expect(detail(u)).toBe('URL not allowed');
    }
  });
  it('accepts ordinary article URLs', () => {
    expect(detail('https://www.bbc.co.uk/news/articles/abc')).toBe('ok');
  });
});

describe('addressBlocked', () => {
  it('blocks private, reserved and special ranges', () => {
    for (const ip of ['10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.0.8']) {
      expect(addressBlocked(ip), ip).toBe(true);
    }
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '2001:0:1::1', '64:ff9b:1::1']) {
      expect(addressBlocked(ip), ip).toBe(true);
    }
  });
  it('unpacks IPv4 embedded in IPv6', () => {
    expect(addressBlocked('::ffff:127.0.0.1')).toBe(true);
    expect(addressBlocked('::ffff:7f00:1')).toBe(true);
    expect(addressBlocked('64:ff9b::a9fe:a9fe')).toBe(true);
    expect(addressBlocked('2002:7f00:1::1')).toBe(true);
    expect(addressBlocked('::ffff:8.8.8.8')).toBe(false);
    expect(addressBlocked('2002:808:808::1')).toBe(false);
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111', '2a04:4e42::81']) expect(addressBlocked(ip), ip).toBe(false);
  });
});

describe('checkUrl with DNS over HTTPS', () => {
  afterEach(() => vi.restoreAllMocks());
  const doh = (answers: Record<string, string[]>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = new URL(String(input instanceof Request ? input.url : input));
      const type = u.searchParams.get('type')!;
      const data = answers[type] ?? [];
      return Response.json({ Status: 0, Answer: data.map((d) => ({ type: type === 'A' ? 1 : 28, data: d })) });
    });
  it('rejects a name that resolves to a private address', async () => {
    doh({ A: ['93.184.215.14', '10.0.0.5'] });
    expect(await checkUrl('https://rebind.example.com/')).toEqual({ ok: false, detail: 'URL not allowed' });
  });
  it('rejects a name that does not resolve', async () => {
    doh({});
    expect(await checkUrl('https://nothing.example.com/')).toEqual({ ok: false, detail: 'URL not allowed' });
  });
  it('accepts public answers', async () => {
    doh({ A: ['93.184.215.14'], AAAA: ['2606:2800:21f:cb07:6820:80da:af6b:8b2c'] });
    expect((await checkUrl('https://example.com/')).ok).toBe(true);
  });
});

describe('reader extraction and sanitizer', () => {
  it('sanitize keeps the nh3 allowlist and sets rel on every link', () => {
    const out = sanitize(
      '<section><p class="x" style="y">Hi <a href="javascript:alert(1)" target="_blank">x</a> <a href="https://a.test/" rel="me">y</a></p><script>bad()</script><iframe src="https://e.test"></iframe><img src="/r.jpg" onerror="z" srcset="a 1x"></section>',
    );
    expect(out).toBe(
      '<p>Hi <a rel="noopener noreferrer">x</a> <a href="https://a.test/" rel="noopener noreferrer">y</a></p><img src="/r.jpg" />',
    );
  });
  it('extract needs 50 words and makes links absolute from the final URL', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const html = `<html><head><title>T</title></head><body><article><h1>T</h1><p>${words} <a href="/rel">link</a></p><p>${words}</p></article></body></html>`;
    const r = extract(html, 'https://news.test/a/b')!;
    expect(r.content).toContain('href="https://news.test/rel"');
    expect(extract('<html><body><p>too short</p></body></html>', 'https://news.test/')).toBeNull();
  });
  it('extract keeps every block of an article split around ad slots (Ars Technica, #423)', () => {
    const para = (n: number) => `<p>${Array.from({ length: 40 }, (_, i) => `block${n}word${i}`).join(' ')}.</p>`;
    const html = `<html><head><title>T</title></head><body><main><article><h1>T</h1>
      <div class="post-content">${para(1)}${para(2)}</div><div class="ad">Advertisement</div>
      <div class="post-content">${para(3)}${para(4)}</div><div class="ad">Advertisement</div>
      <div class="post-content">${para(5)}${para(6)}</div></article></main></body></html>`;
    const r = extract(html, 'https://arstechnica.test/a')!;
    for (const n of [1, 3, 5, 6]) expect(r.content).toContain(`block${n}word0`);
  });
});

describe('reader cleanup (#423)', () => {
  const words = (n: number, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
  it('removes page furniture as whole blocks, but not a word inside a sentence', () => {
    const out = clean(
      `<p>Skip to content</p><p>${words(30)} the race is <a href="https://x.test/">close</a> now.</p><p><a href="https://x.test/c">149 Comments</a></p><p><strong>Follow topics and authors</strong> from this story to see more like this in your personalized homepage feed and to receive email updates.</p><p>CLICK HERE TO DOWNLOAD THE FOX NEWS APP</p><p>Advertisement</p><ul><li></li><li> </li></ul>`,
      null,
    );
    expect(out).toBe(`<p>${words(30)} the race is <a href="https://x.test/">close</a> now.</p>`);
  });
  it('drops a repeated caption and the photo already shown above the title, with its caption', () => {
    const cap = 'Boom Supersonic CEO Blake Scholl speaks during the unveiling of a factory.';
    const out = clean(
      `<div><a href="https://cdn.test/a.jpg"><img src="https://cdn.test/uploads/Superfactory.jpg" width="7936" height="5034" /></a><p>${cap}</p></div><p>${cap}</p><p>${words(60)}</p><figure><img src="https://cdn.test/other.jpg" /><figcaption>Another photo with its own caption here.</figcaption></figure>`,
      'https://cdn.test/uploads/Superfactory-1200x675.jpg',
    );
    expect(out).not.toContain('Superfactory');
    expect(out).not.toContain(cap);
    expect(out).toContain('other.jpg');
    expect(out).toContain('Another photo with its own caption here.');
  });
  it('never removes the article with the photo, and fixes comma-joined image addresses', () => {
    const body = `<div><img src="https://cdn.test/hero.jpg" /><p>${words(55)}</p></div>`;
    expect(clean(body, 'https://cdn.test/hero.jpg')).toContain(words(55));
    const fixed = clean(`<p>${words(20)}</p><img src="https://a.test/1.jpg?ve=1, https://a.test/2.jpg?ve=1" /><img src="https://t.test/p.gif" width="1" height="1" />`, null);
    expect(fixed).toContain('src="https://a.test/1.jpg?ve=1"');
    expect(fixed).not.toContain('p.gif');
  });
  it('cleans the author field', () => {
    expect(cleanAuthor('Terrence O&#x27;Brien')).toBe("Terrence O'Brien");
    expect(cleanAuthor('https://www.facebook.com/ieeespectrum')).toBeNull();
    expect(cleanAuthor('Sponsored Content')).toBeNull();
    expect(cleanAuthor('  Jane   Doe ')).toBe('Jane Doe');
  });
  it('a video page answers reason video without fetching', async () => {
    const r = await readArticle('https://www.bbc.co.uk/news/videos/ckz652g7093go', undefined, ['getclearnews.com']);
    expect(r).toMatchObject({ status: 'failed', reason: 'video', content_html: null });
  });
});

describe('reader cache and read-ahead (#423)', () => {
  const page = `<html><head><title>Story</title></head><body><article><h1>Story</h1><p>${Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ')}.</p></article></body></html>`;
  const art = (n: number) => ({ title: `Story ${n}`, summary: '', url: `https://news.example.com/s${n}`, image_url: null, source_id: 'the-verge', source_name: 'The Verge', source_type: 'rss', category: 'tech', sentiment: null, published_at: null });
  let pages: string[];
  beforeEach(() => {
    pages = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = new URL(String(input instanceof Request ? input.url : input));
      if (u.pathname.includes('dns-query')) {
        const type = u.searchParams.get('type');
        return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
      }
      pages.push(u.toString());
      return new Response(page, { headers: { 'content-type': 'text/html' } });
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it('a second open is served from KV without fetching the page again', async () => {
    const waits: Promise<unknown>[] = [];
    const first = await readCached(env.CACHE, art(1).url, art(1), ['getclearnews.com'], (p) => waits.push(p));
    await Promise.all(waits);
    const second = await readCached(env.CACHE, art(1).url, art(1), ['getclearnews.com'], (p) => waits.push(p));
    expect(first.status).toBe('ok');
    expect(second).toEqual(first);
    expect(pages).toEqual([art(1).url]);
  });
  it('read-ahead stores what is not stored yet', async () => {
    const one = await readAhead(env.CACHE, [art(2), art(3)], ['getclearnews.com'], 5000);
    expect(one).toEqual({ read: 2, already: 0, failed: 0 });
    const two = await readAhead(env.CACHE, [art(2), art(3), art(4)], ['getclearnews.com'], 5000);
    expect(two).toEqual({ read: 1, already: 2, failed: 0 });
    expect(await env.CACHE.get(await readerKey(art(4).url))).not.toBeNull();
  });
});
