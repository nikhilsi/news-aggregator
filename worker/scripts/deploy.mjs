#!/usr/bin/env node
// Builds the static site, runs the Worker tests, checks the upload, deploys.
//   node scripts/deploy.mjs              (from worker/, or `npm run deploy`)
//   node scripts/deploy.mjs skip-tests
//
// Wrangler authenticates with the ClearNews token in
// ~/.secrets/cloudflare/clearnews.env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).
// The Mac's default wrangler login belongs to another account and is never used.
// After deploying, run scripts/verify.mjs.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const worker = new URL('..', import.meta.url).pathname;
const web = join(worker, '../web');
const skipTests = process.argv.includes('skip-tests');

function loadToken() {
  const file = join(homedir(), '.secrets/cloudflare/clearnews.env');
  if (!existsSync(file)) throw new Error(`missing ${file} (see docs/deploy-runbook.md)`);
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error(`${file} lacks the token or account id`);
  return env;
}

function run(cmd, cwd, env = {}) {
  console.log(`\n$ ${cmd}   (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/**
 * Refuses an upload that could leak a secret or call the wrong API. The
 * localhost and GA checks apply to the site only: library comments in the
 * Worker bundle mention localhost (Hono's docs).
 */
function scan(dir, label, site) {
  const bad = [
    [/apikey=|FMP_API_KEY|CLOUDFLARE_API_TOKEN/, 'an API key name'],
    ...(site
      ? [
          [/localhost:\d+/, 'a localhost URL (web/.env.local baked in?)'],
          [/googletagmanager/, 'the Google Analytics tag (removed, decision 1)'],
        ]
      : []),
  ];
  for (const f of files(dir)) {
    if (/(^|\/)\.env/.test(f.slice(dir.length))) throw new Error(`${label}: ${f} is an .env file`);
    if (!/\.(js|mjs|html|txt|json|xml|map)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const [re, what] of bad) if (re.test(text)) throw new Error(`${label}: ${f} contains ${what}`);
  }
  console.log(`scan ok: ${label}`);
}

const cf = loadToken();

// The site: NEXT_PUBLIC_API_URL from the shell wins over web/.env.local.
rmSync(join(web, 'out'), { recursive: true, force: true });
run('npx next build', web, { NEXT_PUBLIC_API_URL: '/api/v1', NEXT_TELEMETRY_DISABLED: '1' });
scan(join(web, 'out'), 'web/out', true);

if (!skipTests) run('npx vitest run', worker, { TZ: 'UTC' });
run('npx tsc --noEmit', worker);

// Check exactly what wrangler would upload, then upload it.
const dry = join(tmpdir(), `clearnews-dry-${Date.now()}`);
run(`npx wrangler deploy --dry-run --outdir ${dry}`, worker, cf);
scan(dry, 'worker bundle', false);
rmSync(dry, { recursive: true, force: true });

run('npx wrangler deploy', worker, cf);
console.log('\nDeployed. Next: node scripts/verify.mjs [https://getclearnews.com]');
