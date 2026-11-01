import { describe, expect, it } from 'vitest';
import { cutSummary, stripHtml } from '../src/feeds/text.ts';
import { formatDate, parseFeedDate } from '../src/feeds/dates.ts';
import { extractImage, normalizeEntry } from '../src/feeds/normalize.ts';
import { parseEntries } from '../src/feeds/entry.ts';
import { decodeBody, ogFromHtml } from '../src/feeds/fetch.ts';
import { gate } from '../src/pipeline/gate.ts';
import { deduplicate, isNonLatin, mergeForTab, tieredSort } from '../src/pipeline/merge.ts';
import { trimSource } from '../src/pipeline/trim.ts';
import type { Article } from '../src/types.ts';
import { SOURCES } from '../src/sources.ts';

const art = (o: Partial<Article>): Article => ({
  title: 't',
  summary: null,
  url: 'https://x.test/1',
  image_url: null,
  source_id: 's1',
  source_name: 'S1',
  source_type: 'rss',
  category: 'tech',
  sentiment: null,
  published_at: '2026-11-01T10:00:00Z',
  ...o,
});

describe('stripHtml (port of strip_html)', () => {
  it('collapses spacing and leaves no space before punctuation (O17)', () => {
    expect(stripHtml('Hello <b>world</b>! &amp; more <p>para</p>')).toBe('Hello world! & more para');
    expect(stripHtml('<p>One</p>\n\n<p>Two .</p>')).toBe('One Two.');
  });
  it('null for empty, "" for tags only', () => {
    expect(stripHtml('')).toBeNull();
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml('<br/>  ')).toBe('');
  });
  it('drops comments, keeps script text undecoded like HTMLParser', () => {
    expect(stripHtml('a<!-- x -->b')).toBe('a b');
    expect(stripHtml('a<script>1 &amp; 2</script>b')).toBe('a 1 &amp; 2 b');
  });
  it('a lone < is text', () => {
    expect(stripHtml('1 < 2')).toBe('1 < 2');
  });
  it('keeps text that ends near a bare &, which Python lost (listed difference)', () => {
    expect(stripHtml('Alabama A&M')).toBe('Alabama A&M');
  });
});

describe('cutSummary', () => {
  it('cuts at 497 code points plus "..."', () => {
    expect(cutSummary('a'.repeat(600))).toBe('a'.repeat(497) + '...');
    expect(cutSummary('a'.repeat(500))).toBe('a'.repeat(500));
  });
  it('never splits an emoji (review R2)', () => {
    const s = cutSummary('x'.repeat(496) + '😀' + 'y'.repeat(50))!;
    expect(s.isWellFormed()).toBe(true);
    expect(s).toBe('x'.repeat(496) + '😀...');
  });
});

describe('dates', () => {
  it('RFC 822, ISO 8601, GMT and EST', () => {
    expect(formatDate(parseFeedDate('Sun, 01 Nov 2026 20:30:06 +0530')!)).toBe('2026-11-01T15:00:06Z');
    expect(formatDate(parseFeedDate('2026-11-01T11:19:21-05:00')!)).toBe('2026-11-01T16:19:21Z');
    expect(formatDate(parseFeedDate('Fri, 30 Oct 2026 06:30:08 GMT')!)).toBe('2026-10-30T06:30:08Z');
    expect(formatDate(parseFeedDate('Fri, 30 Oct 2026 06:30:08 EST')!)).toBe('2026-10-30T11:30:08Z');
  });
  it('maps zone names V8 does not know', () => {
    expect(formatDate(parseFeedDate('Sat, 01 Nov 2026 20:30:00 IST')!)).toBe('2026-11-01T15:00:00Z');
    expect(formatDate(parseFeedDate('Sat, 01 Nov 2026 20:30:00 CEST')!)).toBe('2026-11-01T18:30:00Z');
  });
  it('null for anything invalid or outside years 1 to 9999 (review R2)', () => {
    for (const bad of ['2026-13-45T00:00:00Z', 'Sun, 02 Nov 2026 25:61:00 GMT', 'Mon, 01 Jan 10000 00:00:00 GMT', 'nope', '']) {
      expect(parseFeedDate(bad)).toBeNull();
    }
  });
  it('drops milliseconds', () => {
    expect(formatDate(parseFeedDate('2026-11-01T10:00:00.789Z')!)).toBe('2026-11-01T10:00:00Z');
  });
});

describe('feed entries and normalization', () => {
  const src = SOURCES.find((s) => s.id === 'ndtv')!;
  it('RSS: description wins over media:description and content (listed difference)', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title><link>https://x.test</link><description>d</description>
      <item><guid isPermaLink="true">https://x.test/a</guid><title><![CDATA[A <b>title</b>]]></title><pubDate>Sun, 01 Nov 2026 20:30:06 +0530</pubDate>
      <media:content url="https://img.test/a.jpg" type="image/jpeg"><media:description>caption</media:description></media:content>
      <description>The summary</description><content:encoded>The content</content:encoded></item></channel></rss>`;
    const [e] = parseEntries(xml);
    const a = normalizeEntry(e, src)!;
    expect(a).toEqual({
      title: 'A title',
      summary: 'The summary',
      url: 'https://x.test/a',
      image_url: 'https://img.test/a.jpg',
      source_id: 'ndtv',
      source_name: 'NDTV',
      source_type: 'rss',
      category: 'india',
      sentiment: null,
      published_at: '2026-11-01T15:00:06Z',
    });
  });
  it('link falls back to a permalink guid, not to isPermaLink="false"', () => {
    const mk = (perma: string) =>
      parseEntries(`<rss version="2.0"><channel><title>x</title><link>https://x.test</link><description>d</description><item><title>T</title><guid isPermaLink="${perma}">https://x.test/g</guid></item></channel></rss>`)[0];
    expect(mk('true').link).toBe('https://x.test/g');
    expect(mk('false').link).toBeUndefined();
  });
  it('drops entries without title or link, and India Today visual stories', () => {
    expect(normalizeEntry({ title: 'T', mediaContent: [], mediaThumbnail: [], enclosures: [] }, src)).toBeNull();
    expect(
      normalizeEntry({ title: 'T', link: 'https://x.test/visualstories/1', mediaContent: [], mediaThumbnail: [], enclosures: [] }, src),
    ).toBeNull();
  });
  it('image order: media:content (image or untyped), thumbnail, image enclosure, <img>', () => {
    const base = { mediaContent: [], mediaThumbnail: [], enclosures: [] };
    expect(extractImage({ ...base, mediaContent: [{ url: 'v', type: 'video/mp4' }], mediaThumbnail: [{ url: 't' }] })).toBe('t');
    expect(extractImage({ ...base, enclosures: [{ url: 'e', type: 'image/png' }] })).toBe('e');
    expect(extractImage({ ...base, summary: '<p><img alt="x" src=\'s.jpg\'></p>' })).toBe('s.jpg');
    expect(extractImage(base)).toBeNull();
  });
  it('Atom: alternate link, summary, published', () => {
    const [e] = parseEntries(`<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title><id>x</id><updated>2026-11-01T00:00:00Z</updated>
      <entry><title type="html">A &amp;amp; B</title><id>1</id><link rel="alternate" href="https://x.test/e"/><published>2026-11-01T11:19:21-05:00</published><updated>2026-11-01T12:00:00Z</updated><summary type="html">&lt;p&gt;S&lt;/p&gt;</summary></entry></feed>`);
    expect(e.link).toBe('https://x.test/e');
    expect(normalizeEntry(e, src)!.title).toBe('A & B');
    expect(normalizeEntry(e, src)!.summary).toBe('S');
    expect(normalizeEntry(e, src)!.published_at).toBe('2026-11-01T16:19:21Z');
  });
});

describe('decodeBody', () => {
  it('valid UTF-8 wins over a wrong charset label (Sunny Skyz, listed difference)', () => {
    const bytes = new TextEncoder().encode('Toddler’s');
    expect(decodeBody(bytes, 'application/xml; charset=ISO-8859-1')).toBe('Toddler’s');
  });
  it('falls back to the declared charset for non-UTF-8 bytes', () => {
    expect(decodeBody(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), 'text/xml; charset=iso-8859-1')).toBe('café');
  });
});

describe('ogFromHtml', () => {
  it('both attribute orders, first 15,000 characters only', () => {
    expect(ogFromHtml('<meta property="og:image" content="https://i/a.jpg">')).toBe('https://i/a.jpg');
    expect(ogFromHtml("<meta content='https://i/b.jpg' property='og:image'>")).toBe('https://i/b.jpg');
    expect(ogFromHtml('x'.repeat(15000) + '<meta property="og:image" content="late">')).toBeNull();
  });
});

describe('gate (review R2)', () => {
  it('repairs lone surrogates', () => {
    const r = gate(art({ summary: 'ab\ud83d' }));
    expect('article' in r && r.article.summary).toBe('ab�');
  });
  it('drops missing required fields and bad dates', () => {
    expect('reason' in gate(art({ title: '' }))).toBe(true);
    expect('reason' in gate(art({ published_at: '2026-11-01T10:00:00+05:30' }))).toBe(true);
    expect('reason' in gate(art({ published_at: '+010000-01-01T00:00:00Z' }))).toBe(true);
  });
});

describe('merge (port of service.py)', () => {
  it('non-Latin: more than 20 percent of letters', () => {
    expect(isNonLatin('यूपी में हथकड़ी')).toBe(true);
    expect(isNonLatin('Café über naïve')).toBe(false);
    expect(isNonLatin('123 !!')).toBe(false);
  });
  it('dedup by URL keeps the one with an image; ties keep the first', () => {
    const a = art({ url: 'u', source_id: 'a' });
    const b = art({ url: 'u', source_id: 'b', image_url: 'i' });
    expect(deduplicate([a, b])).toEqual([b]);
    const c = art({ url: 'u', source_id: 'c' });
    expect(deduplicate([a, c])).toEqual([a]);
  });
  it('dedup by title only within a category, 60 percent of the smaller set', () => {
    const a = art({ url: '1', title: 'Samsung Galaxy Unpacked event date announced' });
    const b = art({ url: '2', title: 'Galaxy Unpacked event confirmed by Samsung', image_url: 'i' });
    const other = art({ url: '3', title: 'Samsung Galaxy Unpacked event date announced', category: 'india' });
    expect(deduplicate([a, b, other]).map((x) => x.url)).toEqual(['2', '3']);
  });
  it('sort: newest first, undated last, stable (O1)', () => {
    const list = [
      art({ url: '1', published_at: null }),
      art({ url: '2', published_at: '2026-11-01T09:00:00Z' }),
      art({ url: '3', published_at: '2026-11-01T11:00:00Z' }),
      art({ url: '4', published_at: '2026-11-01T09:00:00Z' }),
    ];
    expect(tieredSort(list, 'tech').map((x) => x.url)).toEqual(['3', '2', '4', '1']);
  });
  it('all tab: one per source, at most three per category, in tier 1', () => {
    const list = [1, 2, 3, 4].flatMap((s) =>
      [0, 1].map((k) => art({ url: `${s}-${k}`, source_id: `s${s}`, published_at: `2026-11-0${s}T0${k}:00:00Z` })),
    );
    const out = tieredSort(list, 'all').map((x) => x.url);
    expect(out.slice(0, 3)).toEqual(['4-1', '3-1', '2-1']);
  });
  it('non-Latin titles are hidden in every tab, India included (#413)', () => {
    const hi = art({ title: 'यूपी में हथकड़ी', category: 'india' });
    expect(mergeForTab([[hi]], 'india')).toHaveLength(0);
    expect(mergeForTab([[hi]], 'all')).toHaveLength(0);
  });
});

describe('trimSource (#413)', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const at = (d: number, h = 0) => new Date(now - d * 864e5 - h * 36e5).toISOString().slice(0, 19) + 'Z';
  it('drops items older than 7 days, keeps undated', () => {
    const out = trimSource([art({ url: 'old', published_at: at(8) }), art({ url: 'new', published_at: at(1) }), art({ url: 'nodate', published_at: null })], now);
    expect(out.map((a) => a.url)).toEqual(['new', 'nodate']);
  });
  it('keeps the newest 30, in feed order', () => {
    const list = Array.from({ length: 40 }, (_, i) => art({ url: `u${i}`, published_at: at(0, i % 2 ? 40 - i : i) }));
    const out = trimSource(list, now);
    expect(out).toHaveLength(30);
    const idx = out.map((a) => Number(a.url.slice(1)));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});
