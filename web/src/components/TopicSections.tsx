'use client';

/**
 * "Your topics" under Today (#414 step 3): a few stories from each tab the
 * reader picked, in their order, skipping what Today or an earlier section
 * already shows. The picks live in this browser (lib/topics.ts).
 */

import { useEffect, useState } from 'react';
import { fetchArticles } from '@/lib/api';
import { DEFAULT_TOPICS, saveTopics, useTopics } from '@/lib/topics';
import { Article, Category, ReaderTarget } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { isNew } from '@/lib/visits';
import { BalanceMarks, CoverageList, NewMark } from './StoryBits';

const PER_SECTION = 4;
/** Enough to fill a section after skipping what Today shows. */
const FETCH_SIZE = 15;

interface TopicSectionsProps {
  categories: Category[];
  /** URLs Today already shows, with their other outlets. */
  exclude: ReadonlySet<string>;
  newSince: number | null;
  refreshToken: number;
  onOpen: (t: ReaderTarget) => void;
  onSelectCategory: (id: string) => void;
}

type Lists = Record<string, Article[] | null>;

export default function TopicSections({ categories, exclude, newSince, refreshToken, onOpen, onSelectCategory }: TopicSectionsProps) {
  const topics = useTopics();
  const [editing, setEditing] = useState(false);
  const available = categories.filter((c) => c.id !== 'all' && c.id !== 'latest');
  const names = new Map(available.map((c) => [c.id, c.name]));
  // Tabs that no longer exist drop out of the saved list.
  const chosen = topics.filter((id) => names.has(id));
  const key = `${chosen.join(',')}|${refreshToken}`;
  const [loaded, setLoaded] = useState<{ key: string; lists: Lists } | null>(null);

  useEffect(() => {
    const [idList, token] = key.split('|');
    const ids = idList.split(',').filter(Boolean);
    // After the refresh button or a return visit, skip the browser's 5-minute cache.
    const refreshed = token !== '0';
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(
      ids.map((id) =>
        fetchArticles({ category: id, per_page: FETCH_SIZE, refresh: refreshed || undefined }).then(
          (r) => [id, r.articles] as const,
          () => [id, null] as const,
        ),
      ),
    ).then((entries) => {
      if (!cancelled) setLoaded({ key, lists: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Keep the last lists on screen while a refresh loads; a new topic shows a placeholder.
  const lists: Lists = loaded?.lists ?? {};
  const seen = new Set(exclude);
  const sections = chosen.map((id) => {
    const list = Object.hasOwn(lists, id) ? lists[id] : undefined;
    // A tab can show a different outlet's article for a story Today already has: skip it
    // when the article or any of its other outlets is already on the page.
    const rows = list
      ? list.filter((a) => !seen.has(a.url) && !(a.coverage ?? []).some((c) => seen.has(c.url))).slice(0, PER_SECTION)
      : list;
    for (const a of rows ?? []) {
      seen.add(a.url);
      for (const c of a.coverage ?? []) seen.add(c.url);
    }
    return { id, name: names.get(id)!, rows };
  });

  if (!available.length) return null;
  return (
    <section aria-labelledby="your-topics" className="mt-4">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="your-topics" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Your topics
        </h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          {editing ? 'Done' : 'Edit topics'}
        </button>
      </div>

      {editing && <TopicPicker available={available} chosen={chosen} />}

      {chosen.length === 0 && !editing && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No topics picked. Use Edit topics to add sections here.</p>
      )}

      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {sections.map((s) => (
          <div key={s.id} className="min-w-0">
            <h3 className="flex items-baseline justify-between border-b-2 border-gray-900 pb-1.5 dark:border-gray-200">
              <span className="text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100">{s.name}</span>
              <button
                type="button"
                onClick={() => onSelectCategory(s.id)}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                See all<span className="sr-only"> in {s.name}</span>
              </button>
            </h3>
            {s.rows === undefined ? (
              <SectionSkeleton />
            ) : s.rows === null ? (
              <p className="py-3 text-sm text-gray-500 dark:text-gray-400">Could not load {s.name}.</p>
            ) : s.rows.length === 0 ? (
              <p className="py-3 text-sm text-gray-500 dark:text-gray-400">Nothing beyond what Today shows.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                {s.rows.map((a) => (
                  <li key={a.url} className="py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(a)}
                      className="text-left text-[15px] font-medium leading-snug text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-400"
                    >
                      {a.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{a.source_name}</span>
                      {a.published_at && <time dateTime={a.published_at}>{timeAgo(a.published_at)}</time>}
                      {isNew(a.published_at, newSince) && <NewMark />}
                      <BalanceMarks article={a} />
                    </div>
                    {!!a.coverage?.length && (
                      <div className="mt-1.5">
                        <CoverageList article={a} onOpen={onOpen} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Pick which tabs show under Today, and their order. Saved as you change it. */
function TopicPicker({ available, chosen }: { available: Category[]; chosen: string[] }) {
  const names = new Map(available.map((c) => [c.id, c.name]));
  const others = available.filter((c) => !chosen.includes(c.id));
  const move = (i: number, by: number) => {
    const next = [...chosen];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    saveTopics(next);
  };
  const arrow = 'rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100';
  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Pick the sections shown under Today and their order. Saved in this browser only.
      </p>
      <ol className="divide-y divide-gray-100 dark:divide-gray-800">
        {chosen.map((id, i) => (
          <li key={id} className="flex items-center gap-3 py-1.5">
            <input
              id={`topic-${id}`}
              type="checkbox"
              checked
              onChange={() => saveTopics(chosen.filter((x) => x !== id))}
              className="h-4 w-4 accent-blue-600"
            />
            <label htmlFor={`topic-${id}`} className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
              {names.get(id)}
            </label>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${names.get(id)} up`} className={arrow}>
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.94l-3.71 3.83a.75.75 0 11-1.08-1.04l4.25-4.39a.75.75 0 011.08 0l4.25 4.39a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></svg>
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label={`Move ${names.get(id)} down`} className={arrow}>
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </button>
          </li>
        ))}
      </ol>
      {others.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
          {others.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <input
                id={`topic-${c.id}`}
                type="checkbox"
                checked={false}
                onChange={() => saveTopics([...chosen, c.id])}
                className="h-4 w-4 accent-blue-600"
              />
              <label htmlFor={`topic-${c.id}`} className="text-sm text-gray-600 dark:text-gray-300">
                {c.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => saveTopics(DEFAULT_TOPICS)}
        className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
      >
        Reset to the defaults
      </button>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-3">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="mb-1.5 h-3.5 w-11/12 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-2.5 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}
