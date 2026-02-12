# NOW — Current Priorities

**Last Updated**: February 11, 2026

## Completed Phases

- **Phase 1: Backend** — `done` — FastAPI, 23 sources (21 RSS + 2 FMP), reader view, dedup, auth, caching
- **Phase 2: Web Frontend** — `done` — Next.js, article feed, reader modal overlay, dark mode, search, auth (v0.7.0)
- **Phase 3: Deployment** — `done` — Live at getclearnews.com, Docker Compose, nginx, SSL, firewall

See CHANGELOG.md for version history. See CURRENT_STATE.md for full feature inventory.

### Web polish (pending, low priority)
- [ ] Visual review in browser (both light and dark mode)
- [ ] Test all user flows (browse, filter, search, login/logout, dark mode toggle)
- [ ] Mobile responsiveness check

---

## Phase 4: iOS App — `in progress`

Native SwiftUI app consuming the same backend API. Full feature parity with web.
See **iosplan.md** for the full architecture and implementation plan.

### 1. Project setup + models + API client — `pending`
- [ ] Xcode project (iOS 17+, SwiftUI lifecycle, universal iPhone + iPad)
- [ ] Folder structure per iosplan.md
- [ ] Codable model structs matching backend API
- [ ] APIClient (URLSession wrapper, base URL, error handling, JWT injection)
- [ ] Verify connectivity: call GET /health

### 2. Article feed (end-to-end) — `pending`
- [ ] ArticleService (@Observable: fetch, state, stale request handling)
- [ ] ArticleCardView (AsyncImage, title, summary, source, time)
- [ ] ArticleListView (LazyVStack, loading/error/empty states)
- [ ] Basic HomeView

### 3. Categories + filtering — `pending`
- [ ] CategoryService (fetch from API)
- [ ] CategoryTabsView (horizontal scroll pills)
- [ ] Wire into HomeView + ArticleService

### 4. Pagination + infinite scroll — `pending`
- [ ] loadMore() in ArticleService
- [ ] Infinite scroll sentinel (onAppear)
- [ ] Pull-to-refresh
- [ ] Skeleton loading + end-of-feed states

### 5. Search — `pending`
- [ ] .searchable + debounced .task(id:) (400ms)

### 6. Reader view — `pending`
- [ ] ReaderWebView (UIViewRepresentable wrapping WKWebView)
- [ ] ReaderView (.sheet with loading/success/fallback states)

### 7. Settings + theme — `pending`
- [ ] AppSettings (@Observable: appearance, font scale, UserDefaults)
- [ ] SettingsView (theme picker, font size, about)
- [ ] TabView (Home + Settings)

### 8. Authentication — `pending`
- [ ] KeychainHelper (Security framework)
- [ ] AuthService (login, logout, token validation)
- [ ] LoginView (email + password form)

### 9. Polish — `pending`
- [ ] Error/empty/loading states on all views
- [ ] RelativeTimeText, shimmer animations
- [ ] Test on iPhone + iPad physical devices

---

## Future Enhancements

Deferred until iOS app is shipped.

### Backend
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI.
- **Additional source types** — NewsAPI fetcher (WorldNewsAPI)

### Web Frontend
- **Performance review** — Audit and fix perceived performance issues: reader view load time, modal transitions.
- **SSR** — Server-side rendering for SEO and link previews. Not needed for a personal app initially.
- **User settings page** — Preferences, profile editing, source toggles.
- **Landing page** — Public marketing-style page with value prop, login/signup CTA.
