import type { Metadata } from 'next';

/**
 * /article route layout — sets noindex on the reader view.
 *
 * The reader page shows extracted content from other publishers. Indexing it
 * would create duplicate-content competition with the original sources.
 * Crawlers see noindex; users can still navigate to /article URLs normally.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function ArticleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
