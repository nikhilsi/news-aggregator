import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description:
    'About ClearNews: a clean, personal news reader. 41 sources, 13 categories, no clickbait. Built by Nikhil Singhal.',
  openGraph: {
    title: 'About ClearNews',
    description:
      'About ClearNews: a clean, personal news reader. 41 sources, 13 categories, no clickbait. Built by Nikhil Singhal.',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Minimal header — just the brand mark linking home */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <Link
            href="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            <span className="text-blue-600 dark:text-blue-400">Clear</span>News
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 text-gray-900 dark:text-gray-100">
        <h1 className="mb-6 text-3xl font-bold">About ClearNews</h1>

        <p className="mb-4 leading-relaxed">
          ClearNews is a personal news reader. 41 sources across 13 categories.
          RSS-driven, no algorithm, no clickbait, no tracking. Read what you
          want, in your own order.
        </p>

        <p className="mb-10 leading-relaxed">
          Articles come from your sources directly. The reader view extracts
          the content cleanly: no autoplay videos, no nag-screen popups, no
          &quot;subscribe to keep reading.&quot; If you want to read the
          original on the publisher&apos;s site, the link is right there.
        </p>

        <h2 className="mb-4 text-2xl font-bold">Built by Nikhil Singhal</h2>

        <p className="mb-4 leading-relaxed">
          Nikhil is a CTO and VP Engineering based in Seattle. He builds tools
          that make working with information cleaner.
        </p>

        <p className="mb-10 leading-relaxed">
          Other projects:{' '}
          <a
            href="https://resynclife.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ResyncLife
          </a>
          {' (personal command center), '}
          <a
            href="https://recurate.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Recurate
          </a>
          {' (annotation tools for AI), '}
          <a
            href="https://screentrades.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ScreenTrades
          </a>
          {' (AI trading analysis), '}
          <a
            href="https://tourgraph.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            TourGraph
          </a>
          {' (surprising tour discovery), '}
          <a
            href="https://gitavani.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            GitaVani
          </a>
          {' (Bhagavad Gita reader), and writing on AI governance at '}
          <a
            href="https://hipcharter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            HIP Charter
          </a>
          {' and '}
          <a
            href="https://aitrustcommons.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            AI Trust Commons
          </a>
          .
        </p>

        <a
          href="https://nikhilsinghal.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white no-underline hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Visit nikhilsinghal.com &rarr;
        </a>
      </main>
    </div>
  );
}
