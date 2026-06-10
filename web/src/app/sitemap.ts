import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://getclearnews.com';
  return [
    {
      url: base,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${base}/about`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
  // Note: /article is intentionally excluded from the sitemap because it's
  // noindex (the reader view shows extracted content from other publishers).
}
