'use client';

/**
 * Full-screen reader overlay — displays clean, extracted article content.
 *
 * Opens on top of the feed (feed stays mounted underneath).
 * Browser back button closes the modal via pushState/popstate.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Article, ReaderResponse } from '@/lib/types';
import { fetchReaderContent } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

interface ReaderModalProps {
  article: Article;
  onClose: () => void;
}

export default function ReaderModal({ article, onClose }: ReaderModalProps) {
  const [reader, setReader] = useState<ReaderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch reader content on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchReaderContent(article.url);
        if (!cancelled) {
          setReader(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load article');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [article.url]);

  // Push a history entry (without changing URL) so browser back closes the modal.
  // We avoid changing the URL because Next.js App Router intercepts popstate
  // and tries to route, which conflicts with our manual history management.
  useEffect(() => {
    window.history.pushState({ readerModal: true }, '');

    function handlePopState() {
      onClose();
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Focus the close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape key and trap focus within the modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        window.history.back();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = useCallback(() => {
    // Go back to undo the pushState (restores the feed URL)
    window.history.back();
  }, []);

  // Use reader data when available, fall back to article card data
  const title = reader?.title || article.title;
  const sourceName = reader?.source_name || article.source_name;
  const imageUrl = reader?.image_url || article.image_url;
  const publishedAt = reader?.published_at || article.published_at;
  const author = reader?.author;

  const isFailed = reader?.status === 'failed';
  const isOk = reader?.status === 'ok';

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="reader-title" className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-gray-950">
      {/* Top bar — sticky */}
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
            <kbd className="ml-1 hidden rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-normal text-gray-400 dark:border-gray-600 dark:text-gray-500 sm:inline">Esc</kbd>
          </button>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View Original
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L9.75 14.25" />
            </svg>
          </a>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 py-8">
        {/* Hero image */}
        {imageUrl && (
          <div className="mb-6 overflow-hidden rounded-lg">
            <img
              src={imageUrl}
              alt=""
              className="w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Title */}
        {title && (
          <h1 id="reader-title" className="mb-4 text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
            {title}
          </h1>
        )}

        {/* Metadata line */}
        <div className="mb-6 flex flex-wrap items-center gap-x-2 text-sm text-gray-500 dark:text-gray-400">
          {sourceName && <span className="font-medium text-gray-700 dark:text-gray-300">{sourceName}</span>}
          {sourceName && (author || publishedAt) && <span>&middot;</span>}
          {author && <span>{author}</span>}
          {author && publishedAt && <span>&middot;</span>}
          {publishedAt && <time dateTime={publishedAt}>{timeAgo(publishedAt)}</time>}
          {isOk && reader?.word_count && (
            <>
              <span>&middot;</span>
              <span>{Math.ceil(reader.word_count / 200)} min read</span>
            </>
          )}
        </div>

        <hr className="mb-8 border-gray-200 dark:border-gray-800" />

        {/* Content area */}
        {loading && (
          <div className="space-y-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="mt-6 h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {isFailed && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              This article couldn&apos;t be loaded in reader view.
            </p>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Read on {sourceName || 'original site'}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L9.75 14.25" />
              </svg>
            </a>
          </div>
        )}

        {isOk && reader?.content_html && (
          <div
            className="prose prose-gray max-w-none dark:prose-invert
              prose-headings:font-semibold
              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
              dark:prose-a:text-blue-400
              prose-img:rounded-lg prose-img:mx-auto
              prose-p:leading-relaxed
              prose-li:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(reader.content_html) }}
          />
        )}
      </article>
    </div>
  );
}
