# ClearNews Android — Implementation Plan

**Created**: March 7, 2026
**Status**: Complete

---

## Context

Building a native Android version of ClearNews following the established pattern from GitaVani and TourGraph. Unlike those apps (which bundle all data locally), ClearNews talks to a live backend API at getclearnews.com — making the network layer the core, not file I/O.

**Estimated APK size**: ~5-8 MB (no bundled data)
**Target**: Android 8.0+ (API 26), covers ~99% of devices

---

## iOS → Android Feature Parity

### Screens (4)
| Screen | iOS File | Android File | Description |
|--------|----------|--------------|-------------|
| Home | HomeView + ArticleListView | HomeScreen.kt | Article feed, search, category filter, infinite scroll, pull-to-refresh |
| Reader | ReaderView + ReaderWebView | ReaderScreen.kt | WebView with CSP, dark mode CSS, font scaling, height reporting |
| Settings | SettingsView | SettingsScreen.kt | Theme picker, reader font size |
| About | AboutView | AboutScreen.kt | Version, description, attribution, privacy/support links |

### Services
| iOS | Android | Pattern |
|-----|---------|---------|
| ArticleService (@Observable @MainActor) | ClearNewsViewModel (StateFlow) | Pagination, stale request tracking, auto-retry |
| CategoryService (@Observable) | ClearNewsViewModel (merged) | Fetched once on launch |
| AppSettings (@Observable + UserDefaults) | AppSettings (SharedPreferences + StateFlow) | Theme, font scale |
| APIClient (URLSession) | ApiClient (OkHttp + kotlinx.serialization) | GET with query params, error extraction |

### Components
| iOS | Android | Notes |
|-----|---------|-------|
| ArticleCardView (AsyncImage) | ArticleCard (Coil AsyncImage) | Hero image, title, summary, source, time, share |
| CategoryTabsView (horizontal scroll) | CategoryTabs (LazyRow + FilterChip) | Capsule pills with haptics |
| SkeletonView (opacity animation) | SkeletonCard (shimmer) | Loading placeholder |
| ErrorView (icon + retry) | ErrorContent | Retry button |
| EmptyStateView | EmptyContent | No results message |
| RelativeTimeText | relativeTimeString() | "2h ago", "just now", "Feb 8" |
| ReaderWebView (WKWebView) | WebView (Android) | CSP, dark mode CSS, JS height bridge |

### Key Behaviors
- Pull-to-refresh with `refresh=true` (PullToRefreshBox)
- Auto-retry on `complete: false` (cold cache only, skip on manual refresh)
- Stale request tracking (requestId counter)
- Search debounce (400ms via coroutine delay)
- Infinite scroll sentinel (LazyColumn item at end)
- WebView height reporting (JavaScript → WebView client)
- Dark mode CSS injection in reader HTML
- CSP meta tag in reader HTML
- Haptics on card tap + category select (VibrationEffect)
- Share via Intent.ACTION_SEND

---

## Dependencies

| Library | Version | Why |
|---------|---------|-----|
| Jetpack Compose + Material 3 | BOM 2024.12.01 | UI framework |
| Navigation Compose | 2.8.5 | Tab nav + reader route |
| kotlinx.serialization | 1.7.3 | JSON parsing |
| Coil 3 | 3.0.4 | Article thumbnail loading |
| OkHttp 4 | 4.12.0 | HTTP client |
| AndroidX WebKit | system | Reader view (no extra dependency) |

No Room, no Firebase, no Retrofit, no Hilt.

---

## Project Structure

```
android/ClearNews/
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/nikhilsi/clearnews/
│       │   ├── ClearNewsApplication.kt
│       │   ├── MainActivity.kt
│       │   ├── model/
│       │   │   ├── Article.kt
│       │   │   ├── Category.kt
│       │   │   └── ReaderContent.kt
│       │   ├── data/
│       │   │   └── ApiClient.kt
│       │   ├── state/
│       │   │   └── AppSettings.kt
│       │   ├── viewmodel/
│       │   │   └── ClearNewsViewModel.kt
│       │   ├── theme/
│       │   │   └── Theme.kt
│       │   ├── ui/
│       │   │   ├── navigation/NavGraph.kt
│       │   │   ├── home/
│       │   │   │   ├── HomeScreen.kt
│       │   │   │   ├── ArticleCard.kt
│       │   │   │   └── CategoryTabs.kt
│       │   │   ├── reader/
│       │   │   │   └── ReaderScreen.kt
│       │   │   ├── settings/
│       │   │   │   ├── SettingsScreen.kt
│       │   │   │   └── AboutScreen.kt
│       │   │   └── common/
│       │   │       ├── SkeletonCard.kt
│       │   │       ├── ErrorContent.kt
│       │   │       └── EmptyContent.kt
│       │   └── util/
│       │       ├── RelativeTime.kt
│       │       └── HapticManager.kt
│       └── res/
│           ├── mipmap-*/
│           └── values/strings.xml
├── build.gradle.kts
├── settings.gradle.kts
├── gradle/libs.versions.toml
├── keystore.properties          # Gitignored
└── keystore/clearnews-release.jks  # Gitignored
```

---

## Build Phases

### Phase 1: Scaffolding
- [x] Project setup (build.gradle.kts, version catalog, signing config)
- [x] Application class, MainActivity with edge-to-edge
- [x] Theme (Material 3 light + dark)
- [x] NavGraph with 2 tabs (Home, Settings)
- [x] ApiClient (OkHttp + JSON decoder, snake_case, ISO 8601 dates)
- [x] Data models (Article, Category, ReaderContent, API responses)
- [x] Update docs: android/ClearNews/README.md

### Phase 2: Article Feed
- [x] ClearNewsViewModel (articles StateFlow, pagination, stale tracking)
- [x] HomeScreen (pull-to-refresh, search, categories, article list)
- [x] ArticleCard (Coil image, title, summary, source, time, share)
- [x] CategoryTabs (LazyRow + FilterChip)
- [x] Infinite scroll sentinel
- [x] Auto-retry on complete=false (skip on manual refresh)
- [x] Search debounce (400ms)
- [x] Skeleton loading, error, empty states
- [x] Update docs: CURRENT_STATE.md (Android section started)

### Phase 3: Reader View
- [x] ReaderScreen with Android WebView
- [x] Dark mode CSS injection
- [x] CSP meta tag
- [x] JavaScript height reporting bridge
- [x] Font scaling from settings
- [x] External links → open in browser
- [x] Loading/error/failed states with fallback
- [x] Update docs: verify API contract matches

### Phase 4: Settings & About
- [x] AppSettings (SharedPreferences: theme, font scale)
- [x] SettingsScreen (theme picker, font size picker)
- [x] AboutScreen (version, description, attribution, links)
- [x] Apply colorScheme from settings
- [x] Update docs: android/ClearNews/README.md (features complete)

### Phase 5: Polish
- [x] Haptics (VibrationEffect on card tap + category select)
- [x] Accessibility (contentDescription, semantics)
- [x] Edge-to-edge display
- [x] App icon (generate from iOS icon at all densities)
- [x] ProGuard rules (kotlinx.serialization + OkHttp + Coil)
- [x] Test release build on emulator
- [x] Update docs: CURRENT_STATE.md (Android section complete)

### Phase 6: Release Pipeline
- [x] Generate signing keystore
- [x] keystore.properties (conditional for F-Droid)
- [x] .github/workflows/android-release.yml
- [x] fastlane/metadata/android/en-US/ (title, descriptions, changelog, screenshots)
- [x] fdroid/com.nikhilsi.clearnews.yml
- [x] Update README.md (Download section with APK, F-Droid, App Store, web)
- [x] Update README.md (project structure, tech stack)
- [x] Update CHANGELOG.md
- [x] Update NOW.md
- [x] Update CURRENT_STATE.md (final)
- [x] Update .gitignore (keystore files)

### Phase 7: Test & Release
- [x] Debug APK on emulator
- [x] Release APK build verification
- [x] APK size check (<10 MB target)
- [x] Tag v2.1.0 → GitHub Actions creates release
- [x] Submit F-Droid MR to gitlab.com/fdroid/fdroiddata
- [x] Final doc sweep

---

## API Configuration

The app points to the production API — no keys needed:
```kotlin
const val BASE_URL = "https://getclearnews.com"
```

Endpoints:
- `GET /api/v1/articles` — category, search, page, per_page, refresh
- `GET /api/v1/articles/reader?url=...` — extract article content
- `GET /api/v1/categories` — list with source counts
- `GET /health` — health check

---

## Notes

- Pattern follows GitaVani + TourGraph established conventions
- Conditional signing config for F-Droid compatibility
- No bundled data — entire app is a thin API client
- Reader WebView must match iOS security posture (CSP, sanitized HTML, external link interception)
