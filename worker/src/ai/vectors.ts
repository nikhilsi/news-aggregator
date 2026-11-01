// Embeddings for grouping stories (#414): bge-m3 vectors, normalized, stored
// as 8-bit integers with one float scale (about 1.4 KB of base64 each).

/** The one call shape the cron needs from the Workers AI binding. */
export interface AiRunner {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export const EMBED_MODEL = '@cf/baai/bge-m3';
const EMBED_BATCH = 100;

export function normalize(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** A normalized vector as base64: a float32 scale, then one signed byte per value. */
export function pack(v: Float32Array): string {
  let max = 0;
  for (const x of v) max = Math.max(max, Math.abs(x));
  const scale = max / 127 || 1;
  const bytes = new Uint8Array(4 + v.length);
  new DataView(bytes.buffer).setFloat32(0, scale, true);
  for (let i = 0; i < v.length; i++) bytes[4 + i] = Math.round(v[i] / scale) & 0xff;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function unpack(b64: string): Float32Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const scale = new DataView(bytes.buffer).getFloat32(0, true);
  const ints = new Int8Array(bytes.buffer, 4);
  const v = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) v[i] = ints[i] * scale;
  return normalize(v);
}

/** Embeds texts in batches of 100; throws if Workers AI fails or answers oddly. */
export async function embed(ai: AiRunner, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = (await ai.run(EMBED_MODEL, { text: batch })) as { data?: number[][] };
    if (!Array.isArray(res?.data) || res.data.length !== batch.length) throw new Error('embedding: unexpected answer');
    for (const v of res.data) out.push(normalize(v));
  }
  return out;
}
