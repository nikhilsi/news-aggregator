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
  /** Cloudflare data center of the last attempt; some US sites block European visitors. */
  colo?: string | null;
  failures: number;
  etag: string | null;
  last_modified: string | null;
  /** Feed URL the validators came from; a changed URL in sources.ts drops them. */
  url?: string;
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

/** Another outlet's article about the same story (#414). */
export interface Coverage {
  source_name: string;
  title: string;
  url: string;
}

/**
 * What the API serves: the article plus two fields added on Nov 1, 2026 for the
 * web (#414). The iOS and Android apps ignore keys they do not know.
 */
export interface FeedArticle extends Article {
  topics: Topic[];
  coverage: Coverage[];
}

/** The merged lists the API serves: each article once, plus an index list per tab. */
export interface Feed {
  v: number;
  built_at: number;
  articles: FeedArticle[];
  lists: Record<string, number[]>;
  /** When the Today brief in lists.all was picked; null when Today shows the full list. */
  brief_at?: number | null;
}

export const KINDS = ['news', 'analysis', 'feature', 'howto', 'deals', 'betting', 'quiz', 'listicle', 'celebrity', 'opinion'] as const;
export type Kind = (typeof KINDS)[number];
export const TOPICS = ['ai', 'physical_ai', 'space', 'seattle', 'india', 'markets', 'us_politics', 'world', 'science', 'tech', 'health', 'sports', 'entertainment'] as const;
export type Topic = (typeof TOPICS)[number];

/** The model's labels for one article, and its embedding when it is recent. */
export interface AiItem {
  k: Kind;
  /** Main topic first. */
  t: Topic[];
  /** 1 to 5: how much a well-informed reader would want to know this today. */
  imp: number;
  /** bge-m3 embedding, 8-bit, base64 (src/ai/vectors.ts). */
  e?: string;
}

/** Bumped when labels must be redone; 2 (Nov 1, 2026): US politics no longer includes Indian politics. */
export const AI_VERSION = 2;

export interface AiStore {
  v: number;
  /** By article URL; pruned to the articles the cron still holds. */
  items: Record<string, AiItem>;
  /** The Today brief: when it was picked and the article URLs in order. */
  brief: { at: number; urls: string[] } | null;
}
