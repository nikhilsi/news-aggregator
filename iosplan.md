# ClearNews iOS App — Architecture & Implementation Plan

**Created**: February 11, 2026
**Status**: Complete (v1.0.0) — all 9 steps implemented

---

## Context

Phase 4 of the ClearNews project. The backend API is live at getclearnews.com and the Next.js web frontend is complete (v0.7.0). The iOS app is a native SwiftUI client consuming the same REST API, with full feature parity to the web.

This is a **network-driven app** — every screen depends on API responses. Unlike a local-data app, network latency, errors, and connectivity are first-class concerns that shape every architectural decision.

**User decisions:**
- iOS 17+ (enables `@Observable`)
- Dark/light mode only (no multi-theme)
- WKWebView for reader HTML rendering
- Browse without login (auth is optional)
- Zero external Swift packages
- Universal: iPhone + iPad

---

## Project Structure

```
ios/ClearNews/
├── ClearNews.xcodeproj                 # Created via Xcode (New Project → iOS App → SwiftUI)
└── ClearNews/
    ├── ClearNewsApp.swift              # @main entry, creates services, .environment()
    ├── ContentView.swift               # TabView (Home + Settings)
    │
    ├── Models/
    │   ├── Article.swift               # Article, ArticleListResponse, Pagination
    │   ├── ReaderContent.swift         # ReaderResponse (status ok/failed)
    │   ├── Category.swift              # Category
    │   └── Auth.swift                  # LoginRequest, LoginResponse, User
    │
    ├── Services/
    │   ├── APIClient.swift             # URLSession wrapper, base URL, error handling, JWT injection
    │   ├── ArticleService.swift        # @Observable: articles, pagination, filters, fetch/loadMore
    │   ├── CategoryService.swift       # @Observable: categories list
    │   └── AuthService.swift           # @Observable: login/logout, Keychain token
    │
    ├── Settings/
    │   └── AppSettings.swift           # @Observable: appearance (system/light/dark), readerFontScale
    │
    ├── Views/
    │   ├── Home/
    │   │   ├── HomeView.swift          # Category tabs + article list + .searchable + .sheet(reader)
    │   │   ├── CategoryTabsView.swift  # Horizontal ScrollView of capsule pills
    │   │   ├── ArticleListView.swift   # LazyVStack + infinite scroll sentinel + pull-to-refresh
    │   │   └── ArticleCardView.swift   # Image, title (2 lines), summary (3 lines), source, time
    │   │
    │   ├── Reader/
    │   │   ├── ReaderView.swift        # Sheet: header + content/loading/fallback states
    │   │   └── ReaderWebView.swift     # UIViewRepresentable wrapping WKWebView
    │   │
    │   ├── Settings/
    │   │   ├── SettingsView.swift      # Theme picker, font size, account, about
    │   │   ├── LoginView.swift         # Email + password form
    │   │   └── AboutView.swift         # Version, credits
    │   │
    │   └── Shared/
    │       ├── SkeletonView.swift      # Shimmer loading placeholder card
    │       ├── ErrorView.swift         # Error message + retry button
    │       ├── EmptyStateView.swift    # "No articles found"
    │       └── RelativeTimeText.swift  # "2h ago", "3d ago"
    │
    ├── Utilities/
    │   ├── KeychainHelper.swift        # Security framework wrapper for JWT storage
    │   └── Constants.swift             # API base URLs, app name
    │
    ├── Assets.xcassets/
    └── Info.plist                      # NSAllowsLocalNetworking for dev builds
```

~28 Swift files total. No external packages.

---

## Backend API Reference

The iOS app consumes the same API as the web frontend. No backend changes needed.

**Base URLs:**
- Dev: `http://localhost:8000/api/v1`
- Prod: `https://getclearnews.com/api/v1`

**Note:** CORS does not apply to native iOS apps (only browsers). No backend CORS changes needed.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check → `{ status: "ok" }` |
| GET | `/articles` | Fetch articles with filters (category, source, search, page, per_page) |
| GET | `/articles/reader?url=<encoded-url>` | Extract clean article content for reader view |
| GET | `/categories` | List categories with source counts |
| GET | `/sources` | List all configured sources |
| POST | `/auth/login` | Login → `{ access_token, token_type, user }` |
| GET | `/auth/me` | Current user (requires `Authorization: Bearer <token>`) |

### Key Response Shapes

**Article:** `title, summary?, url, image_url?, source_id, source_name, source_type, category, sentiment?, published_at?`

**ArticleListResponse:** `{ articles: [Article], pagination: { page, per_page, total, total_pages } }`

**ReaderContent:** `{ status: "ok"|"failed", url, title?, author?, content_html?, word_count?, image_url?, source_name?, published_at?, extracted_at?, reason? }`
- Reason codes (when failed): `forbidden`, `timeout`, `extraction_empty`, `error`

**Category:** `{ id, name, source_count }`

**User:** `{ id, email, full_name?, is_admin }`

---

## Models (Codable Structs)

All models use `Codable` with a shared `JSONDecoder` configured with `.convertFromSnakeCase` and a flexible ISO 8601 date decoder (handles with/without fractional seconds, and null dates).

**Article.swift:**
- `Article`: Codable, Identifiable, Hashable — `id` computed from `url`
- `ArticleListResponse`: articles + pagination
- `Pagination`: page, perPage, total, totalPages

**ReaderContent.swift:**
- `ReaderContent`: Codable — status, url, title?, author?, contentHtml?, wordCount?, etc.
- Computed: `isOk`, `isFailed`, `estimatedReadTime` (wordCount / 200)

**Category.swift:**
- `Category`: Codable, Identifiable, Hashable

**Auth.swift:**
- `LoginRequest`: Encodable (email, password)
- `LoginResponse`: Codable (accessToken, tokenType, user)
- `User`: Codable, Identifiable

---

## Network Layer — APIClient.swift

This is the most critical piece of a network-driven app. Singleton wrapping URLSession.

**Responsibilities:**
- Base URL switching (`#if DEBUG` → localhost, else production)
- Generic `get<T>` and `post<Body, T>` methods with async/await
- Optional JWT token injection via `Authorization: Bearer` header
- Error handling: parse FastAPI's `{ detail: "..." }` from error responses
- Timeouts: 15s request, 30s resource

**APIError enum:**
- `invalidURL` — malformed URL
- `httpError(statusCode: Int, detail: String?)` — 4xx/5xx with optional detail
- `decodingError(Error)` — JSON parsing failed
- `networkError(Error)` — no connectivity, timeout, etc.

All errors conform to `LocalizedError` for user-facing messages.

---

## Services

### ArticleService (@Observable)

The core service. iOS equivalent of the web's `useArticles` hook.

**State:**
- `articles: [Article]` — the current page(s) of articles
- `isLoading: Bool` — initial load in progress
- `isLoadingMore: Bool` — next page load in progress
- `error: String?` — last error message
- `hasMore: Bool` — more pages available
- `selectedCategory: String` — current category filter ("all" by default)
- `searchQuery: String` — current search text

**Methods:**
- `fetchArticles()` — resets to page 1, clears articles, fetches fresh
- `loadMore()` — fetches next page, appends to articles array
- `selectCategory(_:)` — updates filter (view triggers refetch)
- `updateSearch(_:)` — updates search query (view triggers refetch after debounce)

**Stale request handling:** `currentRequestId` counter. Each `fetchArticles()` increments the ID. On response, check if the ID still matches — if not, discard (user changed filters while request was in-flight).

**loadMore() guard:** Only fires if `!isLoadingMore && !isLoading && hasMore` — prevents duplicate requests.

### CategoryService (@Observable)

Simple: fetches categories once on app launch, stores in `categories: [Category]`.

### AuthService (@Observable)

**State:** `user: User?`, `isAuthenticated` (computed), `isLoading`, `error`

**Methods:**
- `validateSavedToken()` — on app launch, reads token from Keychain, calls `/auth/me` to validate
- `login(email:, password:)` — calls `/auth/login`, saves token to Keychain, sets user
- `logout()` — clears Keychain, clears API token, clears user

**Token flow:** AuthService reads/writes the Keychain and sets/clears `APIClient.shared.token`. The APIClient injects the token into every request if present.

### AppSettings (@Observable)

**State:**
- `appearance: String` — "system" / "light" / "dark" → computed `colorScheme: ColorScheme?`
- `readerFontScale: Double` — 0.85 / 1.0 / 1.15 / 1.3

All persisted via `UserDefaults` with `didSet` observers.

---

## App Entry + Navigation

**ClearNewsApp.swift:**
- Creates `@State` services: articleService, categoryService, authService, appSettings
- Passes all via `.environment()` so any view can access them
- `.preferredColorScheme(appSettings.colorScheme)` at root level
- `.task` on launch: fetch categories + validate saved token

**ContentView.swift:**
- `TabView` with 2 tabs:
  - Home (SF Symbol: `newspaper`) → `HomeView`
  - Settings (SF Symbol: `gearshape`) → `SettingsView`

---

## Screen Flow

```
TabView
├── Home (HomeView)
│   ├── NavigationStack
│   │   ├── Category tabs (horizontal scroll pills)
│   │   ├── .searchable (debounced 400ms via .task(id:))
│   │   ├── Article list (LazyVStack)
│   │   │   ├── Loading: skeleton shimmer cards
│   │   │   ├── Error: message + retry button
│   │   │   ├── Empty: "No articles found"
│   │   │   ├── Articles: card list + infinite scroll
│   │   │   └── End: "You're all caught up"
│   │   ├── Pull-to-refresh via .refreshable
│   │   └── .sheet → ReaderView (article detail)
│   │       ├── Loading: skeleton
│   │       ├── Success: hero image + title + metadata + WKWebView HTML
│   │       └── Failed: message + "Read on {source}" button → Safari
│
└── Settings (SettingsView)
    ├── Appearance: system/light/dark picker
    ├── Reader font size: segmented control (S/M/L/XL)
    ├── Account: sign in link OR signed-in user + sign out
    └── About ClearNews
```

---

## Reader View — WKWebView Approach

**ReaderView.swift** — presented as `.sheet(item: $selectedArticle)`:
1. Shows article metadata (title, source, image) immediately from the `Article` object already in memory
2. Fetches `GET /articles/reader?url=...` for extracted content
3. On success (`status: "ok"`): renders `contentHtml` in `ReaderWebView`
4. On failure (`status: "failed"`): shows fallback message + "Read on {source}" button that opens Safari

**ReaderWebView.swift** — `UIViewRepresentable` wrapping `WKWebView`:
- Loads extracted HTML via `loadHTMLString` with a minimal HTML template
- CSS handles dark mode (`prefers-color-scheme`), responsive images (`max-width: 100%`), font sizing
- Font size controlled via `settings.readerFontScale` multiplied by base 16px
- External links open in Safari via `WKNavigationDelegate` (intercept `.linkActivated`)
- WKWebView internal scroll disabled — outer SwiftUI `ScrollView` handles scrolling
- Content height measured via JavaScript (`document.body.scrollHeight`) after page load, communicated back to SwiftUI to size the frame dynamically

---

## Network-First Design Principles

This is not a local-data app. Every design decision accounts for network reality:

1. **Every screen has 4 states**: loading, success, error, empty. No exceptions.
2. **Loading is the default state** — show skeletons immediately, not a blank screen.
3. **Errors are recoverable** — every error state has a retry button.
4. **Pull-to-refresh everywhere** — user can always force a fresh fetch.
5. **Stale request discarding** — rapid filter/search changes don't corrupt state.
6. **Optimistic metadata** — reader view shows title/source/image instantly from the article card data while content loads from the API.
7. **Graceful degradation** — if reader extraction fails, offer a direct link to the source. If categories fail to load, show articles without tabs.
8. **Request cancellation** — when category/search changes, in-flight requests should be discarded (via requestId tracking) rather than cancelled (Task cancellation can be fragile).

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `@Observable` (not ObservableObject) | iOS 17+ target, cleaner syntax, less boilerplate |
| `.environment()` for services | Idiomatic SwiftUI for app-wide dependencies |
| `TabView` (not NavigationSplitView) | KISS. Two tabs is simple. iPad split-view can come later |
| `AsyncImage` (not custom cache) | Built-in, sufficient for ~20 articles/page. Optimize later if needed |
| `.sheet` for reader (not NavigationLink) | Modal presentation feels right for reading. Easy to dismiss. Doesn't affect nav stack |
| Singleton `APIClient` | Simple, one HTTP client. Token set/cleared by AuthService |
| Keychain for JWT | Security best practice for tokens on iOS. Not UserDefaults |
| `LazyVStack` + `ScrollView` (not `List`) | More control over card styling. List has opinionated styling that's harder to customize |
| Stale request ID (not Task cancellation) | More predictable. Task cancellation in async/await can throw at unexpected points |

---

## Build Order

Each step produces a testable, working state. No step depends on a later step.

| Step | What to Build | How to Test |
|------|---------------|-------------|
| **1. Setup + Models + API** | Xcode project, folder structure, all Codable models, APIClient, Constants | Call `GET /health` from a basic ContentView, show result |
| **2. Article List (E2E)** | ArticleService (fetch only), ArticleCardView, ArticleListView, basic HomeView | See real articles from production API on screen |
| **3. Categories** | CategoryService, CategoryTabsView, wire into HomeView | Tap categories → articles filter correctly |
| **4. Pagination** | loadMore(), infinite scroll sentinel, pull-to-refresh, skeleton + end states | Scroll to bottom → next page loads. Pull down → refresh. |
| **5. Search** | `.searchable` + debounced `.task(id:)` (400ms) | Type query → see filtered results after debounce |
| **6. Reader View** | ReaderWebView (WKWebView), ReaderView, .sheet presentation | Tap article → see extracted content. Tap paywalled article → see fallback |
| **7. Settings + Theme** | AppSettings, SettingsView, AboutView, TabView, dark/light toggle | Toggle dark mode → UI updates. Change font → reader respects it. Persists on relaunch |
| **8. Auth** | KeychainHelper, AuthService, LoginView, wire into Settings | Login → see user in settings. Logout → clears state. Token persists across launches |
| **9. Polish** | Error/empty/loading states on all views, RelativeTimeText, shimmer animations | Test on iPhone + iPad physical devices. Test airplane mode, slow network |

---

## Known Challenges

1. **WKWebView height in ScrollView** — Getting the WebView to report its content height to SwiftUI so the outer ScrollView works naturally. Will use JavaScript `document.body.scrollHeight` after page load. May need `ResizeObserver` for late-loading images. This is the single hardest technical challenge.

2. **Date decoding flexibility** — Backend returns ISO 8601 strings, some with fractional seconds, some without, some null. Need a custom `JSONDecoder.dateDecodingStrategy` that handles all variants.

3. **Stale request handling** — The `currentRequestId` pattern must be tested thoroughly: rapid category switching, typing fast in search, category change while loadMore is in-flight.

4. **Local development** — iOS App Transport Security blocks `http://` by default. Need `NSAllowsLocalNetworking = YES` in Info.plist for debug builds to hit `http://localhost:8000`.

5. **AsyncImage on scroll** — With many articles, rapid scrolling may cause image flicker as AsyncImage re-fetches. If this becomes noticeable, add a simple `NSCache`-based image cache (no external packages needed).

---

## Verification Checklist

- [ ] Launch app → see article feed with real data from API
- [ ] Tap category tabs → articles filter correctly
- [ ] Search → debounced, results update
- [ ] Scroll to bottom → next page loads, "all caught up" at end
- [ ] Pull to refresh → articles reload
- [ ] Tap article → reader sheet opens with extracted content
- [ ] Tap paywalled article → fallback with "Read on {source}" button
- [ ] Settings → toggle dark/light, change font size, persists across launches
- [ ] Login → see user info in settings, logout → clears state
- [ ] Test on both iPhone and iPad
- [ ] Test airplane mode → error state with retry
- [ ] Test slow network → loading states visible, no crashes
