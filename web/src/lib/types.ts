/* Shared TypeScript types — mirrors the backend API response shapes. */

export interface Article {
  title: string;
  summary: string;
  url: string;
  image_url: string | null;
  source_id: string;
  source_name: string;
  source_type: string;
  category: string;
  sentiment: number | null;
  published_at: string;
  /** The model's topics, main topic first (#414); empty when unlabeled. */
  topics?: string[];
  /** The same story from other outlets, each with its own headline (#414). */
  coverage?: Coverage[];
}

export interface Coverage {
  source_name: string;
  title: string;
  url: string;
}

/** What the reader needs to open a story: a card's article or one outlet's coverage. */
export interface ReaderTarget {
  url: string;
  title: string;
  source_name: string;
  image_url?: string | null;
  published_at?: string;
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ArticleListResponse {
  articles: Article[];
  pagination: Pagination;
  complete?: boolean;
  /** First tab only: when the Today brief was built; null while Today shows the full list. */
  brief_at?: string | null;
}

export interface Category {
  id: string;
  name: string;
  source_count: number;
}

export interface Source {
  id: string;
  name: string;
  type: string;
  category: string;
  enabled: boolean;
}

export interface ReaderResponse {
  status: 'ok' | 'failed';
  url: string;
  title: string | null;
  author: string | null;
  content_html: string | null;
  word_count: number | null;
  image_url: string | null;
  source_name: string | null;
  published_at: string | null;
  extracted_at: string | null;
  reason: string | null;           // "forbidden" | "timeout" | "extraction_empty" | "error"
}

