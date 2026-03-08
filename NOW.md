# NOW — Current Priorities

**Last Updated**: March 7, 2026

## Completed Phases

- **Phase 1: Backend** — `done` — FastAPI, sources, reader view, dedup, caching
- **Phase 2: Web Frontend** — `done` — Next.js, article feed, reader modal overlay, dark mode, search (v0.7.0)
- **Phase 3: Deployment** — `done` — Live at getclearnews.com, Docker Compose, nginx, SSL, firewall
- **Phase 4: iOS App** — `done` — SwiftUI, full feature parity with web (v1.0.0)
- **Phase 5: Performance** — `done` — SWR cache, startup warmup, force refresh, Cache-Control headers, web timeout/retry/refresh button (v1.1.0 + v1.2.0)
- **Phase 6: Async optimization** — `done` — Thread pool offloading for CPU-bound ops, dedup algorithm optimization, Docker cleanup (v1.3.0)
- **Phase 7: Source expansion + sorting** — `done` — Disabled Google News (performance), added 20 new RSS sources, 5 new categories (general, local, travel, india, offbeat expanded), simplified logging, two-tier article sorting (v1.4.0)
- **Phase 8: Cold cache performance** — `done` — Extended SWR stale window to 24h, progressive response with 3s deadline, dedup bucketed by category, categories moved to sources.yaml, Cache-Control fix (v1.6.0)
- **Phase 9: App Store submission** — `done` — Code hardened (v1.7.0), build uploaded, metadata/screenshots pushed via API, TestFlight tested, app live on App Store
- **Phase 10: Content filtering** — `done` — India Today visual stories (ad) filter, non-Latin article filter for non-India tabs (v1.8.0)
- **Phase 11: Refresh performance** — `done` — Non-blocking refresh, background refresh loop, conditional HTTP requests with ETag/Last-Modified (v1.9.0)
- **Phase 12: Security hardening + auth removal** — `done` — Comprehensive code review, SSRF protection, nh3 HTML sanitization, DOMPurify client-side, iOS WebView CSP, @MainActor concurrency, .dockerignore, multi-stage Docker builds, nginx security headers, auth system removed (v2.0.0)
- **Phase 13: Android app** — `done` — Kotlin + Jetpack Compose, full feature parity with iOS, smart sharing, GitHub Actions CI/CD, F-Droid metadata (v2.1.0)

See CHANGELOG.md for version history. See CURRENT_STATE.md for full feature inventory.

---

## Future Enhancements

### Backend
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI.
- **Additional source types** — NewsAPI fetcher (WorldNewsAPI)
- **Trending topics** — Google Trends RSS, Wikipedia most-read, Hacker News top stories as trend signals

### Web Frontend
- **SSR** — Server-side rendering for SEO and link previews.
- **Smart sharing** — Match Android's formatted share text with ClearNews reader link.

### iOS App
- **Smart sharing** — Match Android's formatted share text with ClearNews reader link.
- **Image caching** — NSCache-based image cache if AsyncImage flicker becomes noticeable on fast scrolling.
- **iPad optimization** — NavigationSplitView for iPad-specific layout.

### Android App
- **F-Droid approval** — MR submitted ([#34426](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/34426)), awaiting review.
- **Image caching tuning** — Coil disk cache size configuration if needed.
