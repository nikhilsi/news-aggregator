'use client';

/**
 * Small pieces shared by Today's rows, the topic sections and the cards in
 * every tab (#414 step 3): the "New" mark, the Fox News and NPR News marks on
 * US politics stories, the list of other outlets, and a thumbnail.
 */

import { Article, ReaderTarget } from '@/lib/types';

/** On a story published since the reader's last visit. */
export function NewMark() {
  return (
    <span className="rounded bg-blue-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white dark:bg-blue-500">
      New
    </span>
  );
}

/** The two outlets General keeps for balance: right-leaning and left-leaning. */
const BALANCE = [
  { name: 'Fox News', short: 'Fox', dot: 'bg-red-600 dark:bg-red-400' },
  { name: 'NPR News', short: 'NPR', dot: 'bg-blue-700 dark:bg-blue-400' },
];

/**
 * A story mainly about US politics. Stories that only touch it (a market
 * update mentioning the midterms) carry no marks: "not yet" there is noise.
 */
export const isPolitics = (a: Article) => a.topics?.[0] === 'us_politics';

/** On US politics stories: whether Fox News and NPR News covered it. */
export function BalanceMarks({ article }: { article: Article }) {
  if (!isPolitics(article)) return null;
  const outlets = new Set([article.source_name, ...(article.coverage ?? []).map((c) => c.source_name)]);
  return (
    <span className="inline-flex items-center gap-3">
      {BALANCE.map((b) => {
        const covered = outlets.has(b.name);
        const label = covered ? `Covered by ${b.name}` : `Not covered by ${b.name} yet`;
        return (
          <span key={b.name} className="inline-flex items-center gap-1" title={label}>
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${covered ? b.dot : 'border border-gray-400 dark:border-gray-500'}`}
            />
            <span aria-hidden="true">{covered ? b.short : `${b.short}: not yet`}</span>
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
    </span>
  );
}

/** "Covered by N outlets": opens to each other outlet's own headline, each readable in the reader. */
export function CoverageList({ article, onOpen }: { article: Article; onOpen: (t: ReaderTarget) => void }) {
  const others = article.coverage ?? [];
  if (!others.length) return null;
  return (
    <details className="group/cov">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded text-xs [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 font-semibold text-blue-700 group-hover/cov:underline dark:text-blue-400">
          Covered by {others.length + 1} outlets
        </span>
        <svg
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-blue-700 transition-transform group-open/cov:rotate-180 dark:text-blue-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
        <span className="truncate text-gray-500 group-open/cov:hidden dark:text-gray-400">
          {others.map((c) => c.source_name).join(', ')}
        </span>
      </summary>
      <ul className="mt-2 space-y-2 rounded-lg bg-gray-100 p-3 dark:bg-gray-800/70">
        {others.map((c) => (
          <li key={c.url}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="text-left text-sm leading-snug text-gray-800 hover:text-blue-700 dark:text-gray-200 dark:hover:text-blue-400"
            >
              <span className="font-semibold">{c.source_name}</span>
              <span className="text-gray-400"> · </span>
              {c.title}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A small square photo; hides itself if the image fails. */
export function Thumb({ src, className = '' }: { src: string; className?: string }) {
  return (
    // Remote publisher images in a static export: next/image cannot optimize them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`rounded-lg bg-gray-100 object-cover dark:bg-gray-800 ${className}`}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
