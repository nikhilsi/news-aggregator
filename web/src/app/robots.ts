import type { MetadataRoute } from 'next';

// Built once into out/ by the static export.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://getclearnews.com/sitemap.xml',
  };
}
