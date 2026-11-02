// Reader photos, resized and served from getclearnews.com (#423). The reader
// rewrites each photo to /img?w=1200&u=<original>&s=<signature>. This route
// checks the signature (only photos the reader produced, so the site cannot be
// used as anyone's free image resizer), then has Cloudflare fetch, shrink and
// cache the original. Some publishers send originals 7,936 pixels wide. If
// resizing fails, the route redirects to the original photo.

const SITE = 'https://getclearnews.com';
const WIDTH = 1200;
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keys.set(secret, k);
  }
  return k;
}

async function sign(secret: string, src: string, width: number): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`${width}|${src}`)));
  let s = '';
  for (const b of mac.subarray(0, 16)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const resizable = (src: string) => {
  try {
    const u = new URL(src);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.hostname.endsWith('getclearnews.com');
  } catch {
    return false;
  }
};

/** The getclearnews.com address for a photo, or the photo as it was (no key, data: URLs, our own). */
export async function photoUrl(secret: string | undefined, src: string): Promise<string> {
  if (!secret || !resizable(src)) return src;
  return `${SITE}/img?w=${WIDTH}&u=${encodeURIComponent(src)}&s=${await sign(secret, src, WIDTH)}`;
}

/** Every <img src> in sanitized reader HTML, pointed at getclearnews.com. */
export async function rewritePhotos(html: string, secret: string | undefined): Promise<string> {
  if (!secret) return html;
  const re = /(<img\b[^>]*?\ssrc=")([^"]*)(")/g;
  const found = [...html.matchAll(re)];
  const urls = await Promise.all(found.map((m) => photoUrl(secret, m[2].replace(/&amp;/g, '&'))));
  let i = 0;
  return html.replace(re, (_, a: string, _src: string, b: string) => `${a}${urls[i++].replace(/&/g, '&amp;')}${b}`);
}

/** GET /img: a signed reader photo, resized and cached by Cloudflare; the original if that fails. */
export async function servePhoto(request: Request, secret: string | undefined): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const src = q.get('u') ?? '';
  const width = Number(q.get('w'));
  if (!secret || !resizable(src) || width !== WIDTH || q.get('s') !== (await sign(secret, src, width))) {
    return new Response('Not found', { status: 404 });
  }
  const accept = request.headers.get('accept') ?? '';
  const format = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : undefined;
  try {
    const res = await fetch(src, { cf: { image: { width, fit: 'scale-down', ...(format ? { format } : {}) } } });
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
      const out = new Response(res.body, res);
      out.headers.delete('set-cookie');
      out.headers.set('Cache-Control', 'public, max-age=604800');
      out.headers.set('Vary', 'Accept');
      return out;
    }
  } catch {
    // Falls through to the original.
  }
  return Response.redirect(src, 302);
}
