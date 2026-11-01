# NOW: Current Priorities

**Last Updated**: November 1, 2026

Shipped work lives in CHANGELOG.md; this file looks forward only.

## Now

**Make ClearNews worth opening every morning** (#414). Proposal: [docs/414-worth-opening.md](docs/414-worth-opening.md). Mockup: a private artifact linked on #414.

- **Step 1, sources:** shipped as 3.2.0 on Nov 1. New AI, Physical AI and Space tabs; Crosscut, Ars Tech and Guardian Business fixed; Engadget and Seattle Eater dropped; Wired deals and CBS betting filtered.
- **Step 2, Today brief:** the first tab becomes a ranked brief of about 10 stories; repeats grouped by meaning; fluff dropped by a small model; no AI-written text. No app release needed.
- **Step 3, web:** the Today screen, story cards with coverage, Fox and NPR marks, interests kept in the browser.
- **Step 4, iOS 2.1:** an App Store release, Nikhil's call.

Nikhil approved the proposal on Nov 1: the step 1 table, Today plus Latest, and no AI-written text in step 2.

## Ruled decisions that govern next steps

- General keeps a balance of right- and left-leaning outlets (Fox News and NPR News today).
- Hindi and other non-Latin headlines stay hidden in every tab.
- No analytics and no tracking. Personalization, if any, is explicit and stored on the device.
- No AI-written text on screen in step 2: AI groups, labels and ranks; every word shown is the publisher's.

## Later

- **On-device controls** (needs an iOS release): mute a source or topic, "less like this", stored on the phone.
- **Web smart sharing**: match Android's formatted share text with a ClearNews reader link.
- **iOS**: image caching if AsyncImage flicker shows; iPad layout.
- **Stale-feed alert**: open question (lean: a daily GitHub Actions check of `/api/v1/status`).
