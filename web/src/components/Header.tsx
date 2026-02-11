'use client';

/**
 * App header — logo/name, search bar, dark mode toggle, and login/logout button.
 * Sticky at the top of the viewport.
 */

import { useAuth } from '@/context/AuthContext';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import Link from 'next/link';

interface HeaderProps {
  onSearch: (query: string) => void;
}

export default function Header({ onSearch }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth();

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

        {/* Right side: theme toggle + auth */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-gray-600 dark:text-gray-400 sm:inline">
                {user?.full_name || user?.email}
              </span>
              <button
                onClick={logout}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
