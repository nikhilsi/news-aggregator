# iOS App — ClearNews (SwiftUI)

Native iOS client for ClearNews. Full feature parity with the web frontend. 26 Swift files, zero external dependencies.

## Quick Start

1. Open `ios/ClearNews/ClearNews.xcodeproj` in Xcode
2. Select a simulator or device
3. Build and run (Cmd+R)

The app connects to `https://getclearnews.com` by default (see `Utilities/Constants.swift`).

## Features

- **Article feed**: Cards with hero images, infinite scroll, pull-to-refresh (force cache bypass), shimmer skeleton loading
- **Category filtering**: Horizontal scroll capsule pills, fetched dynamically from API
- **Search**: `.searchable` with 400ms debounce, composes with category filter
- **Reader view**: WKWebView rendering extracted HTML content, dark mode CSS, responsive images, configurable font size, external links open in Safari, fallback for paywalled sites
- **Share**: Share any article from the card footer or reader toolbar via native iOS share sheet
- **Settings**: Theme picker (system/light/dark), reader font size (S/M/L/XL), about page
- **Authentication**: JWT stored in Keychain, login form, auto-validates saved token on launch
- **Dynamic Type**: All text uses semantic fonts, padding/sizes scale via `@ScaledMetric`
- **Haptic feedback**: Light impact on article card tap and category selection

## Folder Structure

```
ios/ClearNews/ClearNews/ClearNews/
├── ClearNewsApp.swift          # @main entry, URLCache config, environment injection
├── ContentView.swift           # TabView (Home + Settings)
│
├── Models/
│   ├── Article.swift           # Codable article model (url as Identifiable id)
│   ├── Auth.swift              # LoginRequest, LoginResponse, User
│   ├── Category.swift          # id, name, sourceCount
│   └── ReaderContent.swift     # Reader extraction result + estimated read time
│
├── Services/
│   ├── APIClient.swift         # Singleton URLSession wrapper, generic get<T>/post<Body,T>, JWT injection, ISO 8601 date decoding
│   ├── ArticleService.swift    # @Observable — fetch, loadMore, selectCategory, updateSearch, stale request tracking
│   ├── AuthService.swift       # @Observable — login, logout, validateSavedToken, Keychain persistence
│   └── CategoryService.swift   # @Observable — fetches categories from API
│
├── Settings/
│   └── AppSettings.swift       # @Observable — appearance + readerFontScale, UserDefaults persistence
│
├── Utilities/
│   ├── Constants.swift         # baseURL, apiBaseURL
│   └── KeychainHelper.swift    # Security framework wrapper (save/read/delete)
│
├── Views/
│   ├── Home/
│   │   ├── HomeView.swift          # NavigationStack, search bar, category tabs, article list, reader sheet
│   │   ├── ArticleListView.swift   # LazyVGrid (1 col iPhone, 2 col iPad), 4 states, infinite scroll sentinel
│   │   ├── ArticleCardView.swift   # Hero image (AsyncImage), title, summary, source + relative time
│   │   └── CategoryTabsView.swift  # Horizontal ScrollView, capsule pill buttons
│   │
│   ├── Reader/
│   │   ├── ReaderView.swift        # Hero image, metadata, content area (loading/error/webview), toolbar
│   │   └── ReaderWebView.swift     # UIViewRepresentable — WKWebView, CSS injection, JS height reporting, font scaling
│   │
│   ├── Settings/
│   │   ├── SettingsView.swift      # Theme, font size, account, about
│   │   ├── LoginView.swift         # Email/password form with loading/error states
│   │   └── AboutView.swift         # Version, build, description
│   │
│   └── Shared/
│       ├── EmptyStateView.swift    # Icon + message
│       ├── ErrorView.swift         # Icon + message + optional retry button
│       ├── RelativeTimeText.swift  # "just now", "5m ago", "2h ago", "3d ago", "Feb 8"
│       └── SkeletonView.swift      # Shimmer animation skeleton cards
│
└── Assets.xcassets/
    ├── AccentColor.colorset/
    └── AppIcon.appiconset/     # Size definitions only — no images yet
```

## Architecture

### Services & Dependency Injection

Four `@Observable` services created as `@State` in `ClearNewsApp.swift` and injected via `.environment()`:

| Service | Responsibility |
|---------|---------------|
| `ArticleService` | Article fetching, pagination, category/search filtering, stale request tracking |
| `CategoryService` | Fetches category list from API |
| `AuthService` | JWT login/logout, Keychain persistence, token validation on launch |
| `AppSettings` | Theme + reader font size, UserDefaults persistence |

### APIClient

Singleton wrapping `URLSession` with:
- Generic `get<T>` / `post<Body, T>` methods with Codable decoding
- JWT token injection via `Authorization: Bearer` header
- Custom `ISO8601DateDecoder` handling both fractional and non-fractional seconds
- FastAPI error detail extraction for user-friendly error messages
- 30s request / 60s resource timeouts

### Key Patterns

- **Stale request tracking**: `currentRequestId` counter in ArticleService. When a new request fires, previous in-flight requests are ignored on completion. Prevents race conditions from rapid category/search switching.
- **Auto-retry on partial data**: When backend returns `complete: false` (cold cache, partial sources), ArticleService waits 3 seconds then silently re-fetches to get the full article set.
- **4-state views**: Every data-driven screen handles loading, error, empty, and success states explicitly.
- **Pull-to-refresh**: Sends `refresh=true` to bypass backend SWR cache for genuinely fresh data.
- **Search debounce**: `.task(id: searchText)` with 400ms `Task.sleep` — SwiftUI auto-cancels the previous task.
- **iPad layout**: 2-column grid via `LazyVGrid` with adaptive columns based on horizontal size class.

### Caching

- `URLCache.shared` set to 100MB memory / 200MB disk at app startup
- Backend sets `Cache-Control` headers: articles (5min), categories/sources (5min)
- No custom image cache — relies on URLSession/URLCache for AsyncImage

## Dependencies

None. The app uses only Apple frameworks: SwiftUI, WebKit, Security, Foundation.
