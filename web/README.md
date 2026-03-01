# Web Frontend — Next.js

The web frontend for the news aggregator. A clean, responsive news reader with category filtering, search, dark mode, infinite scroll, and an in-app reader view with client-side HTML sanitization.

## Quick Start

```bash
cd web
cp .env.example .env.local    # Points to backend API
npm install
npm run dev                    # Port 3000
```

Requires the backend running on port 8000 (`cd backend && uvicorn app.main:app --port 8000`).

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Article feed with category tabs, search, infinite scroll |
| `/article` | Reader | Standalone reader view (fallback for direct URL access) |

## Folder Structure

```
web/src/
├── app/
│   ├── layout.tsx           # Root layout (theme provider, dark mode script)
│   ├── page.tsx             # Home — article feed + reader modal state
│   ├── error.tsx            # Error boundary — catches unhandled exceptions with retry
│   ├── globals.css          # Tailwind imports + dark mode config + typography plugin
│   └── article/
│       └── page.tsx         # Standalone reader view (fallback for direct URL access)
│
├── components/
│   ├── Header.tsx           # Sticky header (logo, search, refresh button, theme toggle)
│   ├── CategoryTabs.tsx     # Horizontal category tabs (fetches from API)
│   ├── ArticleCard.tsx      # Single article card (image, title, summary, source) — memoized
│   ├── ArticleGrid.tsx      # Responsive grid + infinite scroll + loading/error/retry states
│   ├── ReaderModal.tsx      # Accessible reader overlay (role="dialog", focus trap, DOMPurify)
│   ├── SearchBar.tsx        # Debounced search input (400ms)
│   └── ThemeToggle.tsx      # Dark/light mode toggle button
│
├── hooks/
│   └── useArticles.ts       # Article fetching with pagination, infinite scroll, force refresh
│
├── context/
│   └── ThemeContext.tsx      # Dark mode state + toggle (localStorage + OS preference)
│
└── lib/
    ├── api.ts               # API client (fetch wrapper with 15s timeout)
    ├── types.ts             # TypeScript interfaces (Article, Category, etc.)
    └── utils.ts             # Utility functions (relative time formatting)
```

## Key Patterns

- **Client-side HTML sanitization** — Reader view content sanitized with DOMPurify before rendering via `dangerouslySetInnerHTML`. Defense-in-depth alongside backend nh3 sanitization.
- **Accessible reader modal** — `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapping (Tab cycles within modal), auto-focus on close button.
- **Error boundary** — `error.tsx` catches unhandled exceptions with user-friendly "Something went wrong" UI and retry button.
- **Force refresh** — Refresh button in header sends `?refresh=true` to backend, triggering non-blocking background refresh. Same function used for retry on errors.
- **Fetch timeout** — All API calls timeout after 15 seconds via AbortController. Timeout errors shown with distinct "Taking longer than expected" messaging.
- **Error recovery** — Retry button on all error states. Slow-loading hint ("Fetching fresh articles...") after 3 seconds of loading.
- **Smooth transitions** — Category/search changes keep previous articles visible while new data loads (no flash of empty state).
- **Dark mode** — Class-based via Tailwind (`dark:` variants). Inline script in `<head>` prevents flash of wrong theme on load. Respects OS preference, persists user choice in localStorage.
- **Infinite scroll** — Intersection Observer on a sentinel element at the bottom of the grid. Loads next page when sentinel enters viewport (with 200px root margin for early trigger).
- **ArticleCard memoization** — Wrapped with `React.memo` to prevent unnecessary re-renders during infinite scroll.
- **Debounced search** — SearchBar waits 400ms after user stops typing before calling the API.
- **Auto-retry on partial data** — When backend returns `complete: false` (cold cache, partial sources), useArticles silently re-fetches after 3 seconds to get the full article set.
- **Race condition handling** — useArticles tracks request IDs to discard stale responses when filters change quickly.
- **Responsive grid** — 1 column mobile, 2 tablet (md), 3 desktop (lg).
- **Skeleton loading** — Animated placeholder cards while articles load.

## Dependencies

| Package | Purpose |
|---------|---------|
| next | React framework (App Router) |
| react / react-dom | UI library |
| tailwindcss | Utility-first CSS |
| @tailwindcss/typography | Prose styling for reader view content |
| dompurify | Client-side HTML sanitization |
| typescript | Type safety |
