import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressBlocked, checkUrl, checkUrlShape } from '../src/reader/ssrf.ts';
import { extract, sanitize } from '../src/reader/reader.ts';

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
});
