'use client';

import { useEffect, useState } from 'react';
import { fetchCategories } from '@/lib/api';
import { Category } from '@/lib/types';

/** The tabs from the API: Today (id "all") first, then Latest, then each category. */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);
  return categories;
}
