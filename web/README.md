# Web Frontend — Next.js

The web frontend for the news aggregator. A clean, responsive news reader with category filtering, search, dark mode, and infinite scroll.

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
| `/login` | Login | Email + password login form |

## Folder Structure

```
web/src/
├── app/
│   ├── layout.tsx           # Root layout (theme + auth providers, dark mode script)
│   ├── page.tsx             # Home — article feed
│   ├── globals.css          # Tailwind imports + dark mode config
│   └── login/
│       └── page.tsx         # Login page
│
├── components/
│   ├── Header.tsx           # Sticky header (logo, search, theme toggle, login)
│   ├── CategoryTabs.tsx     # Horizontal category tabs (fetches from API)
│   ├── ArticleCard.tsx      # Single article card (image, title, summary, source)
│   ├── ArticleGrid.tsx      # Responsive grid + infinite scroll + loading/error states
│   ├── SearchBar.tsx        # Debounced search input (400ms)
│   └── ThemeToggle.tsx      # Dark/light mode toggle button
│
├── hooks/
│   └── useArticles.ts       # Article fetching with pagination + infinite scroll
│
├── context/
│   ├── ThemeContext.tsx      # Dark mode state + toggle (localStorage + OS preference)
│   └── AuthContext.tsx       # JWT auth state (login, logout, token validation)
│
└── lib/
    ├── api.ts               # API client (fetch wrapper for backend endpoints)
    ├── types.ts             # TypeScript interfaces (Article, Category, User, etc.)
    └── utils.ts             # Utility functions (relative time formatting)
```

## Key Patterns

- **Dark mode** — Class-based via Tailwind (`dark:` variants). Inline script in `<head>` prevents flash of wrong theme on load. Respects OS preference, persists user choice in localStorage.
- **Infinite scroll** — Intersection Observer on a sentinel element at the bottom of the grid. Loads next page when sentinel enters viewport (with 200px root margin for early trigger).
- **Debounced search** — SearchBar waits 400ms after user stops typing before calling the API.
- **Race condition handling** — useArticles tracks request IDs to discard stale responses when filters change quickly.
- **Responsive grid** — 1 column mobile, 2 tablet (md), 3 desktop (lg).
- **Skeleton loading** — Animated placeholder cards while articles load.

## Dependencies

| Package | Purpose |
|---------|---------|
| next | React framework (App Router) |
| react / react-dom | UI library |
| tailwindcss | Utility-first CSS |
| typescript | Type safety |
