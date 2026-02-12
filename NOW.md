# NOW — Current Priorities

**Last Updated**: February 12, 2026

## Completed Phases

- **Phase 1: Backend** — `done` — FastAPI, 23 sources (21 RSS + 2 FMP), reader view, dedup, auth, caching
- **Phase 2: Web Frontend** — `done` — Next.js, article feed, reader modal overlay, dark mode, search, auth (v0.7.0)
- **Phase 3: Deployment** — `done` — Live at getclearnews.com, Docker Compose, nginx, SSL, firewall
- **Phase 4: iOS App** — `done` — SwiftUI, full feature parity with web (v1.0.0)
- **Phase 5: Performance** — `done` — Structured logging, SWR cache, startup warmup, force refresh, Cache-Control headers, web timeout/retry/refresh button (v1.1.0 + v1.2.0)
- **Phase 6: Async optimization** — `done` — Thread pool offloading for CPU-bound ops (reader extraction, feedparser, dedup, bcrypt), dedup algorithm optimization, Docker build cache cleanup in deploy script (v1.3.0)

See CHANGELOG.md for version history. See CURRENT_STATE.md for full feature inventory.

---

## Future Enhancements

### Backend
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI.
- **Additional source types** — NewsAPI fetcher (WorldNewsAPI)

### Web Frontend
- **SSR** — Server-side rendering for SEO and link previews. Not needed for a personal app initially.
- **User settings page** — Preferences, profile editing, source toggles.
- **Landing page** — Public marketing-style page with value prop, login/signup CTA.

### iOS App
- **App Store submission** — Screenshots, description, privacy policy, TestFlight distribution.
- **Image caching** — NSCache-based image cache if AsyncImage flicker becomes noticeable on fast scrolling.
- **iPad optimization** — NavigationSplitView for iPad-specific layout.
