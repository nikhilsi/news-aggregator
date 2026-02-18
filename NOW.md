# NOW — Current Priorities

**Last Updated**: February 17, 2026

## Completed Phases

- **Phase 1: Backend** — `done` — FastAPI, sources, reader view, dedup, auth, caching
- **Phase 2: Web Frontend** — `done` — Next.js, article feed, reader modal overlay, dark mode, search, auth (v0.7.0)
- **Phase 3: Deployment** — `done` — Live at getclearnews.com, Docker Compose, nginx, SSL, firewall
- **Phase 4: iOS App** — `done` — SwiftUI, full feature parity with web (v1.0.0)
- **Phase 5: Performance** — `done` — SWR cache, startup warmup, force refresh, Cache-Control headers, web timeout/retry/refresh button (v1.1.0 + v1.2.0)
- **Phase 6: Async optimization** — `done` — Thread pool offloading for CPU-bound ops, dedup algorithm optimization, Docker cleanup (v1.3.0)
- **Phase 7: Source expansion + sorting** — `done` — Disabled Google News (performance), added 20 new RSS sources, 5 new categories (general, local, travel, india, offbeat expanded), simplified logging, two-tier article sorting (v1.4.0)
- **Phase 8: Cold cache performance** — `done` — Extended SWR stale window to 24h, progressive response with 3s deadline, dedup bucketed by category, categories moved to sources.yaml, Cache-Control fix (v1.6.0)
- **Phase 9: App Store submission** — `in progress` — Code hardened (v1.7.0), build uploaded, metadata/screenshots pushed via API, TestFlight tested, submitted for App Store review

See CHANGELOG.md for version history. See CURRENT_STATE.md for full feature inventory.

---

## Phase 9: App Store Submission — Current Progress

### Done
- [x] Code hardening: auth removed, force-unwraps fixed, deployment target → iOS 17.0
- [x] PrivacyInfo.xcprivacy added (UserDefaults CA92.1, no tracking, no collected data)
- [x] Accessibility labels on interactive controls
- [x] AboutView enhanced with content attribution + links to privacy/support
- [x] Privacy policy page live at getclearnews.com/privacy
- [x] Support page live at getclearnews.com/support
- [x] Support email configured: support@getclearnews.com
- [x] App registered on App Store Connect as "GetClearNews"
- [x] App icon finalized and added to Assets.xcassets/AppIcon.appiconset/
- [x] CFBundleDisplayName set to "ClearNews" (home screen name)
- [x] Build archived and uploaded to App Store Connect — v1.0 (build 1), VALID
- [x] Build attached to App Store version 1.0
- [x] All metadata pushed via App Store Connect API:
  - Subtitle: "News Without the Noise"
  - Description (1465 chars), Keywords (96/100 chars)
  - Privacy URL, Support URL, Marketing URL (getclearnews.com)
  - Categories: News (primary), Reference (secondary)
  - Age rating: 12+ (mild news content: horror/fear, mature themes, realistic violence)
  - Copyright: 2026 Nikhil Singhal
  - Content rights declaration
  - Review notes (976 chars) with contact info
  - Export compliance: no non-exempt encryption
- [x] Screenshots captured and uploaded (6 iPhone 6.9" + 5 iPad 13")
- [x] TestFlight: "Family Testers" group created, 3 testers added
- [x] Build submitted for beta review — state: WAITING_FOR_REVIEW
- [x] Beta review approved (Feb 13) — build assigned to "Family Testers" group, invitations sent
- [x] TestFlight tested on real device — all looks good
- [x] Pricing set to Free via API
- [x] App Privacy declaration published (no data collected) — manual step in App Store Connect
- [x] Submitted for App Store review (Feb 17) — state: WAITING_FOR_REVIEW

### Remaining
- [ ] App Store review approval (typically 24-48h)

**Reference:** docs/app-store-submission-playbook.md (learnings from GitaVani project)

---

## Future Enhancements

### Backend
- **Sentiment filter** — Add sentiment scores to articles. Options: HuggingFace model (FinBERT or general sentiment), or WorldNewsAPI.
- **Additional source types** — NewsAPI fetcher (WorldNewsAPI)
- **Trending topics** — Google Trends RSS, Wikipedia most-read, Hacker News top stories as trend signals

### Web Frontend
- **SSR** — Server-side rendering for SEO and link previews. Not needed for a personal app initially.
- **User settings page** — Preferences, profile editing, source toggles.
- **Landing page** — Public marketing-style page with value prop, login/signup CTA.

### iOS App
- **Image caching** — NSCache-based image cache if AsyncImage flicker becomes noticeable on fast scrolling.
- **iPad optimization** — NavigationSplitView for iPad-specific layout.
