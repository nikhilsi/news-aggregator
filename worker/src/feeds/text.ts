// Text helpers ported from backend/app/sources/rss_fetcher.py.
// strip_html there uses Python's HTMLParser: every run of text between tags is
// one piece, pieces are joined with a single space, and the result is trimmed.
// That spacing ("Hello  world !") is kept on purpose for the move (spec
// section 3, O17 deferred to #413).

import { decodeHTML } from 'entities';

const RAW_TEXT = new Set(['script', 'style']);

/** Port of strip_html(): HTML to plain text. Returns null for empty input. */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const parts: string[] = [];
  let i = 0;
  let text = '';
  const flush = () => {
    if (text) parts.push(decodeHTML(text));
    text = '';
  };
  while (i < html.length) {
    const ch = html[i];
    if (ch !== '<') {
      text += ch;
      i++;
      continue;
    }
    const next = html[i + 1] ?? '';
    if (html.startsWith('<!--', i)) {
      // Comment: dropped, like HTMLParser.handle_comment.
      flush();
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      // Declarations, CDATA markers and processing instructions: dropped.
      flush();
      const end = html.indexOf('>', i + 2);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const tag = /^<\/?([a-zA-Z][^\s/>]*)[^>]*>/.exec(html.slice(i));
    if (!tag) {
      // A "<" that does not open a tag is text, as in HTMLParser.
      text += ch;
      i++;
      continue;
    }
    flush();
    i += tag[0].length;
    const name = tag[1].toLowerCase();
    if (!tag[0].startsWith('</') && RAW_TEXT.has(name)) {
      // HTMLParser hands script and style content over as text, undecoded.
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      const body = html.slice(i, close === -1 ? html.length : close);
      if (body) parts.push(body);
      i = close === -1 ? html.length : close;
    }
  }
  flush();
  return parts.join(' ').trim();
}

/** Port of _extract_summary's cut: at most 500 code points (497 plus "..."). */
export function cutSummary(text: string | null): string | null {
  if (!text) return text;
  const chars = Array.from(text);
  if (chars.length > 500) return chars.slice(0, 497).join('') + '...';
  return text;
}
