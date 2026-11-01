// Turns feedsmith's parsed items into the fields Python read from feedparser
// entries, so normalize.ts can follow rss_fetcher.py line by line.
//
// feedparser behavior reproduced here (inventory 2.3):
// - link falls back to <guid> unless isPermaLink="false";
// - summary is <description> (RSS) or <summary> (Atom), else the content;
// - published is pubDate / Atom published; updated is dc:date / Atom updated;
// - Atom enclosures are <link rel="enclosure">.

import { parseFeed } from 'feedsmith';

export interface Entry {
  title?: string;
  link?: string;
  summary?: string;
  content?: string;
  mediaContent: { url?: string; type?: string }[];
  mediaThumbnail: { url?: string }[];
  enclosures: { url?: string; type?: string }[];
  published?: string;
  updated?: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
/** Atom text constructs come as { value, type }; RSS fields as plain strings. */
const text = (v: unknown): string | undefined => (isObj(v) ? str(v.value) : str(v));

function media(item: Obj) {
  const m = isObj(item.media) ? item.media : {};
  const group = isObj(m.group) ? m.group : {};
  const contents = [...list(m.contents), ...list(group.contents)];
  const thumbs = [...list(m.thumbnails), ...list(group.thumbnails)];
  return {
    mediaContent: contents.map((c) => ({ url: str(c.url), type: str(c.type) })),
    mediaThumbnail: thumbs.map((t) => ({ url: str(t.url) })),
  };
}

function fromRss(item: Obj): Entry {
  const guid = isObj(item.guid) ? item.guid : undefined;
  const guidLink = guid && guid.isPermaLink !== false ? str(guid.value) : undefined;
  const content = isObj(item.content) ? str(item.content.encoded) : undefined;
  const dc = isObj(item.dc) ? item.dc : {};
  return {
    title: text(item.title),
    link: str(item.link) || guidLink,
    summary: str(item.description) || content,
    content,
    ...media(item),
    enclosures: list(item.enclosures).map((e) => ({ url: str(e.url), type: str(e.type) })),
    published: str(item.pubDate),
    updated: str(dc.date),
  };
}

function fromAtom(entry: Obj): Entry {
  const links = list(entry.links);
  const alternate = links.find((l) => !l.rel || l.rel === 'alternate');
  const content = text(entry.content);
  return {
    title: text(entry.title),
    link: str(alternate?.href),
    summary: text(entry.summary) || content,
    content,
    ...media(entry),
    enclosures: links
      .filter((l) => l.rel === 'enclosure')
      .map((l) => ({ url: str(l.href), type: str(l.type) })),
    published: str(entry.published),
    updated: str(entry.updated),
  };
}

/** Parses a feed document. Throws if feedsmith cannot recognize it. */
export function parseEntries(xml: string): Entry[] {
  const parsed = parseFeed(xml) as { format: string; feed: Obj };
  if (parsed.format === 'atom') return list(parsed.feed.entries).map(fromAtom);
  return list(parsed.feed.items).map(fromRss);
}
