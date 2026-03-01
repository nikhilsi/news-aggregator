/* API client — thin fetch wrapper for the backend REST API. */

import {
  ArticleListResponse,
  Category,
  ReaderResponse,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `API error: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ── Articles ─────────────────────────────────────────────── */

export interface ArticleParams {
  category?: string;
  source?: string;
  search?: string;
  page?: number;
  per_page?: number;
  refresh?: boolean;
}

export async function fetchArticles(params: ArticleParams = {}): Promise<ArticleListResponse> {
  const searchParams = new URLSearchParams();
  if (params.category && params.category !== 'all') {
    searchParams.set('category', params.category);
  }
  if (params.source) searchParams.set('source', params.source);
  if (params.search) searchParams.set('search', params.search);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.per_page) searchParams.set('per_page', String(params.per_page));
  if (params.refresh) searchParams.set('refresh', 'true');

  const qs = searchParams.toString();
  return request<ArticleListResponse>(`/articles${qs ? `?${qs}` : ''}`);
}

/* ── Reader View ──────────────────────────────────────────── */

export async function fetchReaderContent(url: string): Promise<ReaderResponse> {
  return request<ReaderResponse>(`/articles/reader?url=${encodeURIComponent(url)}`);
}

/* ── Categories ───────────────────────────────────────────── */

export async function fetchCategories(): Promise<Category[]> {
  return request<Category[]>('/categories');
}

