import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressBlocked, checkUrl, checkUrlShape } from '../src/reader/ssrf.ts';
import { readAhead, readCached, readerKey } from '../src/reader/cache.ts';
import { photoUrl, rewritePhotos, servePhoto } from '../src/reader/photos.ts';
import { cleanAuthor, clean, extract, photoKey, readArticle, sanitize } from '../src/reader/reader.ts';

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

describe('reader cleanup (#453)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  // NPR's image service: the size sits in the path, the original photo in ?url=.
  const npr = (size: string) =>
    `https://npr.brightspotcdn.com/dims3/default/strip/false/crop/3575x2378+0+0/resize/${size}/quality/85/format/webp/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fab%2Fcd%2Ftrader-floor.jpg`;
  it('keys a photo behind an image service by its original (NPR)', () => {
    expect(photoKey(npr('3575x2378!'))).toBe('trader-floor');
    expect(photoKey(npr('400'))).toBe(photoKey(npr('3575x2378!')));
    expect(photoKey('https://cdn.test/a/b/photo-1200x675.jpg')).toBe('photo');
  });
  it('drops the photo above the title when the text repeats it at another size (NPR)', () => {
    const out = clean(`<figure><img src="${npr('400')}" /><figcaption>A trader on the floor.</figcaption></figure><p>${words(60)}</p>`, npr('3575x2378!'));
    expect(out).not.toContain('<img');
    expect(out).not.toContain('A trader on the floor.');
    expect(out).toContain(words(60));
  });
  it('drops the caption NPR keeps in the block after the photo, and nothing else', () => {
    const cap = 'Stocks sank as investors fear an incoming Democratic Congress could crack down on the AI industry.';
    const out = clean(
      `<div><img src="${npr('400')}" alt="${cap}" /></div><div><p>${cap} <b>Timothy A. Clary/AFP via Getty Images</b> <b>hide caption</b></p><span>Timothy A. Clary/AFP via Getty Images</span></div><p>${words(60)}</p>`,
      npr('3575x2378!'),
    );
    expect(out).not.toContain('Stocks sank');
    expect(out).not.toContain('hide caption');
    expect(out).toContain(words(60));
  });
  it('drops the video fallback text and a figure left with only its caption (DeepMind)', () => {
    const html = sanitize(
      `<p>${words(40)}</p><div><figure><video controls><source src="https://v.test/a.webm" type="video/webm"> Your browser does not support the video tag.</video><figcaption>Your browser does not support the video tag.</figcaption></figure></div>` +
        `<figure><video><source src="https://v.test/b.webm"> Your browser does not support the video tag.</video><figcaption>See how Plan Assist works.</figcaption></figure><p>${words(20)}</p>`,
    );
    const out = clean(html, null);
    expect(out).not.toMatch(/does not support/i);
    expect(out).not.toContain('Plan Assist');
    expect(out).not.toContain('<figure');
    expect(out).toContain(words(40));
    expect(out).toContain(words(20));
  });
  it('drops the junk lines left after the Nov 5 measurement', () => {
    const junk = [
      'Subscribe to THE DECODER for ad-free reading, a weekly AI newsletter, our exclusive "AI Radar" frontier report six times a year, full archive access, and access to our comment section. Subscribe now',
      'SIGN UP TO GET THE POLITICS NEWSLETTER',
      'Subscribed',
      'SHARE This Delightful Story Of A Mystery Resolved With Your Friends…',
      'Click here to read the previous recap.',
      'Read more | Does Ramayana glorify Ravana? The uncomfortable question internet is asking',
      'Read more of our stories about Pittsburgh and Pennsylvania.',
    ];
    const out = clean(`<p>${words(40)}</p>` + junk.map((j) => `<p>${j}</p>`).join(''), null);
    expect(out).toBe(`<p>${words(40)}</p>`);
    // Real lines that look a little like those stay.
    const real = ['Why Disney+ fans should not subscribe now', 'Sign up to vote: deadlines by state', 'Click here to read the full ruling.'];
    const kept = clean(`<p>${words(40)}</p><h2>${real[0]}</h2><h2>${real[1]}</h2><p><a href="https://court.test/r.pdf">${real[2]}</a></p>`, null);
    for (const r of real) expect(kept).toContain(r);
  });
  it('treats a block repeated with a photo credit or a final period added as a repeat', () => {
    const out = clean(
      `<figure><img src="https://cdn.test/t.jpg" /><figcaption>Each Teammate gets their own thread. Image: Perplexity</figcaption></figure><p>Each Teammate gets their own thread.</p><p>${words(40)}</p>`,
      null,
    );
    expect(out.match(/Each Teammate gets their own thread/g)).toHaveLength(1);
    // A caption inside a block that adds the credit is one caption, not two (The Verge).
    const wrapped = clean(`<p>${words(30)}</p><div><figcaption><em>At least this example shows you an image of the product.</em></figcaption> Image: Amazon</div><p>${words(20)}</p>`, null);
    expect(wrapped).toContain('At least this example shows you an image of the product.');
    // The Guardian: the caption with its credit comes first; the story paragraph stays.
    const cyber = 'The Cybertruck never made it on sale in Europe because it did not reach the required safety standards.';
    const guardian = clean(`<figure><img src="https://cdn.test/c.jpg" /><figcaption>${cyber} Photograph: Creative Touch Imaging Ltd/NurPhoto</figcaption></figure><p>${words(30)}</p><p>${cyber}</p><p>${words(20)}</p>`, null);
    expect(guardian).toContain(`<p>${cyber}</p>`);
    expect(guardian).not.toContain('Creative Touch');
    // A heading wrapped in a box still counts as the heading.
    const sub = 'A judge has blocked construction of the arch moments after it won approval';
    const boxed = clean(`<div><h2>${sub}</h2></div><p>${words(30)}</p><p>${sub}.</p>`, null);
    expect(boxed).toContain(`<p>${sub}.</p>`);
    expect(boxed).not.toContain('<h2>');
    // CNBC: a key-points bullet repeats a paragraph; the paragraph stays.
    const point = 'Tesla delivered fewer Cybertrucks in Texas than it had planned for this quarter';
    const cnbc = clean(`<ul><li>${point}</li><li>${words(8)}</li></ul><p>${words(30)}</p><p>${point}.</p>`, null);
    expect(cnbc).toContain(`<p>${point}.</p>`);
    expect(cnbc).not.toContain(`<li>${point}</li>`);
    // Two credit lines are not repeats of each other (Positive News).
    const credits = clean(`<p>${words(30)}</p><p>Image: Drazen Zigic, Getty Images Pro</p><p>${words(20)}</p><p>Image: Drazen Zigic Main image: filipefrazao</p>`, null);
    expect(credits).toContain('Main image: filipefrazao');
    // The Hindu: the subtitle repeats a later paragraph; the subtitle goes, the paragraph stays.
    const dek = 'Earlier, a NATO spokeswoman said allies are working for a just end to the war';
    const hindu = clean(`<h2>${dek}</h2><p>${words(30)}</p><p>${dek}.</p><p>${words(20)}</p>`, null);
    expect(hindu).not.toContain('<h2>');
    expect(hindu).toContain(`<p>${dek}.</p>`);
    // Matador: a heading and the address line that starts with it are different blocks.
    const name = 'The Pendleton House Historic Inn Bed & Breakfast';
    const matador = clean(`<h3>${name}</h3><p>${words(30)}</p><p>${name}: 311 N Main St, Pendleton, OR 97801</p>`, null);
    expect(matador).toContain('311 N Main St');
    expect(matador).toContain('<h3>');
  });
  it('drops every copy of the photo above the title before the story starts, and keeps it farther down', () => {
    const shot = (q: string) => `<p><img src="https://platform.test/uploads/Screenshot-PM.png?${q}" /></p>`;
    const top = clean(
      `${shot('a=1')}<p>A short subtitle line for the story about it all.</p><p>by Jay Peters</p>${shot('crop=2')}<p>${words(60)}</p>`,
      'https://platform.test/uploads/Screenshot-PM.png?quality=90',
    );
    expect(top).not.toContain('<img');
    const later = clean(
      `${shot('a=1')}<p>${words(80)}</p><ul><li><figure>${shot('thumb=140')}</figure> Josh Downs, Colts</li></ul>`,
      'https://platform.test/uploads/Screenshot-PM.png?quality=90',
    );
    expect(later.match(/<img/g)).toHaveLength(1);
    // beehiiv names every upload image.png: a different photo near the top stays.
    const beehiiv = clean(
      `<p><img src="https://media.test/uploads/a1/image.png" /></p><p>A short subtitle line for this post.</p><p><img src="https://media.test/uploads/b2/image.png" /></p><p>${words(60)}</p>`,
      'https://media.test/uploads/a1/image.png',
    );
    expect(beehiiv).toContain('b2/image.png');
  });
  it('gives lazy-loaded photos their address before extraction (DW)', () => {
    const page = `<html><head><title>t</title></head><body><article><h1>Title</h1><p>${words(60)}</p>
      <figure><img data-src="" data-url="https://static.dw.com/image/75314209_\${formatId}.jpg" alt="A man in Prague" /><figcaption>A man in front of a sign in Prague.</figcaption></figure>
      <p>${words(40)}</p></article></body></html>`;
    const r = extract(page, 'https://www.dw.com/en/a')!;
    expect(r.content).toContain('https://static.dw.com/image/75314209_605.jpg');
    expect(photoKey('https://static.dw.com/image/79751428_6.jpg')).toBe(photoKey('https://static.dw.com/image/79751428_605.jpg'));
  });
  it('keeps a long caption even when its figure lost the image', () => {
    const long = 'Plot of potency against rotatable bonds for every compound the agent found, which clearly shows that the highest potency compounds are the most rigid.';
    const out = clean(`<p>${words(30)}</p><figure><figcaption>${long}</figcaption></figure>`, null);
    expect(out).toContain(long);
  });
  it('keeps figures that hold a photo or a quote', () => {
    const out = clean(
      `<p>${words(30)}</p><figure><img src="https://cdn.test/x.jpg" /><figcaption>Photo caption here.</figcaption></figure><figure><blockquote><p>A pull quote that matters a great deal.</p></blockquote><figcaption>Jane Doe</figcaption></figure>`,
      null,
    );
    expect(out).toContain('x.jpg');
    expect(out).toContain('Photo caption here.');
    expect(out).toContain('A pull quote that matters a great deal.');
    expect(out).toContain('Jane Doe');
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

describe('reader photos served from getclearnews.com (#423)', () => {
  const KEY = 'test-photo-key';
  afterEach(() => vi.restoreAllMocks());
  it('rewrites photos only with a key, and leaves data: URLs and our own alone', async () => {
    expect(await photoUrl(undefined, 'https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg');
    expect(await photoUrl(KEY, 'data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(await photoUrl(KEY, 'https://getclearnews.com/x.png')).toBe('https://getclearnews.com/x.png');
    const u = await photoUrl(KEY, 'https://cdn.test/a.jpg?x=1&y=2');
    expect(u).toMatch(/^https:\/\/getclearnews\.com\/img\?w=1200&u=https%3A%2F%2Fcdn\.test%2Fa\.jpg%3Fx%3D1%26y%3D2&s=[\w-]{22}$/);
    const html = await rewritePhotos('<p>x</p><img src="https://cdn.test/a.jpg?x=1&amp;y=2" alt="A" />', KEY);
    expect(html).toBe(`<p>x</p><img src="${u.replace(/&/g, '&amp;')}" alt="A" />`);
  });
  it('serves a signed photo resized, rejects a bad signature, and falls back to the original', async () => {
    const good = new URL(await photoUrl(KEY, 'https://cdn.test/a.jpg'));
    const asked: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      asked.push(init ?? {});
      return new Response('img', { headers: { 'content-type': 'image/webp' } });
    });
    const ok = await servePhoto(new Request(good, { headers: { accept: 'image/webp,*/*' } }), KEY);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('public, max-age=604800');
    expect((asked[0] as { cf?: unknown }).cf).toEqual({ image: { width: 1200, fit: 'scale-down', format: 'webp' } });
    const forged = new URL(good);
    forged.searchParams.set('u', 'https://evil.test/b.jpg');
    expect((await servePhoto(new Request(forged), KEY)).status).toBe(404);
    expect((await servePhoto(new Request(good), undefined)).status).toBe(404);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error 9422', { status: 403 }));
    const fallback = await servePhoto(new Request(good), KEY);
    expect(fallback.status).toBe(302);
    expect(fallback.headers.get('location')).toBe('https://cdn.test/a.jpg');
  });
});
