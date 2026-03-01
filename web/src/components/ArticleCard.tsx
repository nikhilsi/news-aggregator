'use client';

/**
 * Single article card — displays thumbnail, title, summary, source, and relative time.
 * Clicking the card opens the reader modal overlay.
 */

import { memo } from 'react';
import { Article } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

interface ArticleCardProps {
  article: Article;
  onClick: (article: Article) => void;
}

function ArticleCard({ article, onClick }: ArticleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(article)}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Thumbnail — show placeholder gradient if no image */}
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
        {article.image_url && (
          <img
            src={article.image_url}
            alt={article.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              // Hide broken images — fall back to the gradient background
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title — 2 lines max */}
        <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
          {article.title}
        </h3>

        {/* Summary — 3 lines max */}
        <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {article.summary}
        </p>

        {/* Footer: source + time */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
          <span className="font-medium">{article.source_name}</span>
          {article.published_at && (
            <time dateTime={article.published_at}>{timeAgo(article.published_at)}</time>
          )}
        </div>
      </div>
    </button>
  );
}

export default memo(ArticleCard);
