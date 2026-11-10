# NOW: Current Priorities

**Last Updated**: November 9, 2026

Shipped work lives in CHANGELOG.md; this file looks forward only.

## Now

**The apps** (all P1, Nikhil, Nov 1):
- **iOS 2.1** (#425): the Must items are built (Today screen, story coverage, Fox and NPR marks, reader display fixes, About text), plus the morning edition and breaking news (#435, #487, build 6), not on the App Store yet. On TestFlight: Apple approved the 2.1 (3) beta on Nov 6. Nikhil and Urmila use it daily and walk `docs/ios-2.1-test-checklist.md`. #488 is done (Nov 9). 2.1 build 6 was submitted for App Store review on Nov 9 and releases when Apple approves. The Should items are not built: topic sections (#501) and "new since your last visit" (#502), both P2.
- **Android** (#426): the same, plus Android-only reader fixes and Firebase push for notifications.
- **Notifications:** the iOS morning edition (#435, closed) and breaking news (#487) shipped on Nov 9 ([docs/435-notifications-design.md](docs/435-notifications-design.md)). Server 3.8.0; 2.1 build 6 on TestFlight; both sent and tapped on Nikhil's iPhone.
  - 2.1 (build 6) submitted for App Store review on Nov 9, 2026 with new screenshots and store text (`appstore/`). It goes live automatically when Apple approves (Nikhil's go, Nov 9).
  - Watch the `breaking story` logs for a few days: on Nov 9 nothing reached 5 outlets while fresh. Lower the bar to 4 if real stories keep missing.
  - Android notifications come with #426 (Firebase).

**Watch for a few days** (no task needed): the six sources added on Nov 5 (3.6.1) in `/api/v1/status` and on the phone, then a full `measure-reader.mjs run`. In the hourly briefs (each is logged; `worker/scripts/replay-brief.mjs` reruns any of them): repeats in Today, outlet balance, US politics coverage, the weak local story that sometimes fills slot 10, and Today shrinking to 9 when a picked story falls out of its source's newest 30.

Shipped on Nov 6 (see CHANGELOG): the reader cleanup from the Nov 5 measurement and Today's outlet count (#453, 3.6.2 and 3.6.3). On Nov 5: the reader measurement script (#436), iOS 2.1's Must items built (#425), the sources whose stories never open replaced (#453, 3.6.1). On Nov 1: the move (#400), India cleanup (#413), #414 steps 1 to 3 (sources, the Today brief, the web Today page), the reader (#423, 3.5.0 and 3.5.1; findings in [docs/reviews/2026-11-01-reader-investigation.md](docs/reviews/2026-11-01-reader-investigation.md)), Fox politics and CNBC Business feeds (#416, 3.5.2).

## Ruled decisions that govern next steps

- A source whose stories don't open in the reader goes, and gets a replacement that does (Nikhil, Nov 5): "its a stupid experience to have sources that dont show the story." Every candidate is tested through production's reader first.
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
