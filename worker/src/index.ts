// Worker entry (spec section 2). Every request runs here first
// (run_worker_first): www redirects, the API, then the static site with the
// security headers nginx used to add. The cron refreshes feeds every minute.

import api from './api.ts';
import { servePhoto } from './reader/photos.ts';
import { refresher } from './refresher.ts';
import type { Env } from './store.ts';

const APEX = 'getclearnews.com';

/** The repo's v2.0.0 header set (spec section 7, O30). */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function withHeaders(res: Response, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  // Errors are never cached by browsers or the apps (O6, R13).
  if (out.status >= 400) out.headers.set('Cache-Control', 'no-store');
  return out;
}

function assetCacheControl(path: string, res: Response): Record<string, string> {
  if (path.startsWith('/_next/static/')) return { 'Cache-Control': 'public, max-age=31536000, immutable' };
  if ((res.headers.get('content-type') ?? '').startsWith('text/html')) {
    return { 'Cache-Control': 'public, max-age=0, must-revalidate' };
  }
  return {};
}

export { Refresher } from './refresher.ts';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${APEX}`) {
      return withHeaders(Response.redirect(`https://${APEX}${url.pathname}${url.search}`, 301));
    }

    if (url.pathname === '/health' || url.pathname === '/health/' || url.pathname.startsWith('/api/')) {
      return withHeaders(await api.fetch(request, env, ctx));
    }

    // Reader photos, resized and served from this site (#423).
    if (url.pathname === '/img') return withHeaders(await servePhoto(request, env.PHOTO_KEY));

    // The site. If header code ever throws, the plain asset still goes out, so
    // /privacy and /support (opened from both apps) stay up (R13).
    const asset = await env.ASSETS.fetch(request);
    try {
      return withHeaders(asset, assetCacheControl(url.pathname, asset));
    } catch (e) {
      console.error(JSON.stringify({ msg: 'asset header error', path: url.pathname, error: String(e) }));
      return asset;
    }
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // The refresh runs in the Refresher, pinned to Western North America. The
    // morning edition (#435) is its own call next to it, so neither holds up the other.
    const r = refresher(env);
    const [refresh, morning] = await Promise.allSettled([r.refresh(), r.sendMorning()]);
    if (morning.status === 'rejected') {
      console.error(JSON.stringify({ msg: 'morning edition failed', error: String(morning.reason) }));
    }
    // A failed refresh still fails the cron run, as before.
    if (refresh.status === 'rejected') throw refresh.reason;
  },
} satisfies ExportedHandler<Env>;
