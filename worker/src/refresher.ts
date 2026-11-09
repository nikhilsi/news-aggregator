// Runs the feed refresh from Western North America.
//
// Cron runs execute in whatever data center Cloudflare picks (seen on Nov 1,
// 2026: DFW, IAD, HKG, MAD, MEL, NRT, OTP), and some publishers block or
// throttle by region: The Seattle Times answered 403 from HKG, OTP and NRT.
// Placement hints do not apply to cron runs, but a Durable Object created with
// a location hint stays in that region, and its fetches leave from there, as
// the droplet's did from San Francisco. The cron only calls this object.
//
// Since #435 it also keeps the morning edition's device list in its own SQLite
// storage and sends the editions (src/notify/).

import { DurableObject } from 'cloudflare:workers';
import { runCron, type RunSummary } from './cron.ts';
import type { ApnsConfig } from './notify/apns.ts';
import { createTables, signUp, type SignUp, type SignUpResult } from './notify/devices.ts';
import { runMorning, type MorningSummary } from './notify/morning.ts';
import { readFeed, type Env } from './store.ts';

/** The Apple settings, or null when the key isn't set (tests, local dev). */
export function apnsConfig(env: Env): ApnsConfig | null {
  return env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_TOPIC
    ? { key: env.APNS_KEY, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, topic: env.APNS_TOPIC }
    : null;
}

export class Refresher extends DurableObject<Env> {
  private tablesReady = false;

  async refresh(): Promise<RunSummary> {
    return runCron(this.env);
  }

  /** Made on first use by the notification calls, so nothing here can touch the feed refresh. */
  private sql(): SqlStorage {
    if (!this.tablesReady) {
      createTables(this.ctx.storage.sql);
      this.tablesReady = true;
    }
    return this.ctx.storage.sql;
  }

  /** The app's whole notification state; replaces the device's row (#435). */
  signUp(s: SignUp): SignUpResult {
    return signUp(this.sql(), s, Date.now());
  }

  /** One minute of morning editions (#435). Logs only when a device was due. */
  async sendMorning(): Promise<MorningSummary | null> {
    const summary = await runMorning(this.sql(), apnsConfig(this.env), () => readFeed(this.env.CACHE));
    if (summary) {
      const line = JSON.stringify({ msg: 'morning edition', ...summary });
      const bad =
        summary.stopped?.startsWith('setup') ||
        summary.skipped === 'apns not configured' ||
        (summary.sent === 0 && summary.failures.length > 0);
      if (bad) console.error(line);
      else console.log(line);
    }
    return summary;
  }
}

/** The single refresher, created (once) in Western North America. */
export function refresher(env: Env) {
  return env.REFRESHER.get(env.REFRESHER.idFromName('feeds'), { locationHint: 'wnam' });
}
