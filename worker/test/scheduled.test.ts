import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import { enabledSources } from '../src/pipeline/build.ts';
import { readFeed, readState } from '../src/store.ts';

afterEach(() => vi.restoreAllMocks());

describe('scheduled', () => {
  it('runs the refresh through the Refresher Durable Object', async () => {
    const urls = new Map(enabledSources().map((s) => [s.url, s.id]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/cdn-cgi/trace')) return new Response('colo=SEA\n');
      const id = urls.get(url) ?? 'x';
      return new Response(
        `<rss version="2.0"><channel><title>${id}</title><link>https://${id}.test</link><description>d</description><item><title>alpha${id.replace(/-/g, '')} bravo</title><link>https://${id}.test/1</link><description>s</description></item></channel></rss>`,
      );
    });
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ cron: '* * * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await readState(env.CACHE))!.run_seq).toBe(1);
    expect((await readFeed(env.CACHE))!.lists.all).toHaveLength(enabledSources().length);
  });
});
