// Feed dates. Python used feedparser's parsed date (always UTC), falling back
// to email.utils. Here: Date.parse, after mapping zone names V8 does not know.
// Every date leaves as YYYY-MM-DDTHH:MM:SSZ, the format the iOS app decodes;
// anything that cannot be made valid becomes null (spec section 3, R2).

const ZONES: Record<string, string> = {
  IST: '+0530',
  CEST: '+0200',
  CET: '+0100',
  BST: '+0100',
  AEST: '+1000',
  AEDT: '+1100',
  JST: '+0900',
  HKT: '+0800',
  SGT: '+0800',
  NZST: '+1200',
};

// Date.UTC would read year 1 as 1901, so parse the bounds from strings.
const MIN_MS = Date.parse('0001-01-01T00:00:00Z');
const MAX_MS = Date.parse('9999-12-31T23:59:59Z');

/** Parses one raw feed date to epoch milliseconds (whole seconds), or null. */
export function parseFeedDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    const m = /\s([A-Za-z]{2,5})$/.exec(s);
    const offset = m ? ZONES[m[1].toUpperCase()] : undefined;
    if (offset) ms = Date.parse(s.slice(0, m!.index) + ' ' + offset);
  }
  if (Number.isNaN(ms) || ms < MIN_MS || ms > MAX_MS) return null;
  return Math.floor(ms / 1000) * 1000;
}

/** Formats epoch milliseconds as YYYY-MM-DDTHH:MM:SSZ. */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
  );
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
