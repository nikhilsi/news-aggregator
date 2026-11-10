// The device list for the morning edition (#435) and breaking news (#487): one
// row per iPhone that has either turned on, in the Refresher Durable Object's own
// SQLite storage. Not a new
// Durable Object class: a class change blocks `wrangler rollback`.
// Design: docs/435-notifications-design.md section 6.1.

/** Most devices the list holds. A handful of readers today. */
export const MAX_DEVICES = 1000;
/**
 * A morning edition goes out at most this many minutes after the chosen time
 * (inclusive: on a spring-forward day, a 02:00 choice reads 03:00, 60 minutes past).
 */
export const WINDOW_MIN = 60;
/** One edition a day: a device sent less than this long ago is not due. */
export const RESEND_GAP_MS = 20 * 60 * 60e3;
/** Apple asks for 15 minutes before retrying a 5xx or a 429. */
export const RETRY_MS = 15 * 60e3;

export interface Device {
  token: string;
  tz: string;
  /** Minutes after local midnight (420 is 7:00), or null when the morning edition is off. */
  morning: number | null;
  /** 1 when breaking news is on (#487). */
  breaking: number;
  /** When the last breaking news alert went out. */
  breaking_at: number | null;
  sent_at: number | null;
  retry_at: number | null;
  delivered_at: number | null;
  created_at: number;
  updated_at: number;
}

const DEVICES_TABLE = (name: string) => `CREATE TABLE IF NOT EXISTS ${name} (
    token TEXT PRIMARY KEY,
    tz TEXT NOT NULL,
    morning INTEGER,
    breaking INTEGER NOT NULL DEFAULT 0,
    breaking_at INTEGER,
    sent_at INTEGER,
    retry_at INTEGER,
    delivered_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`;

export function createTables(storage: DurableObjectStorage): void {
  const sql = storage.sql;
  sql.exec(DEVICES_TABLE('devices'));
  // 3.7.0 made the table with morning NOT NULL and no breaking columns. SQLite
  // can't drop a NOT NULL, so that table is copied into the new shape once, in one
  // transaction: a failure leaves the old table as it was.
  try {
    sql.exec('SELECT breaking FROM devices LIMIT 0');
  } catch {
    storage.transactionSync(() => {
      sql.exec('DROP TABLE IF EXISTS devices_new');
      sql.exec(DEVICES_TABLE('devices_new'));
      sql.exec(`INSERT INTO devices_new (token, tz, morning, sent_at, retry_at, delivered_at, created_at, updated_at)
        SELECT token, tz, morning, sent_at, retry_at, delivered_at, created_at, updated_at FROM devices`);
      sql.exec('DROP TABLE devices');
      sql.exec('ALTER TABLE devices_new RENAME TO devices');
    });
  }
  // Each story that reached the breaking bar, by its articles' addresses, so it
  // alerts at most once (#487).
  sql.exec('CREATE TABLE IF NOT EXISTS breaking_stories (url TEXT PRIMARY KEY, at INTEGER NOT NULL)');
  // Apple's login token, kept across restarts of the object (Apple refuses a new
  // one more often than every 20 minutes on a connection).
  sql.exec(`CREATE TABLE IF NOT EXISTS apns_login (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    kid TEXT NOT NULL,
    jwt TEXT NOT NULL,
    iat INTEGER NOT NULL
  )`);
}

export interface SignUp {
  token: string;
  tz: string;
  /** Minutes after local midnight, or null to turn the morning edition off. */
  morning: number | null;
  /** Breaking news on or off (#487); off when left out, as build 5 of the app sends it. */
  breaking?: boolean;
}

export type SignUpResult = 'saved' | 'removed' | 'full';

/**
 * The app sends its whole state each time (section 6.2); the row is replaced.
 * A new device on a full list replaces the oldest row that never had a delivery.
 */
export function signUp(sql: SqlStorage, s: SignUp, now: number): SignUpResult {
  if (s.morning === null && !s.breaking) {
    sql.exec('DELETE FROM devices WHERE token = ?', s.token);
    return 'removed';
  }
  const breaking = s.breaking ? 1 : 0;
  const found = sql.exec('SELECT morning FROM devices WHERE token = ?', s.token).toArray()[0];
  if (found) {
    // A new time starts the day fresh, so moving 22:00 to 07:00 doesn't skip the next
    // morning. Not while the new time's hour is open: nudging 07:00 to 07:05 at 07:10,
    // after the edition came, must not send it again.
    const fresh =
      s.morning !== null && found.morning !== s.morning && minutesPast({ tz: s.tz, morning: s.morning }, now) > WINDOW_MIN;
    sql.exec(
      'UPDATE devices SET tz = ?, morning = ?, breaking = ?, updated_at = ? WHERE token = ?',
      s.tz,
      s.morning,
      breaking,
      now,
      s.token,
    );
    if (fresh) sql.exec('UPDATE devices SET sent_at = NULL, retry_at = NULL WHERE token = ?', s.token);
    return 'saved';
  }
  const count = Number(sql.exec('SELECT COUNT(*) AS n FROM devices').one().n);
  if (count >= MAX_DEVICES) {
    const oldest = sql.exec('SELECT token FROM devices WHERE delivered_at IS NULL ORDER BY created_at LIMIT 1').toArray();
    if (!oldest.length) return 'full';
    sql.exec('DELETE FROM devices WHERE token = ?', oldest[0].token);
  }
  sql.exec(
    'INSERT INTO devices (token, tz, morning, breaking, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    s.token,
    s.tz,
    s.morning,
    breaking,
    now,
    now,
  );
  return 'saved';
}

/**
 * The runtime's own spelling of a named time zone (older names such as
 * Asia/Calcutta included), or null. Offsets like +05:30 and odd entries like
 * Factory are refused, and case variants collapse to one name, so the clock
 * cache below stays small.
 */
export function canonicalTimeZone(tz: string): string | null {
  if (tz.length > 64 || !/^[A-Za-z]/.test(tz)) return null;
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
    return /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(name) && name !== 'Factory' ? name : null;
  } catch {
    return null;
  }
}

/** Formatters by time zone. Names are canonical, so this holds a few hundred at most. */
const clocks = new Map<string, Intl.DateTimeFormat>();
const MAX_CLOCKS = 600;

/** The local time in a time zone, in minutes after midnight (0 to 1439). */
export function localMinutes(tz: string, now: number): number {
  let clock = clocks.get(tz);
  if (!clock) {
    if (clocks.size >= MAX_CLOCKS) clocks.clear();
    clock = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    clocks.set(tz, clock);
  }
  const parts = clock.formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (part('hour') % 24) * 60 + part('minute');
}

/** How many minutes past its chosen time the device's clock is now (0 to 1439). */
export function minutesPast(d: { tz: string; morning: number }, now: number): number {
  return (localMinutes(d.tz, now) - d.morning + 1440) % 1440;
}

/**
 * Due: within the hour after the chosen time on the phone's own clock, no
 * edition in the last 20 hours, and any retry wait over. Daylight-saving
 * changes and a phone that moves time zones need nothing more.
 */
export function isDue(d: Pick<Device, 'tz' | 'morning' | 'sent_at' | 'retry_at'>, now: number): boolean {
  if (d.morning === null) return false;
  return (
    minutesPast({ tz: d.tz, morning: d.morning }, now) <= WINDOW_MIN &&
    (d.sent_at === null || now - d.sent_at >= RESEND_GAP_MS) &&
    (d.retry_at === null || d.retry_at <= now)
  );
}
