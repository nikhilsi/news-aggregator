// The morning edition (#435): each minute, the devices whose chosen time has
// come get Today's count and top story. Runs as its own call next to the feed
// refresh, so neither holds up the other. Design: docs/435-notifications-design.md 6.1.

import { BRIEF_MAX_AGE_MS } from '../ai/brief.ts';
import type { Feed } from '../types.ts';
import { classify, LOGIN_MAX_AGE_MS, LOGIN_MIN_AGE_MS, sendAlert, signLogin, type ApnsConfig, type Login } from './apns.ts';
import { isDue, minutesPast, RETRY_MS, WINDOW_MIN, type Device } from './devices.ts';

/** The sender stops starting new sends after this long; the rest stay due for the next minute. */
export const BUDGET_MS = 10_000;
/**
 * A 400 answer that removes devices (BadDeviceToken, DeviceTokenNotForTopic), given
 * for most of a minute's sends and to at least this many devices that had a delivery
 * before, is likely ours (a wrong topic, say): those devices are kept. A 410 is
 * Apple's word about one phone and always deletes.
 */
const GUARD_MIN = 2;
/** Apple's limit is 4 KB; stay well under it. */
const MAX_PAYLOAD_BYTES = 3500;
const MAX_TEXT = 300;

export interface MorningPayload {
  aps: { alert: { title: string; body: string }; sound: 'default' };
  /** The top story, opened in the reader when the notification is tapped. */
  url?: string;
  title?: string;
  source?: string;
}

/** Cut to 300 without leaving half an emoji (a lone surrogate) at the end. */
const cut = (s: string) => s.slice(0, MAX_TEXT).replace(/[\uD800-\uDBFF]$/, '').toWellFormed();

/** Today's count and top story, in the publisher's words. Null without a brief. */
export function morningPayload(feed: Feed): MorningPayload | null {
  const today = feed.brief_at ? (feed.lists.all ?? []) : [];
  const top = today.length ? feed.articles[today[0]] : undefined;
  if (!top) return null;
  const aps = { alert: { title: `Today: ${today.length} stories`, body: cut(`${top.source_name}: ${top.title}`) }, sound: 'default' as const };
  const full: MorningPayload = { aps, url: top.url, title: cut(top.title), source: cut(top.source_name) };
  // An address too long for Apple's limit: the notification still goes, and a tap opens Today.
  return new TextEncoder().encode(JSON.stringify(full)).length <= MAX_PAYLOAD_BYTES ? full : { aps };
}

export interface MorningSummary {
  due: number;
  sent: number;
  removed: number;
  retry: number;
  /** Why nothing was sent this minute. */
  skipped?: string;
  /** Why sending stopped early. */
  stopped?: string;
  failures: { token: string; status: number; reason: string | null }[];
}

async function currentLogin(sql: SqlStorage, cfg: ApnsConfig, now: number, renew: boolean): Promise<Login> {
  const kept = sql.exec('SELECT kid, jwt, iat FROM apns_login WHERE id = 1').toArray()[0] as unknown as Login | undefined;
  if (kept && kept.kid === cfg.keyId) {
    const age = now - kept.iat;
    if (!renew && age < LOGIN_MAX_AGE_MS) return kept;
    if (renew && age < LOGIN_MIN_AGE_MS) return kept;
  }
  const login = await signLogin(cfg, now);
  sql.exec('INSERT OR REPLACE INTO apns_login (id, kid, jwt, iat) VALUES (1, ?, ?, ?)', login.kid, login.jwt, login.iat);
  return login;
}

/** Returns null when no device was due (nothing to log). */
export async function runMorning(
  sql: SqlStorage,
  cfg: ApnsConfig | null,
  readFeed: () => Promise<Feed | null>,
  now = Date.now(),
  budgetMs = BUDGET_MS,
): Promise<MorningSummary | null> {
  const due = (sql.exec('SELECT * FROM devices').toArray() as unknown as Device[]).filter((d) => isDue(d, now));
  if (!due.length) return null;
  const summary: MorningSummary = { due: due.length, sent: 0, removed: 0, retry: 0, failures: [] };
  if (!cfg) return { ...summary, skipped: 'apns not configured' };

  // The same rule as the Today tab: a brief under 6 hours old.
  const feed = await readFeed();
  const payload = feed?.brief_at && now - feed.brief_at <= BRIEF_MAX_AGE_MS ? morningPayload(feed) : null;
  if (!payload) return { ...summary, skipped: 'no fresh brief' };

  // Signed before any device is touched: a bad key fails the minute with nothing marked.
  let login = await currentLogin(sql, cfg, now, false);
  const deadline = Date.now() + budgetMs;
  const removals: { d: Device; status: number; reason: string }[] = [];
  let attempted = 0;

  for (const d of due) {
    if (Date.now() >= deadline) {
      summary.stopped = 'time budget';
      break;
    }
    // Claimed before sending, only if the row is as it was read: another run that
    // overlaps this one, or a reader who turned it off meanwhile, makes this a no-op.
    // A crash or deploy mid-send then loses a morning, never doubles it.
    const claimed = sql.exec(
      'UPDATE devices SET sent_at = ?, retry_at = NULL WHERE token = ? AND sent_at IS ? AND retry_at IS ? AND morning = ?',
      now,
      d.token,
      d.sent_at,
      d.retry_at,
      d.morning,
    ).rowsWritten;
    if (!claimed) continue;
    attempted++;

    let answer = await sendAlert(d.token, payload, login, cfg.topic, now);
    if (classify(answer) === 'relogin') {
      try {
        login = await currentLogin(sql, cfg, now, true);
        answer = await sendAlert(d.token, payload, login, cfg.topic, now);
      } catch (e) {
        answer = { status: 403, reason: `login failed: ${String(e).slice(0, 80)}` };
      }
    }
    const action = classify(answer);
    if (action === 'delivered') {
      sql.exec('UPDATE devices SET delivered_at = ? WHERE token = ?', now, d.token);
      summary.sent++;
      continue;
    }
    summary.failures.push({ token: d.token.slice(0, 8), status: answer.status, reason: answer.reason });
    if (action === 'remove') {
      removals.push({ d, status: answer.status, reason: `${answer.status} ${answer.reason}` });
    } else if (action === 'keep') {
      // Counts as sent. A connection that fails at once would fail every device the
      // same way: stop, so the rest go out next minute.
      if (answer.status === 0) {
        summary.stopped = `connection: ${answer.reason}`;
        break;
      }
    } else {
      // 'retry', 'setup' or a second 'relogin': not the device's fault. Put it back for
      // another try in 15 minutes (Apple's guidance), while still inside its hour.
      if (minutesPast(d, now) + RETRY_MS / 60e3 <= WINDOW_MIN) {
        sql.exec('UPDATE devices SET sent_at = ?, retry_at = ? WHERE token = ?', d.sent_at, now + RETRY_MS, d.token);
        summary.retry++;
      }
      if (action !== 'retry') {
        summary.stopped = `setup: ${answer.status} ${answer.reason}`;
        break;
      }
    }
    // 'keep': logged, the device stays, this morning counts as sent.
  }

  // The guard (GUARD_MIN): a 400 reason given for most of the minute's sends holds the
  // devices that had a delivery before. Everything else that Apple called gone is deleted.
  let held: string | null = null;
  // 410s are left out of the share: an uninstall in the same minute says nothing about our setup.
  const judged = attempted - removals.filter((r) => r.status === 410).length;
  for (const reason of new Set(removals.filter((r) => r.status === 400).map((r) => r.reason))) {
    const all = removals.filter((r) => r.reason === reason);
    const known = all.filter((r) => r.d.delivered_at !== null).length;
    if (known >= GUARD_MIN && all.length / judged > 0.8) held = reason;
  }
  const keep = (r: (typeof removals)[number]) => r.reason === held && r.d.delivered_at !== null;
  if (held) summary.stopped = `most failed alike: ${held}; devices with earlier deliveries kept`;
  for (const r of removals) if (!keep(r)) sql.exec('DELETE FROM devices WHERE token = ?', r.d.token);
  summary.removed = removals.filter((r) => !keep(r)).length;
  return summary;
}
