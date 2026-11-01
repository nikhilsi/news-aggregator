'use client';

/**
 * Single article card: thumbnail, title, summary, source and relative time.
 * Clicking the card opens the reader overlay. Below it, when they apply (#414
 * step 3): the "New" mark, the Fox News and NPR News marks on US politics
 * stories, and the other outlets that covered the story.
 */

import { memo } from 'react';
import { Article, ReaderTarget } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { BalanceMarks, CoverageList, isPolitics, NewMark } from './StoryBits';

interface ArticleCardProps {
  article: Article;
  isNew: boolean;
  onOpen: (target: ReaderTarget) => void;
}

function ArticleCard({ article, isNew, onOpen }: ArticleCardProps) {
  const politics = isPolitics(article);
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <button type="button" onClick={() => onOpen(article)} className="group flex flex-1 flex-col text-left">
        {/* Thumbnail: a gradient when there is no image or it fails */}
        <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
          {article.image_url && (
            // Remote publisher images in a static export: next/image cannot optimize them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>

        <div className="flex flex-1 flex-col px-4 pt-4">
          {/* Title: 2 lines max */}
          <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
            {article.title}
          </h3>

          {/* Summary: 3 lines max */}
          <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{article.summary}</p>
        </div>
      </button>

      <div className="px-4 pb-4">
        {/* Footer: source, new mark, time */}
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-500">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{article.source_name}</span>
            {isNew && <NewMark />}
          </span>
          {article.published_at && (
            <time dateTime={article.published_at} className="shrink-0">
              {timeAgo(article.published_at)}
            </time>
          )}
        </div>
        {politics && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <BalanceMarks article={article} />
          </div>
        )}
        {!!article.coverage?.length && (
          <div className="mt-2">
            <CoverageList article={article} onOpen={onOpen} />
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(ArticleCard);
