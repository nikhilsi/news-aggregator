'use client';

/* Shared by the reader overlay and the /article page (#423). */

import DOMPurify from 'dompurify';

let hooked = false;

/** The server's reader HTML, sanitized again here, with links opening in a new tab. */
export function readerHtml(html: string): string {
  if (!hooked) {
    hooked = true;
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  return DOMPurify.sanitize(html);
}

/** Minutes to read, rounded down with a minimum of 1, as the iOS and Android apps show it. */
export const readMinutes = (words: number) => Math.max(1, Math.floor(words / 200));

/** What to say when the reader could not show the article, by the server's reason. */
export function failureMessage(reason: string | null | undefined, source: string | null | undefined): string {
  switch (reason) {
    case 'forbidden':
      return `${source || 'This site'} doesn't allow reader view.`;
    case 'timeout':
      return `${source || 'The site'} took too long to respond.`;
    case 'video':
      return 'This is a video, not an article.';
    case 'extraction_empty':
      return "We couldn't find the article text on this page.";
    default:
      return "This article couldn't be loaded in reader view.";
  }
}
