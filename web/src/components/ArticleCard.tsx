'use client';

/**
 * Single article card — displays thumbnail, title, summary, source, and relative time.
 * Clicking the card navigates to the in-app reader view.
 */

import Link from 'next/link';
import { Article } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

interface ArticleCardProps {
  article: Article;
}

function readerUrl(article: Article): string {
  const params = new URLSearchParams();
  params.set('url', article.url);
  if (article.title) params.set('title', article.title);
  if (article.source_name) params.set('source_name', article.source_name);
  if (article.image_url) params.set('image_url', article.image_url);
  if (article.published_at) params.set('published_at', article.published_at);
  return `/article?${params.toString()}`;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link
      href={readerUrl(article)}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Thumbnail — show placeholder gradient if no image */}
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
        {article.image_url && (
          <img
            src={article.image_url}
            alt=""
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
    </Link>
  );
}
