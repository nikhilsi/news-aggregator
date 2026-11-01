// Types the `env` that cloudflare:test hands to tests as the Worker's Env.
import type { Env as WorkerEnv } from '../src/store.ts';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

export {};
