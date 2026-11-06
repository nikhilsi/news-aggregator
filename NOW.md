# NOW: Current Priorities

**Last Updated**: November 5, 2026

Shipped work lives in CHANGELOG.md; this file looks forward only.

## Now

**The apps** (all P1, Nikhil, Nov 1; not started, soon):
- **iOS 2.1** (#425): Today screen, story coverage, Fox and NPR marks, the reader display fixes, About text.
- **Android** (#426): the same, plus Android-only reader fixes.
- **Notifications** (#435): design first (morning edition, breaking stories, topic alerts; local or push), then the client work in #425 and #426.

**Sources whose stories don't open** (#453, P2): since Nov 1, BBC (all five feeds) and Smithsonian refuse the reader from Cloudflare, as NDTV and UPI Odd News always have. Nikhil, Nov 5: remove sources that don't give us the story and find replacements. The replacements are being tested through the reader; the change waits for his go on the list. The same task holds the cleanup misses from the Nov 5 measurement ([section 8](docs/reviews/2026-11-01-reader-investigation.md)).

**Watch for a few days** (no task needed; each brief build is logged and `worker/scripts/replay-brief.mjs` reruns any of them): repeats in Today, outlet balance, US politics coverage, the weak local story that sometimes fills slot 10, and Today shrinking to 9 when a picked story falls out of its source's newest 30.

Shipped on Nov 1 (see CHANGELOG): the move (#400), India cleanup (#413), #414 steps 1 to 3 (sources, the Today brief, the web Today page), the reader (#423, 3.5.0 and 3.5.1; findings in [docs/reviews/2026-11-01-reader-investigation.md](docs/reviews/2026-11-01-reader-investigation.md)), Fox politics and CNBC Business feeds (#416, 3.5.2).

## Ruled decisions that govern next steps

- General keeps a balance of right- and left-leaning outlets (Fox News and NPR News today).
- Hindi and other non-Latin headlines stay hidden in every tab.
- Privacy is not a design driver (Nikhil, Nov 1): don't lead with privacy or tracking arguments; when a feature changes what the privacy page or terms say, update them. No analytics today.
- Personalization is explicit (topics the reader picks), not learned from clicks (#414).
- No AI-written text on screen: AI groups, labels and ranks; every word shown is the publisher's.
- Today is an hourly edition. Deals, betting, quizzes, listicles and celebrity items are dropped from every tab; how-to, opinion and features stay in tabs but never reach Today.

## Later

- **On-device controls** (needs an iOS release): mute a source or topic, "less like this", stored on the phone.
- **Web smart sharing**: match Android's formatted share text with a ClearNews reader link.
- **iOS**: image caching if AsyncImage flicker shows; iPad layout.
- **Stale-feed alert** (#417): sources, the Today brief and reader failures; open question on the channel (lean: a daily GitHub Actions check of `/api/v1/status`).
- **Reader**: the feed's full text as a fallback, only when triggered (#424: a rerun of `worker/scripts/measure-reader.mjs` shows a source cut short).
- **Grok digest from X** (#415): an idea; needs an exception to no AI-written text.
