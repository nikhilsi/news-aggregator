// Shapes shared by the cron, the store and the API.

/** One article, in the exact field order the API has always served (schemas.py). */
export interface Article {
  title: string;
  summary: string | null;
  url: string;
  image_url: string | null;
  source_id: string;
  source_name: string;
  source_type: string;
  category: string;
  sentiment: null;
  published_at: string | null;
}

/** What the cron remembers about one source between runs. */
export interface SourceState {
  /** Last attempt, epoch ms. */
  checked_at: number;
  /** Last attempt that succeeded (2xx or 304). */
  ok_at: number | null;
  /** Last full 2xx fetch; conditional headers are sent only if this is under 24 h old. */
  full_at: number | null;
  /** "ok", "not_modified", "http_403", "timeout", "too_large", "parse_error", "error". */
  status: string;
  failures: number;
  etag: string | null;
  last_modified: string | null;
  articles: Article[];
  /** og:image lookups by article URL: the image, or "" when the page had none. */
  og: Record<string, string>;
}

export const STATE_VERSION = 1;
export const FEED_VERSION = 1;

export interface State {
  v: number;
  run_seq: number;
  written_at: number;
  sources: Record<string, SourceState>;
}

/** The merged lists the API serves: each article once, plus an index list per tab. */
export interface Feed {
  v: number;
  built_at: number;
  articles: Article[];
  lists: Record<string, number[]>;
}
