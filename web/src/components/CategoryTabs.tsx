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

  // Prepend "All" to the category list
  const tabs = [{ id: 'all', name: 'All', source_count: 0 }, ...categories];

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px dark:border-gray-700"
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
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-b-2 border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {cat.name}
          </button>
        );
      })}
    </nav>
  );
}
