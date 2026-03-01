'use client';

/**
 * App header — logo/name, search bar, refresh button, and dark mode toggle.
 * Sticky at the top of the viewport.
 */

import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import Link from 'next/link';

interface HeaderProps {
  onSearch: (query: string) => void;
  onRefresh: () => void;
}

export default function Header({ onSearch, onRefresh }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Logo / App name */}
        <Link href="/" className="shrink-0 text-xl font-bold text-gray-900 dark:text-white">
          <span className="text-blue-600 dark:text-blue-400">Clear</span>News
        </Link>

        {/* Search bar — grows to fill available space */}
        <div className="flex-1 max-w-md">
          <SearchBar onSearch={onSearch} />
        </div>

        {/* Right side: refresh, theme toggle */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onRefresh}
            aria-label="Refresh articles"
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903H14.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 .75-.75v-6a.75.75 0 0 0-1.5 0v4.956l-1.903-1.903A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm14.49 3.882a7.5 7.5 0 0 1-12.548 3.364l-1.903-1.903H9.75a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-4.956l1.903 1.903A9 9 0 0 0 20.694 14.33a.75.75 0 1 0-1.45-.388Z" clipRule="evenodd" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
