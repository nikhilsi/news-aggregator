'use client';

/**
 * Home page.
 *
 * Layout: sticky header with search, category tabs, then either the Today page
 * (the first tab while the server has a brief, #414 step 3) or the responsive
 * article grid with infinite scroll. Clicking a story opens a full-screen reader
 * overlay (modal) so the page stays mounted and the back transition is instant.
 */

import { useState, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import CategoryTabs from '@/components/CategoryTabs';
import ArticleGrid from '@/components/ArticleGrid';
import ReaderModal from '@/components/ReaderModal';
import TodayView from '@/components/TodayView';
import { useArticles } from '@/hooks/useArticles';
import { useCategories } from '@/hooks/useCategories';
import { ReaderTarget } from '@/lib/types';
import { onNewVisit, useVisitBase } from '@/lib/visits';

export default function HomePage() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReaderTarget | null>(null);
  // Bumped by the refresh button so the topic sections reload too.
  const [refreshToken, setRefreshToken] = useState(0);

  const categories = useCategories();
  const newSince = useVisitBase();
  const { articles, loading, error, hasMore, briefAt, loadedAt, loadMore, refresh } = useArticles(category, search);

  const refreshAll = useCallback(() => {
    refresh();
    setRefreshToken((t) => t + 1);
  }, [refresh]);

  // Back after 30 minutes away with the tab still open: load the current edition.
  useEffect(() => onNewVisit(refreshAll), [refreshAll]);

  // Memoize search handler to avoid re-creating on every render (SearchBar uses it in useEffect)
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
  }, []);

  const handleSelectCategory = useCallback((id: string) => {
    setCategory(id);
    window.scrollTo({ top: 0 });
  }, []);

  const handleOpen = useCallback((target: ReaderTarget) => {
    setSelected(target);
  }, []);

  const handleCloseReader = useCallback(() => {
    setSelected(null);
  }, []);

  const firstTab = category === 'all' && !search;
  const showToday = firstTab && briefAt !== null && articles.length > 0;

  return (
    <div className="min-h-screen">
      {/* Header and tabs pinned together, so the tabs never slide under a taller header on phones */}
      <div className="sticky top-0 z-50">
        <Header onSearch={handleSearch} onRefresh={refreshAll} />
        <div className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950">
          <div className="mx-auto max-w-7xl px-4">
            <CategoryTabs categories={categories} selected={category} onSelect={handleSelectCategory} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {showToday ? (
          <TodayView
            articles={articles}
            briefAt={briefAt}
            now={loadedAt}
            categories={categories}
            newSince={newSince}
            refreshToken={refreshToken}
            onOpen={handleOpen}
            onSelectCategory={handleSelectCategory}
          />
        ) : (
          <>
            {firstTab && !loading && !error && articles.length > 0 && (
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Today&apos;s edition is being prepared. Here are the latest stories.
              </p>
            )}
            <ArticleGrid
              articles={articles}
              loading={loading}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
              newSince={newSince}
              onArticleClick={handleOpen}
              onRetry={refreshAll}
            />
          </>
        )}
      </main>

      {/* Reader overlay: renders on top when a story is selected */}
      {selected && <ReaderModal article={selected} onClose={handleCloseReader} />}
    </div>
  );
}
