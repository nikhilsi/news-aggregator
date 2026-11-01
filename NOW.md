# NOW: Current Priorities

**Last Updated**: November 1, 2026

## Now

1. **India tab cleanup** (#413): switch Times of India to its India-only feed, keep each source's newest ~30 items, drop items older than a few days, filter roundup and junk posts (Scroll "Rush Hour", The Hindu "Mail - ... edition"), and fix the `strip_html` spacing (O17). Show before and after numbers on the live India tab.
2. **AI step design doc** (#414): group repeated stories by meaning ("covered by N outlets") and filter fluff (shopping deals, quizzes, horoscopes) in the cron, the same for every reader, no tracking. Costs first, then build.

## Done

- **Phase 1 to 13** (Feb to Mar 2026): backend, web, deployment, iOS app (App Store), performance, source expansion, content filtering, security hardening, Android app. History in CHANGELOG.md.
- **SEO and identity** (Jun 9, 2026): metadata, JSON-LD, footer, `/about`, OG card.
- **Move to Cloudflare** (Nov 1, 2026, #400): TypeScript Worker with a cron feed refresh, static site, GA removed, FMP replaced by RSS finance feeds, droplet deleted. See CURRENT_STATE.md.

## Later

- **On-device controls** (needs an iOS release): mute a source or topic, "less like this", stored and applied on the phone.
- **Web smart sharing**: match Android's formatted share text with a ClearNews reader link.
- **iOS**: smart sharing, image caching if AsyncImage flicker shows, iPad layout.
- **Stale-feed alert**: open question with Nikhil (lean: a daily GitHub Actions check that fails when `/api/v1/status` shows a stale feed).
