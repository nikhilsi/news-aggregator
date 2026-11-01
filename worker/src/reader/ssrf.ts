// Reader URL checks (spec section 6, review R12). Applied to the first URL and
// to every redirect hop. The edge resolves the name again when it connects, so
// the DNS step is best effort; the hop checks, rate limit, byte cap and timeout
// carry the rest.

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

// IPv6 ranges blocked outright. Forms that embed an IPv4 address
// (::ffff:0:0/96, 64:ff9b::/96, 2002::/16) are unpacked and checked instead.
const V6_BLOCKED: [string, number][] = [
  ['::', 96], // ::, ::1 and the old IPv4-compatible form
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
  ['64:ff9b:1::', 48], ['2001::', 32], // local-use NAT64, Teredo
];

function v4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4ToInt(base)! & mask) >>> 0);
  });
}

/** Parses an IPv6 address into a 128-bit BigInt, or null. */
export function v6ToBigInt(ip: string): bigint | null {
  let s = ip.toLowerCase();
  const v4tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (v4tail) {
    const n = v4ToInt(v4tail[1]);
    if (n === null) return null;
    s = s.slice(0, -v4tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n);
}

const inV6 = (n: bigint, base: string, bits: number) => {
  const shift = BigInt(128 - bits);
  return n >> shift === v6ToBigInt(base)! >> shift;
};

const v4FromInt = (n: bigint) =>
  [24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 0xffn)).join('.');

function v6Blocked(ip: string): boolean {
  const n = v6ToBigInt(ip);
  if (n === null) return true;
  if (V6_BLOCKED.some(([base, bits]) => inV6(n, base, bits))) return true;
  if (inV6(n, '::ffff:0:0', 96) || inV6(n, '64:ff9b::', 96)) return v4Blocked(v4FromInt(n & 0xffffffffn));
  if (inV6(n, '2002::', 16)) return v4Blocked(v4FromInt((n >> 80n) & 0xffffffffn));
  return false;
}

/** True when an address (v4 or v6) is one the reader must not reach. */
export function addressBlocked(ip: string): boolean {
  return ip.includes(':') ? v6Blocked(ip) : v4Blocked(ip);
}

export const OWN_HOSTS = new Set(['getclearnews.com', 'www.getclearnews.com']);

export type UrlCheck = { ok: true; url: URL } | { ok: false; detail: string };

/**
 * The checks that need no network: scheme, userinfo, and hostname rules.
 * Returns the 400 detail strings the API has always used.
 */
export function checkUrlShape(raw: string, extraOwnHosts: string[] = []): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
    return { ok: false, detail: scheme === 'http' || scheme === 'https' ? 'Invalid URL' : 'URL scheme not allowed' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, detail: 'URL scheme not allowed' };
  if (!url.hostname || url.username || url.password) return { ok: false, detail: 'Invalid URL' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const isIpLiteral = host.startsWith('[') || v4ToInt(host) !== null;
  if (
    isIpLiteral ||
    host === 'localhost' ||
    !host.includes('.') ||
    /\.(local|internal|localhost)$/.test(host) ||
    OWN_HOSTS.has(host) ||
    extraOwnHosts.includes(host)
  ) {
    return { ok: false, detail: 'URL not allowed' };
  }
  return { ok: true, url };
}

interface DohAnswer {
  type: number;
  data: string;
}

/** Resolves A and AAAA through DNS over HTTPS. Null when the name does not resolve. */
export async function resolve(host: string, timeoutMs = 3000): Promise<string[] | null> {
  const ask = async (type: 'A' | 'AAAA') => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`doh ${res.status}`);
    const body = (await res.json()) as { Status: number; Answer?: DohAnswer[] };
    return (body.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  };
  try {
    const [a, aaaa] = await Promise.all([ask('A'), ask('AAAA')]);
    const all = [...a, ...aaaa];
    return all.length ? all : null;
  } catch {
    return null;
  }
}

/** Full check for one URL: shape, then every resolved address. */
export async function checkUrl(raw: string, extraOwnHosts: string[] = []): Promise<UrlCheck> {
  const shape = checkUrlShape(raw, extraOwnHosts);
  if (!shape.ok) return shape;
  const addresses = await resolve(shape.url.hostname.replace(/\.$/, ''));
  if (!addresses || addresses.some(addressBlocked)) return { ok: false, detail: 'URL not allowed' };
  return shape;
}
