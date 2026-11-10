// Breaking news (#487): when many outlets cover one story at once, the phones that
// turned it on get one alert with a news article's headline. At most one a day per
// phone, never between 10 PM and 7 AM on the phone's clock, once per story. Runs
// each minute next to the feed refresh and the morning edition.
// Design: docs/435-notifications-design.md section 6.5.

import type { Feed, FeedStory } from '../types.ts';
import { classify, sendAlert, type ApnsConfig } from './apns.ts';
import { localMinutes, RESEND_GAP_MS, type Device } from './devices.ts';
import { applyRemovals, BUDGET_MS, currentLogin, type Removal } from './morning.ts';

export interface BreakingRule {
  /** Outlets covering the story. The feed keeps stories of 3 outlets or more (STORY_MIN_OUTLETS). */
  minOutlets: number;
  /** The headline article's importance label, 1 to 5. */
  minImportance: number;
}

/** Nikhil, Nov 9, 2026: 5 outlets (last week's market sell-off reached 5), importance 4 or 5. */
export const DEFAULT_RULE: BreakingRule = { minOutlets: 5, minImportance: 4 };
/** A story whose first article is older than this is not breaking any more. */
export const STORY_WINDOW_MS = 6 * 60 * 60e3;
/** Alerts go out from 7:00 to 22:00 on the phone's clock; overnight stories are left to the morning edition. */
export const DAY_START_MIN = 7 * 60;
export const DAY_END_MIN = 22 * 60;
/** Stories are remembered this long, so one never alerts twice. */
const REMEMBER_MS = 3 * 24 * 60 * 60e3;
/** Publish times further ahead than this are wrong, and ignored. */
const CLOCK_SKEW_MS = 10 * 60e3;
const MAX_TEXT = 300;
/** Apple's limit is 4 KB; stay well under it. */
const MAX_PAYLOAD_BYTES = 3500;

type Member = FeedStory['members'][number];

export interface Story {
  /** The story's stable key (its oldest article) and every member's address. */
  key: string;
  urls: string[];
  outlets: number;
  /** The earliest believable publish time among the story's articles. */
  firstAt: number | null;
  /** The news article whose headline the alert uses: highest importance, then newest. */
  pick: Member | null;
  /** How many of the story's articles have labels yet. */
  labeled: number;
  members: number;
}

/** Stories in the stored feed that reach the outlet bar, biggest first. */
export function findStories(feed: Feed, rule: BreakingRule, now: number): Story[] {
  const out: Story[] = [];
  for (const s of feed.stories ?? []) {
    const outlets = new Set(s.members.map((m) => m.source_name)).size;
    if (outlets < rule.minOutlets) continue;
    const times = s.members.flatMap((m) => {
      const t = m.published_at ? Date.parse(m.published_at) : NaN;
      return Number.isFinite(t) && t <= now + CLOCK_SKEW_MS ? [t] : [];
    });
    const news = s.members
      .filter((m) => m.k === 'news' && (m.imp ?? 0) >= rule.minImportance)
      .sort((x, y) => (y.imp ?? 0) - (x.imp ?? 0) || (y.published_at ?? '').localeCompare(x.published_at ?? ''));
    out.push({
      key: s.key,
      urls: s.members.map((m) => m.url),
      outlets,
      firstAt: times.length ? Math.min(...times) : null,
      pick: news[0] ?? null,
      labeled: s.members.filter((m) => m.k !== undefined).length,
      members: s.members.length,
    });
  }
  // Two stories in one minute: the bigger one gets the day's alert.
  return out.sort((a, b) => b.outlets - a.outlets || (b.pick?.imp ?? 0) - (a.pick?.imp ?? 0));
}

export interface BreakingPayload {
  aps: { alert: { title: string; body: string }; sound: 'default' };
  /** The story, opened in the reader when tapped; left out if the whole would pass 3,500 bytes (a tap then opens Today). */
  url?: string;
  title?: string;
  source?: string;
}

const cut = (s: string) => s.slice(0, MAX_TEXT).replace(/[\uD800-\uDBFF]$/, '').toWellFormed();

export function breakingPayload(outlets: number, pick: Member): BreakingPayload {
  const aps = { alert: { title: `Breaking: covered by ${outlets} outlets`, body: cut(`${pick.source_name}: ${pick.title}`) }, sound: 'default' as const };
  const full: BreakingPayload = { aps, url: pick.url, title: cut(pick.title), source: cut(pick.source_name) };
  return new TextEncoder().encode(JSON.stringify(full)).length <= MAX_PAYLOAD_BYTES ? full : { aps };
}

export interface StoryLog {
  decision: 'send' | 'skip';
  why?: string;
  outlets: number;
  source?: string;
  title?: string;
  url?: string;
  importance?: number;
  /** Minutes since the story's first article. */
  age_min: number | null;
  devices?: { due: number; sent: number; removed: number; failures: { token: string; status: number; reason: string | null }[]; stopped?: string };
}

/** A phone that has breaking news on, is in its daytime, and had no alert in 20 hours. */
export function breakingDue(d: Pick<Device, 'tz' | 'breaking' | 'breaking_at'>, now: number): boolean {
  const local = localMinutes(d.tz, now);
  return d.breaking === 1 && local >= DAY_START_MIN && local < DAY_END_MIN && (d.breaking_at === null || now - d.breaking_at >= RESEND_GAP_MS);
}

/**
 * One minute of breaking news. Returns a line per story decided this minute: sent, or
 * skipped with the reason. Stories still waiting for labels are left for a later minute.
 * Every story over the bar is decided and logged even when no phone has it on.
 */
export async function runBreaking(
  sql: SqlStorage,
  cfg: ApnsConfig | null,
  feed: Feed | null,
  rule: BreakingRule,
  now = Date.now(),
  budgetMs = BUDGET_MS,
): Promise<StoryLog[]> {
  if (!feed) return [];
  sql.exec('DELETE FROM breaking_stories WHERE at < ?', now - REMEMBER_MS);
  // A story is known by its key or any article seen in it before: follow-ups that
  // replace every article in the story keep its key, so it still doesn't alert twice.
  const known = (st: Story) =>
    [st.key, ...st.urls].some((u) => sql.exec('SELECT 1 FROM breaking_stories WHERE url = ?', u).toArray().length > 0);
  const remember = (st: Story) => {
    for (const u of [st.key, ...st.urls]) sql.exec('INSERT OR REPLACE INTO breaking_stories (url, at) VALUES (?, ?)', u, now);
  };

  const logs: StoryLog[] = [];
  const deadline = Date.now() + budgetMs;
  for (const story of findStories(feed, rule, now)) {
    if (known(story)) continue;
    const age = story.firstAt === null ? null : Math.max(0, now - story.firstAt);
    const base = { outlets: story.outlets, age_min: age === null ? null : Math.round(age / 60e3) };
    if (age === null || age > STORY_WINDOW_MS) {
      // Already over the bar when first seen, and old: remembered quietly, not logged.
      remember(story);
      continue;
    }
    if (!story.pick) {
      // Labels come a minute or two after an article: wait for them before ruling it out.
      if (story.labeled < story.members) continue;
      remember(story);
      logs.push({ ...base, decision: 'skip', why: `no news article with importance ${rule.minImportance} or more` });
      continue;
    }
    remember(story);
    const pick = story.pick;
    const log: StoryLog = { ...base, decision: 'send', source: pick.source_name, title: pick.title, url: pick.url, importance: pick.imp };
    logs.push(log);
    log.devices = await deliver(sql, cfg, breakingPayload(story.outlets, pick), now, deadline);
  }
  return logs;
}

/** Sends one story to every phone that is due; each phone claimed before its send. */
async function deliver(sql: SqlStorage, cfg: ApnsConfig | null, payload: BreakingPayload, now: number, deadline: number) {
  const due = (sql.exec('SELECT * FROM devices WHERE breaking = 1').toArray() as unknown as Device[]).filter((d) => breakingDue(d, now));
  const out: NonNullable<StoryLog['devices']> = { due: due.length, sent: 0, removed: 0, failures: [] };
  if (!due.length) return out;
  if (!cfg) return { ...out, stopped: 'apns not configured' };
  let login = await currentLogin(sql, cfg, now, false);
  const removals: Removal[] = [];
  let attempted = 0;
  for (const d of due) {
    if (Date.now() >= deadline) {
      out.stopped = 'time budget';
      break;
    }
    // Claimed only if the row is as it was read: an overlapping run, or a reader who
    // turned it off meanwhile, makes this a no-op.
    const claimed = sql.exec(
      'UPDATE devices SET breaking_at = ? WHERE token = ? AND breaking = 1 AND breaking_at IS ?',
      now,
      d.token,
      d.breaking_at,
    ).rowsWritten;
    if (!claimed) continue;
    attempted++;
    let answer = await sendAlert(d.token, payload, login, cfg.topic, now, 'breaking');
    if (classify(answer) === 'relogin') {
      try {
        login = await currentLogin(sql, cfg, now, true);
        answer = await sendAlert(d.token, payload, login, cfg.topic, now, 'breaking');
      } catch (e) {
        answer = { status: 403, reason: `login failed: ${String(e).slice(0, 80)}` };
      }
    }
    const action = classify(answer);
    if (action === 'delivered') {
      sql.exec('UPDATE devices SET delivered_at = ? WHERE token = ?', now, d.token);
      out.sent++;
      continue;
    }
    out.failures.push({ token: d.token.slice(0, 8), status: answer.status, reason: answer.reason });
    if (action === 'remove') {
      removals.push({ d, status: answer.status, reason: `${answer.status} ${answer.reason}` });
    } else if (action === 'keep') {
      // Counts as sent. A connection failing at once would fail every phone alike: stop.
      if (answer.status === 0) {
        out.stopped = `connection: ${answer.reason}`;
        break;
      }
    } else {
      // Not the phone's fault: its daily alert isn't used up. No retry: the story was this minute's.
      sql.exec('UPDATE devices SET breaking_at = ? WHERE token = ?', d.breaking_at, d.token);
      if (action !== 'retry') {
        out.stopped = `setup: ${answer.status} ${answer.reason}`;
        break;
      }
    }
  }
  const { removed, held } = applyRemovals(sql, removals, attempted);
  out.removed = removed;
  if (held) out.stopped = `most failed alike: ${held}; devices with earlier deliveries kept`;
  return out;
}
