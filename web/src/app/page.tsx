'use client';

/**
 * Home page — the main article feed.
 *
 * Layout: sticky header with search, horizontal category tabs, responsive article grid
 * with infinite scroll. This is the primary view of the app.
 */

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import CategoryTabs from '@/components/CategoryTabs';
import ArticleGrid from '@/components/ArticleGrid';
import { useArticles } from '@/hooks/useArticles';

export default function HomePage() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const { articles, loading, error, hasMore, loadMore } = useArticles(category, search);

  // Memoize search handler to avoid re-creating on every render (SearchBar uses it in useEffect)
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
  }, []);

  return (
    <div className="min-h-screen">
      <Header onSearch={handleSearch} />

      {/* Category tabs — sticky below the header */}
      <div className="sticky top-[53px] z-40 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4">
          <CategoryTabs selected={category} onSelect={setCategory} />
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Article grid with infinite scroll */}
        <ArticleGrid
          articles={articles}
          loading={loading}
          error={error}
          hasMore={hasMore}
          loadMore={loadMore}
        />
      </main>
    </div>
  );
}
