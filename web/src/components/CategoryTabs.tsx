'use client';

/**
 * Horizontal category tabs: one scrolling row on phones (17 tabs wrapped to four
 * pinned rows there), wrapped rows from the sm width up.
 * The API returns Today (id "all") first, then Latest; the tabs follow its order.
 */

import { useEffect, useRef } from 'react';
import { Category } from '@/lib/types';

interface CategoryTabsProps {
  categories: Category[];
  selected: string;
  onSelect: (categoryId: string) => void;
}

export default function CategoryTabs({ categories, selected, onSelect }: CategoryTabsProps) {
  const tabs = categories;
  const navRef = useRef<HTMLElement>(null);

  // A tab picked from elsewhere (a topic's "See all") scrolls into view on phones.
  useEffect(() => {
    navRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected, categories]);

  return (
    <nav
      ref={navRef}
      className="scrollbar-hide flex gap-1 overflow-x-auto py-1.5 sm:flex-wrap sm:overflow-visible sm:py-0 sm:pb-px"
      role="tablist"
      aria-label="Article categories"
    >
      {tabs.map((cat) => {
        const isActive = cat.id === selected;
        return (
          <button
            key={cat.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(cat.id)}
            className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
              isActive
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {cat.name}
          </button>
        );
      })}
    </nav>
  );
}
