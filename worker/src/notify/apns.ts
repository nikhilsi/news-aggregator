// Apple's push service (#435). fetch() reaches it over HTTP/2 through
// Cloudflare's proxy in production (probe, Nov 9, 2026); local `wrangler dev`
// cannot. Production only: TestFlight and App Store builds both use it.
// Design: docs/435-notifications-design.md section 6.1.

export const APNS_HOST = 'https://api.push.apple.com';
/** Apple wants a new login token at least every 60 minutes. */
export const LOGIN_MAX_AGE_MS = 50 * 60e3;
/** ...and refuses a new one more often than every 20 minutes. */
export const LOGIN_MIN_AGE_MS = 20 * 60e3;
/** Per request; the sender also stops starting new sends after its own budget. */
export const SEND_TIMEOUT_MS = 5_000;
/** A phone that was off all morning doesn't get a stale edition at noon. */
export const EXPIRES_AFTER_S = 2 * 60 * 60;

export interface ApnsConfig {
  /** The .p8 key's contents (PKCS#8 PEM), a Worker secret. */
  key: string;
  keyId: string;
  teamId: string;
  /** The app's bundle id. */
  topic: string;
}

export interface Login {
  kid: string;
  jwt: string;
  /** When it was signed, epoch ms. */
  iat: number;
}

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der.buffer;
}

/** An ES256 login token: header {alg, kid}, claims {iss: team id, iat}. */
export async function signLogin(cfg: ApnsConfig, now: number): Promise<Login> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(cfg.key), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  const iat = Math.floor(now / 1000);
  const head = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })));
  const claims = base64url(enc.encode(JSON.stringify({ iss: cfg.teamId, iat })));
  // Web Crypto's ECDSA signature is already the raw r||s form a JWT uses.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return { kid: cfg.keyId, jwt: `${head}.${claims}.${base64url(new Uint8Array(sig))}`, iat: iat * 1000 };
}

export interface ApnsAnswer {
  /** HTTP status, or 0 when the request failed or timed out. */
  status: number;
  reason: string | null;
}

export async function sendAlert(
  token: string,
  payload: object,
  login: Login,
  topic: string,
  now: number,
  kind: 'morning' | 'breaking' = 'morning',
): Promise<ApnsAnswer> {
  try {
    const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${login.jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(now / 1000) + EXPIRES_AFTER_S),
        // A newer alert of the same kind replaces one that was never shown.
        'apns-collapse-id': kind,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Workers reject 'error'.
      redirect: 'manual',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.status === 200) {
      await res.body?.cancel();
      return { status: 200, reason: null };
    }
    let reason: string | null = null;
    try {
      reason = ((await res.json()) as { reason?: string }).reason ?? null;
    } catch {
      reason = null;
    }
    return { status: res.status, reason };
  } catch (e) {
    return { status: 0, reason: String(e).slice(0, 120) };
  }
}

export type Action = 'delivered' | 'remove' | 'relogin' | 'setup' | 'retry' | 'keep';

/** What the sender does with each of Apple's answers (the table in section 6.1). */
export function classify(a: ApnsAnswer): Action {
  if (a.status === 200) return 'delivered';
  // Unregistered, ExpiredToken: the app is gone from that phone.
  if (a.status === 410) return 'remove';
  if (a.status === 400 && (a.reason === 'BadDeviceToken' || a.reason === 'DeviceTokenNotForTopic')) return 'remove';
  if (a.status === 403 && a.reason === 'ExpiredProviderToken') return 'relogin';
  // Our setup, not the device: InvalidProviderToken, BadEnvironmentKeyIdInToken,
  // Forbidden, UnrelatedKeyIdInToken and other 403s; a bad or disallowed topic.
  if (a.status === 403) return 'setup';
  if (a.status === 400 && (a.reason === 'BadTopic' || a.reason === 'TopicDisallowed' || a.reason === 'MissingTopic')) {
    return 'setup';
  }
  // TooManyRequests, TooManyProviderTokenUpdates, Apple's 5xx.
  if (a.status === 429 || a.status >= 500) return 'retry';
  // Anything else, and our own timeout or a dropped connection (status 0): Apple
  // may already have delivered, and a lost morning beats a doubled one.
  return 'keep';
}
