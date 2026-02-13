# Web Frontend — Next.js

The web frontend for the news aggregator. A clean, responsive news reader with category filtering, search, dark mode, infinite scroll, and an in-app reader view.

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
| `/login` | Login | Email + password login form |

## Folder Structure

```
web/src/
├── app/
│   ├── layout.tsx           # Root layout (theme + auth providers, dark mode script)
│   ├── page.tsx             # Home — article feed + reader modal state
│   ├── globals.css          # Tailwind imports + dark mode config + typography plugin
│   ├── article/
│   │   └── page.tsx         # Standalone reader view (fallback for direct URL access)
│   └── login/
│       └── page.tsx         # Login page
│
├── components/
│   ├── Header.tsx           # Sticky header (logo, search, refresh button, theme toggle, login)
│   ├── CategoryTabs.tsx     # Horizontal category tabs (fetches from API)
│   ├── ArticleCard.tsx      # Single article card (image, title, summary, source)
│   ├── ArticleGrid.tsx      # Responsive grid + infinite scroll + loading/error/retry states
│   ├── ReaderModal.tsx      # Full-screen reader overlay (content extraction, keyboard close)
│   ├── SearchBar.tsx        # Debounced search input (400ms)
│   ├── ThemeToggle.tsx      # Dark/light mode toggle button
│   └── UserMenu.tsx         # User dropdown menu (logout, future: preferences/admin)
│
├── hooks/
│   └── useArticles.ts       # Article fetching with pagination, infinite scroll, force refresh
│
├── context/
│   ├── ThemeContext.tsx      # Dark mode state + toggle (localStorage + OS preference)
│   └── AuthContext.tsx       # JWT auth state (login, logout, token validation)
│
└── lib/
    ├── api.ts               # API client (fetch wrapper with 15s timeout)
    ├── types.ts             # TypeScript interfaces (Article, Category, User, etc.)
    └── utils.ts             # Utility functions (relative time formatting)
```

## Key Patterns

- **Force refresh** — Refresh button in header sends `?refresh=true` to backend, bypassing SWR cache. Same function used for retry on errors.
- **Fetch timeout** — All API calls timeout after 15 seconds via AbortController. Timeout errors shown with distinct "Taking longer than expected" messaging.
- **Error recovery** — Retry button on all error states. Slow-loading hint ("Fetching fresh articles...") after 3 seconds of loading.
- **Smooth transitions** — Category/search changes keep previous articles visible while new data loads (no flash of empty state).
- **Dark mode** — Class-based via Tailwind (`dark:` variants). Inline script in `<head>` prevents flash of wrong theme on load. Respects OS preference, persists user choice in localStorage.
- **Infinite scroll** — Intersection Observer on a sentinel element at the bottom of the grid. Loads next page when sentinel enters viewport (with 200px root margin for early trigger).
- **Debounced search** — SearchBar waits 400ms after user stops typing before calling the API.
- **Auto-retry on partial data** — When backend returns `complete: false` (cold cache, partial sources), useArticles silently re-fetches after 3 seconds to get the full article set.
- **Race condition handling** — useArticles tracks request IDs to discard stale responses when filters change quickly.
- **Responsive grid** — 1 column mobile, 2 tablet (md), 3 desktop (lg).
- **Skeleton loading** — Animated placeholder cards while articles load.
- **Reader modal** — Full-screen overlay fetches clean article content from the backend. Feed stays mounted underneath for instant back navigation. Closes via Back button, Escape key, or browser back (invisible `pushState` entry). Falls back gracefully for paywalled sites.

## Dependencies

| Package | Purpose |
|---------|---------|
| next | React framework (App Router) |
| react / react-dom | UI library |
| tailwindcss | Utility-first CSS |
| @tailwindcss/typography | Prose styling for reader view content |
| typescript | Type safety |
