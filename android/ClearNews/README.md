# ClearNews for Android

A clean, native Android news reader built with Jetpack Compose and Material 3.

## Features

- **Article Feed** — Pull-to-refresh, category filtering, search with debounce, infinite scroll
- **Reader View** — Clean article content in WebView with dark mode CSS, font scaling, CSP
- **Auto-retry** — Automatically retries on cold cache (partial data), skips on manual refresh
- **Settings** — Theme picker (system/light/dark), reader font size (S/M/L/XL)
- **Share** — Share articles via Android share sheet
- **Haptics** — Light haptic feedback on card tap and category selection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Jetpack Compose + Material 3 |
| State | AndroidViewModel + StateFlow |
| HTTP | OkHttp 4 |
| JSON | kotlinx.serialization |
| Images | Coil 3 |
| Storage | SharedPreferences |

No Room, no Firebase, no Retrofit, no Hilt.

## Architecture

```
MainActivity
├── ClearNewsTheme (Material 3, light/dark/system)
├── NavGraph (2 tabs: Home, Settings)
│   ├── HomeScreen
│   │   ├── CategoryTabs (LazyRow + FilterChip)
│   │   └── ArticleCard (Coil image, share)
│   ├── SettingsScreen (theme, font size)
│   └── AboutScreen (version, links)
└── ReaderScreen (overlay, WebView, CSP)
```

**ViewModel** manages all state:
- Articles with pagination and stale request tracking
- Categories (fetched once on init)
- Reader content (loading/error/failed/ok)
- Search with 400ms coroutine debounce

**ApiClient** is a singleton OkHttp client pointing to `getclearnews.com`.

## Building

```bash
# Debug APK
./gradlew assembleDebug

# Release APK (requires keystore.properties)
./gradlew assembleRelease

# Release AAB
./gradlew bundleRelease
```

**Requirements:**
- Android Studio Ladybug or later
- JDK 17+ (bundled with Android Studio)
- Android SDK 35

## Project Structure

```
app/src/main/java/com/nikhilsi/clearnews/
├── ClearNewsApplication.kt    # Application class
├── MainActivity.kt            # Single activity, edge-to-edge
├── model/                     # Article, Category, ReaderContent
├── data/                      # ApiClient (OkHttp)
├── state/                     # AppSettings (SharedPreferences)
├── viewmodel/                 # ClearNewsViewModel (StateFlow)
├── theme/                     # Material 3 theme
├── ui/
│   ├── navigation/            # NavGraph (tabs + reader overlay)
│   ├── home/                  # HomeScreen, ArticleCard, CategoryTabs
│   ├── reader/                # ReaderScreen (WebView)
│   ├── settings/              # SettingsScreen, AboutScreen
│   └── common/                # SkeletonCard, ErrorContent, EmptyContent
└── util/                      # RelativeTime, HapticManager
```
