'use client';

/**
 * Home page — the main article feed.
 *
 * Layout: sticky header with search, horizontal category tabs, responsive article grid
 * with infinite scroll. Clicking an article opens a full-screen reader overlay (modal)
 * so the feed stays mounted and the back transition is instant.
 */

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import CategoryTabs from '@/components/CategoryTabs';
import ArticleGrid from '@/components/ArticleGrid';
import ReaderModal from '@/components/ReaderModal';
import { useArticles } from '@/hooks/useArticles';
import { Article } from '@/lib/types';

export default function HomePage() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const { articles, loading, error, hasMore, loadMore, refresh } = useArticles(category, search);

  // Memoize search handler to avoid re-creating on every render (SearchBar uses it in useEffect)
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
  }, []);

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article);
  }, []);

  const handleCloseReader = useCallback(() => {
    setSelectedArticle(null);
  }, []);

  return (
    <div className="min-h-screen">
      <Header onSearch={handleSearch} onRefresh={refresh} />

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
          onArticleClick={handleArticleClick}
          onRetry={refresh}
        />
      </main>

      {/* Reader overlay — renders on top when an article is selected */}
      {selectedArticle && (
        <ReaderModal article={selectedArticle} onClose={handleCloseReader} />
      )}
    </div>
  );
}
