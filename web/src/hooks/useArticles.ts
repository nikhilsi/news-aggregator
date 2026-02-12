'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchArticles } from '@/lib/api';
import { Article } from '@/lib/types';

const PER_PAGE = 20;

interface UseArticlesReturn {
  articles: Article[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * Hook that fetches articles from the API with infinite scroll support.
 * Resets to page 1 when category or search changes.
 * Exposes refresh() to force-fetch fresh data from all sources.
 */
export function useArticles(category: string, search: string): UseArticlesReturn {
  const [articles, setArticles] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(0);

  // Track current request to avoid race conditions
  const requestId = useRef(0);

  // Reset pagination when filters change (keep previous articles visible during load)
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setError(null);
  }, [category, search]);

  // Fetch articles when page, category, search, or refreshFlag changes
  useEffect(() => {
    const currentRequest = ++requestId.current;
    const isRefresh = refreshFlag > 0 && page === 1;
    setLoading(true);

    fetchArticles({
      category,
      search: search || undefined,
      page,
      per_page: PER_PAGE,
      refresh: isRefresh || undefined,
    })
      .then((data) => {
        // Discard stale responses
        if (currentRequest !== requestId.current) return;

        if (page === 1) {
          setArticles(data.articles);
        } else {
          setArticles((prev) => [...prev, ...data.articles]);
        }
        setHasMore(page < data.pagination.total_pages);
      })
      .catch((err) => {
        if (currentRequest !== requestId.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (currentRequest !== requestId.current) return;
        setLoading(false);
      });
  }, [category, search, page, refreshFlag]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [loading, hasMore]);

  const refresh = useCallback(() => {
    setPage(1);
    setError(null);
    setRefreshFlag((prev) => prev + 1);
  }, []);

  return { articles, loading, error, hasMore, loadMore, refresh };
}
