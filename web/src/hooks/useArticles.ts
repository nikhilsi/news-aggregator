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
}

/**
 * Hook that fetches articles from the API with infinite scroll support.
 * Resets to page 1 when category or search changes.
 */
export function useArticles(category: string, search: string): UseArticlesReturn {
  const [articles, setArticles] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Track current request to avoid race conditions
  const requestId = useRef(0);

  // Reset when filters change
  useEffect(() => {
    setArticles([]);
    setPage(1);
    setHasMore(true);
    setError(null);
  }, [category, search]);

  // Fetch articles when page, category, or search changes
  useEffect(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);

    fetchArticles({ category, search: search || undefined, page, per_page: PER_PAGE })
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
  }, [category, search, page]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [loading, hasMore]);

  return { articles, loading, error, hasMore, loadMore };
}
