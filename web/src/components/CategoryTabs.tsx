'use client';

/**
 * Horizontal category tabs.
 * Scrollable on mobile, wraps on desktop. Fetches the category list from the API on mount.
 */

import { useEffect, useState } from 'react';
import { fetchCategories } from '@/lib/api';
import { Category } from '@/lib/types';

interface CategoryTabsProps {
  selected: string;
  onSelect: (categoryId: string) => void;
}

export default function CategoryTabs({ selected, onSelect }: CategoryTabsProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // API already returns "All" as the first category — use the list directly
  const tabs = categories;

  return (
    <nav
      className="flex flex-wrap gap-1 pb-px"
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
