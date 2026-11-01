import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run in the Workers runtime with local KV and rate limiters, and the
// static site from ../web/out (build it first: see docs/deploy-runbook.md).
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, remoteBindings: false })],
  test: {
    testTimeout: 20000,
    // sanitize-html is CommonJS and requires postcss; pre-bundle it for the
    // Workers test runtime (wrangler's own bundler handles it for deploys).
    deps: { optimizer: { ssr: { enabled: true, include: ['sanitize-html'] } } },
  },
});
