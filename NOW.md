# NOW: Current Priorities

**Last Updated**: November 1, 2026

Shipped work lives in CHANGELOG.md; this file looks forward only.

## Now

**Make ClearNews worth opening every morning** (#414). Proposal: [docs/414-worth-opening.md](docs/414-worth-opening.md). Mockup: a private artifact linked on #414.

- **Step 1, sources:** shipped Nov 1 (3.2.0, see CHANGELOG).
- **Step 2, Today brief:** shipped Nov 1 (3.3.0, see CHANGELOG). Next: watch the first days of briefs (each build is logged) for repeats, outlet balance and missing US politics.
- **Step 3, web:** shipped Nov 1 (3.4.0, see CHANGELOG). Next: Nikhil tries it on the phone and desktop.
- **Step 4, iOS 2.1:** an App Store release, Nikhil's call.

Nikhil approved the proposal on Nov 1: the step 1 table, Today plus Latest, and no AI-written text in step 2.

**Reader view** (#423, P1, filed Nov 1): investigation in [docs/reviews/2026-11-01-reader-investigation.md](docs/reviews/2026-11-01-reader-investigation.md); server and web fixes shipped as 3.5.0, photos resized from getclearnews.com as 3.5.1. Open: the app display fixes (with iOS 2.1). The feed's full text waits for its trigger (#424).

## Ruled decisions that govern next steps

- General keeps a balance of right- and left-leaning outlets (Fox News and NPR News today).
- Hindi and other non-Latin headlines stay hidden in every tab.
- No analytics and no tracking. Personalization, if any, is explicit and stored on the device.
- No AI-written text on screen in step 2: AI groups, labels and ranks; every word shown is the publisher's.
- Today is an hourly edition. Deals, betting, quizzes, listicles and celebrity items are dropped from every tab; how-to, opinion and features stay in tabs but never reach Today.

## Later

- **On-device controls** (needs an iOS release): mute a source or topic, "less like this", stored on the phone.
- **Web smart sharing**: match Android's formatted share text with a ClearNews reader link.
- **iOS**: image caching if AsyncImage flicker shows; iPad layout.
- **Stale-feed alert** (#417): open question on the channel (lean: a daily GitHub Actions check of `/api/v1/status`).
- **Source decisions** (#416): Fox politics feed, CNBC Business, Sunny Skyz; revisit after step 2.
