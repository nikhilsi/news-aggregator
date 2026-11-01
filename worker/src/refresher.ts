// Runs the feed refresh from Western North America.
//
// Cron runs execute in whatever data center Cloudflare picks (seen on Nov 1,
// 2026: DFW, IAD, HKG, MAD, MEL, NRT, OTP), and some publishers block or
// throttle by region: The Seattle Times answered 403 from HKG, OTP and NRT.
// Placement hints do not apply to cron runs, but a Durable Object created with
// a location hint stays in that region, and its fetches leave from there, as
// the droplet's did from San Francisco. The cron only calls this object.

import { DurableObject } from 'cloudflare:workers';
import { runCron, type RunSummary } from './cron.ts';
import type { Env } from './store.ts';

export class Refresher extends DurableObject<Env> {
  async refresh(): Promise<RunSummary> {
    return runCron(this.env);
  }
}

/** The single refresher, created (once) in Western North America. */
export function refresher(env: Env) {
  return env.REFRESHER.get(env.REFRESHER.idFromName('feeds'), { locationHint: 'wnam' });
}
