'use client';

/**
 * The Today page (#414 step 3): the hourly brief as numbered rows, a finish
 * line, then the reader's topic sections. The server picks and orders the
 * stories; every headline and summary shown is the publisher's own.
 */

import { Article, Category, ReaderTarget } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { isNew } from '@/lib/visits';
import { BalanceMarks, CoverageList, NewMark, Thumb } from './StoryBits';
import TopicSections from './TopicSections';

/** The server rebuilds the brief hourly (worker/src/ai/brief.ts). */
const EDITION_MS = 60 * 60e3;
const WORDS_PER_MINUTE = 200;

interface TodayViewProps {
  articles: Article[];
  briefAt: string;
  /** When the list arrived, so times and the date read the same across the page. */
  now: number;
  categories: Category[];
  newSince: number | null;
  refreshToken: number;
  onOpen: (t: ReaderTarget) => void;
  onSelectCategory: (id: string) => void;
}

export default function TodayView({ articles, briefAt, now, categories, newSince, refreshToken, onOpen, onSelectCategory }: TodayViewProps) {
  const words = articles.reduce((n, a) => n + `${a.title} ${a.summary ?? ''}`.split(/\s+/).filter(Boolean).length, 0);
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  const fresh = articles.filter((a) => isNew(a.published_at, newSince)).length;
  const next = Date.parse(briefAt) + EDITION_MS;
  const date = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const nextAt = new Date(next).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const shown = new Set(articles.flatMap((a) => [a.url, ...(a.coverage ?? []).map((c) => c.url)]));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Today</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{date}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
            {articles.length} stories
          </span>
          <span className="rounded-full bg-gray-200/70 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            about {minutes} min read
          </span>
          <span className="rounded-full bg-gray-200/70 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            updated {timeAgo(briefAt)}
          </span>
          {fresh > 0 && (
            <span className="rounded-full bg-blue-600 px-2.5 py-1 font-semibold text-white dark:bg-blue-500">
              {fresh} new since your last visit
            </span>
          )}
        </div>
      </header>

      <ol className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {articles.map((a, i) => (
          <li key={a.url} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:gap-x-4">
            <span className="pt-0.5 text-base font-bold tabular-nums text-gray-400 dark:text-gray-500" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-snug">
                <button
                  type="button"
                  onClick={() => onOpen(a)}
                  className="text-left text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-400"
                >
                  {a.title}
                </button>
              </h2>
              {a.summary && (
                <p className="mt-1 hidden text-sm leading-relaxed text-gray-600 sm:line-clamp-2 dark:text-gray-400">{a.summary}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">{a.source_name}</span>
                {a.published_at && <time dateTime={a.published_at}>{timeAgo(a.published_at)}</time>}
                {isNew(a.published_at, newSince) && <NewMark />}
                <BalanceMarks article={a} />
              </div>
              {!!a.coverage?.length && (
                <div className="mt-1.5">
                  <CoverageList article={a} onOpen={onOpen} />
                </div>
              )}
            </div>
            {a.image_url ? (
              <button type="button" onClick={() => onOpen(a)} tabIndex={-1} aria-hidden="true" className="self-start">
                <Thumb src={a.image_url} className="h-16 w-16 sm:h-20 sm:w-28" />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>

      <div className="py-8 text-center">
        <p className="font-semibold text-green-700 dark:text-green-400">You&apos;re all caught up.</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {next > now ? `The next edition is due around ${nextAt}.` : 'The next edition is due shortly.'}
        </p>
      </div>

      <TopicSections
        categories={categories}
        exclude={shown}
        newSince={newSince}
        refreshToken={refreshToken}
        onOpen={onOpen}
        onSelectCategory={onSelectCategory}
      />
    </div>
  );
}
