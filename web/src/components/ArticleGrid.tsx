'use client';

/**
 * Responsive article grid with infinite scroll.
 *
 * Uses an Intersection Observer on a sentinel element at the bottom of the grid.
 * When the sentinel enters the viewport, loadMore() is called to fetch the next page.
 *
 * Layout: 1 column on mobile, 2 on tablet (md), 3 on desktop (lg).
 */

import { useEffect, useRef } from 'react';
import { Article } from '@/lib/types';
import ArticleCard from './ArticleCard';

interface ArticleGridProps {
  articles: Article[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

export default function ArticleGrid({
  articles,
  loading,
  error,
  hasMore,
  loadMore,
}: ArticleGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Set up Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When sentinel is visible and there are more pages, load next page
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' } // Trigger 200px before reaching the bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // Error state
  if (error && articles.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Failed to load articles. Please try again later.
        </p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{error}</p>
      </div>
    );
  }

  // Initial loading state
  if (loading && articles.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ArticleCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && articles.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">No articles found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article, index) => (
          <ArticleCard key={`${article.url}-${index}`} article={article} />
        ))}
      </div>

      {/* Sentinel element for infinite scroll + loading indicator */}
      <div ref={sentinelRef} className="py-8 text-center">
        {loading && (
          <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <LoadingSpinner />
            Loading more articles...
          </div>
        )}
        {!hasMore && articles.length > 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            You&apos;re all caught up.
          </p>
        )}
      </div>
    </>
  );
}

/** Loading spinner — small animated circle. */
function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/** Skeleton placeholder card for loading state. */
function ArticleCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="h-48 w-full bg-gray-200 dark:bg-gray-700" />
      <div className="p-4">
        <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-1 h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-3 h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}
