# NOW: Current Priorities

**Last Updated**: November 9, 2026

Shipped work lives in CHANGELOG.md; this file looks forward only.

## Now

**Open tasks, all of them** (CenterEye, area clearnews, Nov 9, 2026): #425, #426, #417, #501, #502, #424, #415. Anything else is closed or has no task yet (see Later).

**In flight**
- **iOS 2.1 App Store release** (#425, P1): build 6 has been in Apple's review since Nov 9. It goes live automatically when Apple approves (Nikhil's go, Nov 9). Close #425 once it is live. Apple's status emails reach nikhilsi@gmail.com since Nov 9 (every App Store Connect notification was off until then). Status: App Store Connect, Apps, GetClearNews, or the API (`docs/app-store-submission-playbook.md`).
- **Watch, no task:**
  - The `breaking story` log lines for a few days. On Nov 9 nothing reached 5 outlets while fresh (Boeing's job cuts and the Massie articles had 3). Lower the bar to 4 (`BREAKING_MIN_OUTLETS` in `worker/wrangler.jsonc`, then deploy) if real stories keep missing.
  - The `morning edition` log lines: sends, failures, removals.
  - The six sources added on Nov 5 (3.6.1) in `/api/v1/status`, then a full `measure-reader.mjs run`.
  - The hourly briefs (each is logged; `worker/scripts/replay-brief.mjs` reruns any of them): repeats in Today, outlet balance, US politics coverage, the weak local story that sometimes fills slot 10, and Today shrinking to 9 when a picked story falls out of its source's newest 30.

**Next, in order** (Claude's proposal, Nov 9; Nikhil confirms the order)
1. **Android catch-up** (#426, P1): the Today screen, "Covered by", Fox and NPR marks, the reader fixes, then notifications through Firebase. Needs Nikhil to create a Firebase project and a service account key. The app is 1.0.0, shipped as an APK on GitHub Releases.
2. **Stale-feed alert** (#417, P2): today nothing tells Nikhil when a source stops updating.
3. **iOS 2.2** (P2): topic sections under Today (#501) and "new since your last visit" (#502), shipped together. The web has both.

**Parked:** #424 (the feed's own text when a page can't be read; only when a measurement shows a source cut short) and #415 (a Grok-written digest from X; needs an exception to the no-AI-text rule).

**Shipped recently** (details in CHANGELOG): Nov 9: the iOS morning edition (#435, 3.7.0), breaking news (#487, 3.8.0), the privacy page and App Store prerequisites (#488), iOS 2.1 submitted. Nov 6: reader cleanup and Today's outlet count (#453, 3.6.2 and 3.6.3). Nov 5: the reader measurement script (#436), iOS 2.1's Must items, sources that never open replaced (3.6.1). Nov 1: the move to Cloudflare (#400), India cleanup (#413), #414 steps 1 to 3, the reader (#423), Fox politics and CNBC Business feeds (#416).

## Ruled decisions that govern next steps

- A source whose stories don't open in the reader goes, and gets a replacement that does (Nikhil, Nov 5): "its a stupid experience to have sources that dont show the story." Every candidate is tested through production's reader first.
- General keeps a balance of right- and left-leaning outlets (Fox News and NPR News today).
- Hindi and other non-Latin headlines stay hidden in every tab.
- Privacy is not a design driver (Nikhil, Nov 1): don't lead with privacy or tracking arguments; when a feature changes what the privacy page or terms say, update them. No analytics today.
- Personalization is explicit (topics the reader picks), not learned from clicks (#414).
- No AI-written text on screen: AI groups, labels and ranks; every word shown is the publisher's.
- Today is an hourly edition. Deals, betting, quizzes, listicles and celebrity items are dropped from every tab; how-to, opinion and features stay in tabs but never reach Today.
- Notifications (Nov 9): push from the server, off until the reader turns them on, on the phone's own clock. The morning edition at the reader's time; breaking news at most once a day, never 10 PM to 7 AM, bar 5 outlets and a news article of importance 4 or 5. Android gets the same through Firebase. Testers are Nikhil and Urmila.
- EU: not a trader under the Digital Services Act (Nov 9; set since Nov 6, account-wide, covers GitaVani too).
- App Store text gets a pass for AI tells before any submission (Nov 9). App Store submission and release each need Nikhil's go.
- GitaVani shares the Apple developer account. Its Claude Code session and ClearNews's coordinate App Store Connect and phone use by cross-session message.

## Later (no task yet; give one a task before starting it)

- **On-device controls** (needs an iOS release): mute a source or topic, "less like this", stored on the phone.
- **Web smart sharing**: match Android's formatted share text with a ClearNews reader link.
- **iOS**: image caching if AsyncImage flicker shows; iPad layout.
- **Web notifications**: browser push was left out of #435 (apps only).
