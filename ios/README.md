# iOS App — ClearNews (SwiftUI)

Native iOS client for ClearNews. Zero external dependencies. Deployment target: iOS 17.0. Version 2.1 (build 6, with the morning edition and breaking news) is on TestFlight and was submitted for App Store review on Nov 9, 2026 (releases automatically when Apple approves); the App Store has 2.0. Store text and screenshots: `appstore/`.

## Quick Start

1. Open `ios/ClearNews/ClearNews.xcodeproj` in Xcode
2. Select a simulator or device
3. Build and run (Cmd+R)

The app connects to `https://getclearnews.com` by default (see `Utilities/Constants.swift`).

## Release

1. Raise the build number (`CURRENT_PROJECT_VERSION` in the project); each upload needs a new one.
2. `ios/scripts/testflight-upload.sh` builds the release archive and uploads it to App Store Connect, signing through the Apple account in Xcode. Output and the log go to `ios/build/`.
3. Testers and beta review: `docs/app-store-submission-playbook.md`, phase 6. The Family Testers group is external, so each new version gets Apple's beta review.
4. Before an App Store release: walk the device checklist (`docs/ios-2.1-test-checklist.md` for 2.1) and run the decoder sweep against production (`docs/deploy-runbook.md`).

## Features

- **Today** (2.1, #425): on the first tab, the hourly brief as numbered compact rows with the date, story count and edition time, "Covered by N outlets" (each outlet's headline opens in the reader), Fox and NPR marks on US politics stories, and "You're all caught up" with the next edition's time. Without a brief, the first tab shows cards
- **Article feed**: Cards with hero images, infinite scroll, pull-to-refresh (force cache bypass), shimmer skeleton loading
- **Category filtering**: Horizontal scroll capsule pills, fetched dynamically from API
- **Search**: `.searchable` with 400ms debounce, composes with category filter
- **Reader view**: WKWebView rendering extracted HTML content, dark mode CSS, responsive images, styled figures, captions, tables and lists, zoom, configurable font size, external links open in Safari. A placeholder holds the photo's place while it loads. When the reader cannot show an article, a message per reason (blocked, slow, video, no text) and a link to the original
- **Share**: Share any article from the card footer or reader toolbar via native iOS share sheet
- **Morning edition** (2.1, #435): Today's count and top story once a day, pushed by the server at the time the reader picks (Settings, Notifications; off by default, 7:00 AM preset), plus a one-time offer at the end of Today. Tapping it opens the story in the reader. The app asks iOS for the push token each time and keeps no copy; it sends its whole state to `POST /api/v1/notifications` on every change and at most once a day otherwise. Push only works in TestFlight and App Store builds (production); Xcode builds on a cable get none. Design: `docs/435-notifications-design.md`
- **Breaking news** (2.1, #487): one alert when many outlets cover a big story at once, at most one a day, never between 10 PM and 7 AM on the phone's clock; its own switch in Settings, off by default. Sent with the same state as the morning edition (`breaking`). Design: `docs/435-notifications-design.md` section 6.5
- **Settings**: Theme picker (system/light/dark), reader font size (S/M/L/XL), the morning edition switch and time, the breaking news switch, about page with content attribution + links
- **Dynamic Type**: All text uses semantic fonts, padding/sizes scale via `@ScaledMetric`
- **Haptic feedback**: Light impact on article card tap and category selection
- **Accessibility**: Labels on all interactive controls, combined elements on error/empty states
- **Privacy manifest**: PrivacyInfo.xcprivacy (UserDefaults CA92.1, no tracking, no collected data)

## Folder Structure

```
ios/ClearNews/ClearNews/ClearNews/
├── ClearNewsApp.swift          # @main entry, URLCache config, environment injection
├── ContentView.swift           # TabView (Home + Settings)
├── PrivacyInfo.xcprivacy       # Privacy manifest (UserDefaults CA92.1, no tracking)
│
├── Models/
│   ├── Article.swift           # Codable article model (url as Identifiable id)
│   ├── Category.swift          # id, name, sourceCount
│   ├── ReaderContent.swift     # Reader extraction result + estimated read time
│   └── ReaderTarget.swift      # What the reader opens: an article or a coverage headline
│
├── Services/
│   ├── APIClient.swift         # Singleton URLSession wrapper, get<T> and a JSON post for 204 answers, ISO 8601 date decoding
│   ├── ArticleService.swift    # @Observable — fetch, loadMore, selectCategory, updateSearch, stale request tracking
│   ├── CategoryService.swift   # @Observable — fetches categories from API
│   └── NotificationService.swift # @Observable — the morning edition: permission, sign-up sync, tap routing; AppDelegate (#435)
│
├── Settings/
│   └── AppSettings.swift       # @Observable — appearance + readerFontScale, UserDefaults persistence
│
├── Utilities/
│   └── Constants.swift         # baseURL, apiBaseURL
│
├── Views/
│   ├── Home/
│   │   ├── HomeView.swift          # NavigationStack, search bar, category tabs, article list, reader sheet
│   │   ├── ArticleListView.swift   # LazyVGrid (1 col iPhone, 2 col iPad), 4 states, infinite scroll sentinel; Today on the first tab
│   │   ├── TodayView.swift         # Today: header, numbered rows, caught-up line (2.1)
│   │   ├── ArticleCardView.swift   # Hero image (AsyncImage), title, summary, source + relative time
│   │   └── CategoryTabsView.swift  # Horizontal ScrollView, capsule pill buttons
│   │
│   ├── Reader/
│   │   ├── ReaderView.swift        # Hero image, metadata, content area (loading/error/webview), toolbar
│   │   └── ReaderWebView.swift     # UIViewRepresentable — WKWebView, CSS injection, JS height reporting, font scaling
│   │
│   ├── Settings/
│   │   ├── SettingsView.swift      # Theme, font size, about
│   │   └── AboutView.swift         # Version, build, content sources, links to privacy/support
│   │
│   └── Shared/
│       ├── EmptyStateView.swift    # Icon + message (accessibility combined)
│       ├── ErrorView.swift         # Icon + message + optional retry button (accessibility combined)
│       ├── RelativeTimeText.swift  # "just now", "5m ago", "2h ago", "3d ago", "Feb 8"
│       ├── SkeletonView.swift      # Shimmer animation skeleton cards
│       └── StoryBits.swift         # Fox/NPR marks, "Covered by N outlets", thumbnail (2.1)
│
└── Assets.xcassets/
    ├── AccentColor.colorset/
    └── AppIcon.appiconset/     # Size definitions only — icon images pending
```

## Architecture

### Services & Dependency Injection

Three `@Observable` services created as `@State` in `ClearNewsApp.swift` and injected via `.environment()`:

| Service | Responsibility |
|---------|---------------|
| `ArticleService` | Article fetching, pagination, category/search filtering, stale request tracking |
| `CategoryService` | Fetches category list from API |
| `AppSettings` | Theme + reader font size, UserDefaults persistence |

### APIClient

Singleton wrapping `URLSession` with:
- Generic `get<T>` / `post<Body, T>` methods with Codable decoding
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

None. The app uses only Apple frameworks: SwiftUI, WebKit, Foundation.
