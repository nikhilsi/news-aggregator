/* API client — thin fetch wrapper for the backend REST API. */

import {
  ArticleListResponse,
  Category,
  LoginResponse,
  User,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

/* ── Articles ─────────────────────────────────────────────── */

export interface ArticleParams {
  category?: string;
  source?: string;
  search?: string;
  page?: number;
  per_page?: number;
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

  const qs = searchParams.toString();
  return request<ArticleListResponse>(`/articles${qs ? `?${qs}` : ''}`);
}

/* ── Categories ───────────────────────────────────────────── */

export async function fetchCategories(): Promise<Category[]> {
  return request<Category[]>('/categories');
}

/* ── Auth ─────────────────────────────────────────────────── */

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe(token: string): Promise<User> {
  return request<User>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
