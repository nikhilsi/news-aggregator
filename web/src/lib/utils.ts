/* Utility functions. */

/**
 * Format an ISO date string as a relative time (e.g., "2h ago", "3d ago").
 * Falls back to a short date if the input is invalid.
 */
export function timeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Older than a week — show short date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
