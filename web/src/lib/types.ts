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

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    email: string;
    full_name: string | null;
    is_admin: boolean;
  };
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_admin: boolean;
}
