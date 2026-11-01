#!/usr/bin/env node
// Switchover and rollback for getclearnews.com (spec section 10, review R8).
// Cloudflare refuses to turn a DNS-only A record into a Worker custom domain
// (code 100117), so attach deletes the A record and attaches the domain right
// after, recreating the record if the attach fails. Detach is the reverse.
// Mail records (MX, SPF, autodiscover, enrollment, verification) are never
// touched; `check` compares them with the saved export.
//
//   node scripts/cutover.mjs export                 save every record (JSON and BIND) to .fixtures/
//   node scripts/cutover.mjs attach  <host>...      A record -> Worker custom domain
//   node scripts/cutover.mjs detach  <host>...      Worker custom domain -> A record to the droplet
//   node scripts/cutover.mjs check   <export.json>  mail records unchanged since the export
//   node scripts/cutover.mjs rehearse               all of the above on cutover-test.getclearnews.com
//
// Uses the ClearNews token in ~/.secrets/cloudflare/clearnews.env.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ZONE = '4efba2ff624616e475de54620bd54595';
const ZONE_NAME = 'getclearnews.com';
const WORKER = 'clearnews';
const DROPLET = '64.227.96.170';
const TEST_HOST = `cutover-test.${ZONE_NAME}`;
const MAIL_TYPES = new Set(['MX', 'TXT', 'CNAME']);

const env = Object.fromEntries(
  readFileSync(join(homedir(), '.secrets/cloudflare/clearnews.env'), 'utf8')
    .split('\n')
    .map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { success: res.ok, text };
  }
  if (!json.success) throw new Error(`${method} ${path}: ${JSON.stringify(json.errors)}`);
  return json;
}

const records = async (name, type) =>
  (await cf('GET', `/zones/${ZONE}/dns_records?per_page=100${name ? `&name=${name}` : ''}${type ? `&type=${type}` : ''}`)).result;
const domains = async (host) =>
  (await cf('GET', `/accounts/${ACCOUNT}/workers/domains?hostname=${host}`)).result;

async function exportZone() {
  mkdirSync('.fixtures', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const all = await records();
  const bind = await cf('GET', `/zones/${ZONE}/dns_records/export`);
  writeFileSync(`.fixtures/zone-${stamp}.json`, JSON.stringify(all, null, 2));
  writeFileSync(`.fixtures/zone-${stamp}.bind`, bind.text ?? '');
  console.log(`saved .fixtures/zone-${stamp}.json (${all.length} records) and .bind`);
  return `.fixtures/zone-${stamp}.json`;
}

async function attach(host) {
  const [a] = await records(host, 'A');
  if (!a) throw new Error(`${host}: no A record to replace`);
  const t0 = performance.now();
  await cf('DELETE', `/zones/${ZONE}/dns_records/${a.id}`);
  try {
    await cf('PUT', `/accounts/${ACCOUNT}/workers/domains`, { hostname: host, service: WORKER, zone_id: ZONE });
    console.log(`${host}: attached to ${WORKER} in ${Math.round(performance.now() - t0)} ms`);
  } catch (e) {
    await cf('POST', `/zones/${ZONE}/dns_records`, { type: 'A', name: host, content: a.content, ttl: a.ttl, proxied: a.proxied });
    throw new Error(`${host}: attach failed, A record recreated: ${e.message}`);
  }
}

async function detach(host) {
  const list = await domains(host);
  const t0 = performance.now();
  for (const d of list) await cf('DELETE', `/accounts/${ACCOUNT}/workers/domains/${d.id}`);
  const left = (await records(host)).filter((r) => r.type === 'A' || r.type === 'AAAA');
  for (const r of left) await cf('DELETE', `/zones/${ZONE}/dns_records/${r.id}`);
  await cf('POST', `/zones/${ZONE}/dns_records`, { type: 'A', name: host, content: DROPLET, ttl: 300, proxied: false });
  console.log(`${host}: detached ${list.length} domain(s), removed ${left.length} leftover record(s), A to ${DROPLET} in ${Math.round(performance.now() - t0)} ms`);
}

async function checkMail(exportPath) {
  const before = JSON.parse(readFileSync(exportPath, 'utf8')).filter((r) => MAIL_TYPES.has(r.type));
  const after = (await records()).filter((r) => MAIL_TYPES.has(r.type));
  const key = (r) => `${r.type} ${r.name} ${r.content} ${r.proxied} ${r.ttl}`;
  const a = new Set(before.map(key));
  const b = new Set(after.map(key));
  const changed = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  console.log(changed.length ? `MAIL RECORDS CHANGED:\n${changed.join('\n')}` : `mail records unchanged (${before.length})`);
  return changed.length === 0;
}

async function rehearse() {
  const exp = await exportZone();
  if (!(await records(TEST_HOST)).length) {
    await cf('POST', `/zones/${ZONE}/dns_records`, { type: 'A', name: TEST_HOST, content: DROPLET, ttl: 300, proxied: false });
  }
  await attach(TEST_HOST);
  const recs = await records(TEST_HOST);
  console.log(`records on ${TEST_HOST} after attach: ${recs.map((r) => `${r.type} ${r.content} proxied=${r.proxied}`).join('; ')}`);
  let served = 'no answer';
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`https://${TEST_HOST}/api/v1/status`);
      if (r.ok && (await r.text()).includes('feed_built_at')) {
        served = 'Worker answered /api/v1/status';
        break;
      }
      served = `HTTP ${r.status}`;
    } catch (e) {
      served = e.cause?.code ?? e.message;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log(`${TEST_HOST}: ${served}`);
  await detach(TEST_HOST);
  const after = await records(TEST_HOST);
  console.log(`records on ${TEST_HOST} after detach: ${after.map((r) => `${r.type} ${r.content} proxied=${r.proxied}`).join('; ')}`);
  for (const r of after) await cf('DELETE', `/zones/${ZONE}/dns_records/${r.id}`);
  console.log(`${TEST_HOST}: removed`);
  await checkMail(exp);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'export') await exportZone();
else if (cmd === 'attach') for (const h of args) await attach(h);
else if (cmd === 'detach') for (const h of args) await detach(h);
else if (cmd === 'check') process.exit((await checkMail(args[0])) ? 0 : 1);
else if (cmd === 'rehearse') await rehearse();
else console.log('usage: cutover.mjs export | attach <host>... | detach <host>... | check <export.json> | rehearse');
