# Web Frontend — Next.js

The web frontend for the news aggregator. A clean, responsive news reader with category filtering, search, dark mode, infinite scroll, and an in-app reader view with client-side HTML sanitization.

## Quick Start

```bash
cd web
npm install
NEXT_PUBLIC_API_URL=/api/v1 npx next build   # static export to web/out
```

The site is a static export (`output: 'export'`) served by the Cloudflare Worker in `worker/`, which also serves the API on the same origin. To run it locally, build it, then `cd ../worker && npm run dev`. `npm run dev` here also works against the live API if `NEXT_PUBLIC_API_URL` points to `https://getclearnews.com/api/v1`.

## Pages

| Route | Page | Description |
|-|-|-|
| `/` | Home | Today page on the first tab (the hourly brief, then your topic sections); every other tab and search: article grid with infinite scroll |
| `/article` | Reader | Standalone reader view (shared links: `/article?url=...`) |
| `/about` | About | Static page |

`/privacy` and `/support` are plain HTML in `public/` (opened from the apps' About screens). There is no analytics.

## Folder Structure

```
web/src/
├── app/
│   ├── layout.tsx           # Root layout (theme provider, dark mode script)
│   ├── page.tsx             # Home: Today page or article grid, reader modal state
│   ├── error.tsx            # Error boundary — catches unhandled exceptions with retry
│   ├── globals.css          # Tailwind imports + dark mode config + typography plugin
│   └── article/
│       └── page.tsx         # Standalone reader view (fallback for direct URL access)
│
├── components/
│   ├── Header.tsx           # Header (logo, search, refresh button, theme toggle); pinned with the tabs by page.tsx
│   ├── CategoryTabs.tsx     # Category tabs: one scrolling row on phones, wrapped rows from sm up
│   ├── TodayView.tsx        # Today page: date, chips, numbered brief rows, caught-up line (#414 step 3)
│   ├── TopicSections.tsx    # "Your topics" under Today, and the topic picker
│   ├── StoryBits.tsx        # New mark, Fox/NPR marks, "Covered by N outlets" list, thumbnail
│   ├── ArticleCard.tsx      # Single article card (image, title, summary, source, marks, coverage), memoized
│   ├── ArticleGrid.tsx      # Responsive grid + infinite scroll + loading/error/retry states
│   ├── ReaderModal.tsx      # Accessible reader overlay (role="dialog", focus trap, DOMPurify)
│   ├── SearchBar.tsx        # Debounced search input (400ms)
│   └── ThemeToggle.tsx      # Dark/light mode toggle button
│
├── hooks/
│   ├── useArticles.ts       # Article fetching with pagination, infinite scroll, force refresh; Today's brief_at
│   └── useCategories.ts     # The tab list from /api/v1/categories
│
├── context/
│   └── ThemeContext.tsx      # Dark mode state + toggle (localStorage + OS preference)
│
└── lib/
    ├── api.ts               # API client (fetch wrapper with 15s timeout)
    ├── types.ts             # TypeScript interfaces (Article, Coverage, Category, ReaderTarget, etc.)
    ├── topics.ts            # The topic sections the reader picked (localStorage)
    ├── visits.ts            # "New since your last visit" (localStorage)
    └── utils.ts             # Utility functions (relative time formatting)
```

## Key Patterns

- **Today page (#414 step 3)**: while `/api/v1/articles` (first tab, no search) returns a `brief_at`, the first tab shows the brief as numbered rows (the publisher's headline, source, time, a small photo, the summary from the sm width up), chips for the story count, reading time, edition time and new stories, then "You're all caught up" with the next edition's time, then the topic sections. With `brief_at` null it shows the grid with a note.
- **Stories, not articles**: a card or row whose story other outlets also covered shows "Covered by N outlets"; it opens (a `<details>`) to each outlet's own headline, each opening in the reader.
- **Fox and NPR marks**: on stories whose main topic is US politics, two dots say whether Fox News and NPR News covered it.
- **Kept in the browser only**: `theme`, `clearnews.topics` (the topic sections and their order), `clearnews.lastSeen` and `clearnews.visitBase` (a visit starts after 30 minutes away; stories published after the previous visit get a "New" mark). Read through `useSyncExternalStore`, so the static export renders the same HTML on the server and the first client render. Nothing is sent to the server; `public/privacy.html` says so.

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
|-|-|
| next | React framework (App Router) |
| react / react-dom | UI library |
| tailwindcss | Utility-first CSS |
| @tailwindcss/typography | Prose styling for reader view content |
| dompurify | Client-side HTML sanitization |
| typescript | Type safety |
