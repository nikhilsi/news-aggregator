// Workers AI only runs remotely, so no test calls it: by default every model
// call fails (the "AI is down" path); tests that need answers mock `run`.
import { env } from 'cloudflare:test';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(env.AI, 'run').mockRejectedValue(new Error('Workers AI is not available in tests'));
});
