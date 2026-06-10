import type { Metadata } from 'next';
import Script from 'next/script';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SOCIAL_CARD = 'https://getclearnews.com/social-card.png';
const SITE_DESCRIPTION =
  'ClearNews: a clean, ad-free personal news reader. 41 sources across 13 categories. No clickbait, no tracking, no algorithm. Built by Nikhil Singhal.';

export const metadata: Metadata = {
  title: {
    default: 'ClearNews: a clean, personal news reader',
    template: '%s | ClearNews',
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL('https://getclearnews.com'),
  alternates: {
    canonical: 'https://getclearnews.com',
  },
  authors: [{ name: 'Nikhil Singhal', url: 'https://nikhilsinghal.com' }],
  keywords: [
    'news reader',
    'clean news',
    'no clickbait',
    'RSS aggregator',
    'ClearNews',
    'personal news',
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    siteName: 'ClearNews',
    title: 'ClearNews: a clean, personal news reader',
    description: SITE_DESCRIPTION,
    url: 'https://getclearnews.com',
    images: [
      {
        url: SOCIAL_CARD,
        width: 1200,
        height: 630,
        alt: 'ClearNews: a clean, personal news reader',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClearNews: a clean, personal news reader',
    description: SITE_DESCRIPTION,
    site: '@nikhilsinghal',
    creator: '@nikhilsinghal',
    images: [SOCIAL_CARD],
  },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://getclearnews.com/#software',
      name: 'ClearNews',
      applicationCategory: 'NewsApplication',
      operatingSystem: 'Web, iOS, Android',
      url: 'https://getclearnews.com',
      image: SOCIAL_CARD,
      description: SITE_DESCRIPTION,
      creator: { '@id': 'https://nikhilsinghal.com/#person' },
    },
    {
      '@type': 'Person',
      '@id': 'https://nikhilsinghal.com/#person',
      name: 'Nikhil Singhal',
      givenName: 'Nikhil',
      familyName: 'Singhal',
      jobTitle:
        'CTO | VP Engineering | AI Practitioner & Governance Strategist',
      url: 'https://nikhilsinghal.com',
      image: 'https://nikhilsinghal.com/img/nikhil-singhal-portrait-1200.jpg',
      email: 'mailto:nikhil@omspark.com',
      telephone: '+1-206-226-2722',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Seattle',
        addressRegion: 'WA',
        addressCountry: 'US',
      },
      sameAs: [
        'https://www.linkedin.com/in/nikhilsinghal/',
        'https://github.com/nikhilsi',
        'https://orcid.org/0009-0003-5449-6830',
        'https://nikhilsinghal-ai-trust-commons.medium.com/',
        'https://about.me/nikhil.singhal',
        'https://x.com/nikhilsinghal',
        'https://www.youtube.com/@nikhilsinghal',
        'https://aitrustcommons.org',
        'https://hipcharter.com',
        'https://omspark.com',
      ],
      knowsAbout: [
        'Artificial Intelligence',
        'AI Governance',
        'Human-AI Interaction',
        'Engineering Leadership',
        'AI Trust Commons',
        'Human Intelligence Partnership Charter',
        'Intent Layer',
        'Model Context Protocol',
        'Large Language Models',
        'AI Agents',
        'AI Memory',
      ],
      alumniOf: [
        { '@type': 'EducationalOrganization', name: 'Harvard University' },
        { '@type': 'EducationalOrganization', name: 'Bangalore University' },
      ],
      worksFor: {
        '@type': 'Organization',
        name: 'OmSpark LLC',
        url: 'https://omspark.com',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://getclearnews.com/#website',
      url: 'https://getclearnews.com',
      name: 'ClearNews',
      about: { '@id': 'https://getclearnews.com/#software' },
      inLanguage: 'en',
    },
  ],
};

/**
 * Root layout — wraps the entire app with theme provider, GA, and SEO meta.
 *
 * The inline script in <head> reads the saved theme preference from localStorage
 * and applies the 'dark' class before React hydrates, preventing a flash of wrong theme.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    (function() {
      try {
        var theme = localStorage.getItem('theme');
        if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch(e) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex flex-col min-h-screen`}
      >
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-RSZEJKJGRX"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-RSZEJKJGRX');
        `}</Script>

        <ThemeProvider>
          <div className="flex-1">{children}</div>

          {/* Footer */}
          <footer className="border-t border-gray-200 bg-white py-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-4">
                <Link
                  href="/about"
                  className="hover:text-gray-700 dark:hover:text-gray-200"
                >
                  About
                </Link>
                <span aria-hidden="true">&middot;</span>
                <span>
                  Built by{' '}
                  <a
                    href="https://nikhilsinghal.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Nikhil Singhal
                  </a>
                </span>
              </div>
              <span>&copy; {new Date().getFullYear()} OmSpark LLC</span>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
