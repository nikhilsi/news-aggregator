'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchArticles } from '@/lib/api';
import { Article } from '@/lib/types';

const PER_PAGE = 20;

// How long to wait before retrying when backend returns partial data (cold cache)
const PARTIAL_RETRY_DELAY = 3000;

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
 *
 * When the backend returns complete=false (cold cache, partial data),
 * automatically retries after a short delay to get the full article set.
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
  // Timer for auto-retry on partial data
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Clear any pending retry from a previous fetch
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

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

        // Auto-retry if backend returned partial data (cold cache only).
        // Skip on manual refresh — user already has full cached data,
        // and retrying mid-background-refresh causes a jarring content swap.
        if (data.complete === false && page === 1 && !isRefresh) {
          retryTimerRef.current = setTimeout(() => {
            if (currentRequest !== requestId.current) return;
            fetchArticles({
              category,
              search: search || undefined,
              page: 1,
              per_page: PER_PAGE,
            })
              .then((retryData) => {
                if (currentRequest !== requestId.current) return;
                setArticles(retryData.articles);
                setHasMore(1 < retryData.pagination.total_pages);
              })
              .catch(() => {}); // Silently fail — user already has partial data
          }, PARTIAL_RETRY_DELAY);
        }
      })
      .catch((err) => {
        if (currentRequest !== requestId.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (currentRequest !== requestId.current) return;
        setLoading(false);
      });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
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
