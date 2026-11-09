# Notifications (#435): design

**Status:** ruled by Nikhil on Nov 9, 2026 (section 9). Nothing built. Revised the same day after an independent review: [reviews/2026-11-09-notifications-design-review.md](reviews/2026-11-09-notifications-design-review.md).  
**Task:** #435 (design), then the iOS client work in #425. Android is in #426.  
**Research:** two research passes on current Apple, Google, Android and Cloudflare docs (Nov 9, 2026), with key claims rechecked at the source. Sources are listed at the end.

---

## 1. What we are building

Nikhil, Nov 1, 2026: "for the apps, i want them to alert or notify users."

Three kinds of alert were on the table in #435:

- **Morning edition:** one notification a day, at a time the reader picks, with the top story of Today.
- **Breaking story:** a rare alert when many outlets cover one story at once. A few a week at most.
- **Topic alert:** a new story in a topic the reader follows.

This design builds the morning edition first, on iOS. Breaking alerts come second, after their rule is checked on live data. Topic alerts wait until the other two have been in use for a while.

The iOS 2.1 App Store release waits for this work (Nikhil, Nov 5). The release carries Today and notifications together.

---

## 2. What exists today

- **iOS app:** no notification code, no entitlements file, no background modes. iOS 17 and up. Bundle id `com.nikhilsi.ClearNews`, team `F66D7QPY4N`. It has a Settings screen (theme, font size) and an About screen.
- **Android app:** no notification code. Its manifest has only INTERNET and VIBRATE. minSdk 26, targetSdk 35. It has never been on Google Play, and the F-Droid listing request was closed in May 2026. It ships only as an APK on GitHub Releases. Few people use it. It has no Today screen yet (#426).
- **Server:** one Worker. The cron runs every minute inside a Durable Object (`Refresher`, pinned to Western North America) and rebuilds Today once an hour. `Refresher` is already declared with SQLite storage and uses none of it. Workers KV is written only by the cron. No database and no accounts.
- **Privacy page:** says no device IDs are sent and no personal information is stored. Push changes that (section 8).

---

## 3. How often would alerts fire (one week of briefs)

Every hourly brief is logged with the outlet count of each story. 164 briefs from Nov 2 to Nov 9 were read from the Worker logs.

| Most outlets a story reached | Stories |
|-|-|
| 1 | 277 |
| 2 | 82 |
| 3 | 34 |
| 4 | 12 |
| 5 | 4 |
| 6 | 2 |
| 7 | 5 |

The count is by headline. One event told in several headlines counts several times.

- **6 or more outlets:** 7 headlines. They are about three events: the midterm results (5 headlines), "Good riddance, Cybertruck!" and the Nvidia espionage story.
- **5 or more outlets:** 11 headlines, about six or seven events.

Two lessons for the breaking rule:

- **The bar is about right at 6 outlets.** That gives roughly three alerts in a week that held a national election. Most weeks are quieter.
- **Outlet count alone is not enough.** The Cybertruck item is an opinion piece that reached 6 outlets. The rule also needs the story to be news. The alert should use a news article's headline.

What the morning edition would have said at 7 AM on three of the days (the top story of the brief built just before):

- Wed Nov 4: NPR News: Democrats seize full control of Congress. And, which candidates made history last night
- Fri Nov 6: KIRO 7: A brutal sell-off for AI stocks sends Wall Street reeling, and the S&P 500 tumbles 4.4%
- Mon Nov 9: A.V. Club: UFC's Dana White appears to accept job offer to be Trump's new press secretary

---

## 4. Options

### Where the notification comes from

**On the phone, generic text.** The app schedules "Your morning edition is ready" every day at the chosen time.

- No server work, no Apple key, no privacy change.
- No headline. It is a reminder to open the app.

**On the phone, with a headline.** The app tries to refresh the text in the background before it fires.

- iOS fires the notification on time, every day.
- iOS cannot run our code at 7:00 to fetch a fresh headline. Background refresh is "opportunistic" (Apple, WWDC25). It may never run for an app opened rarely. Low Power Mode turns it off. Apple's own support engineer recommends server push for this exact case.
- So on iOS the headline is whatever the app last saw, often hours old.
- Breaking and topic alerts cannot work this way. Only the server knows when a story breaks.

**From the server (push).** The server sends each notification through Apple's push service.

- The headline is always current.
- The same pipe carries breaking alerts later.
- It needs a device list on the server, one key from Apple and a sender next to the cron.

### How the server reaches the phone

| Route | iOS | Android | Notes |
|-|-|-|-|
| **Apple's push service, called from the Worker** | Yes | No | Apple requires HTTP/2. Local `wrangler dev` can't do it. Deployed Workers can: a Cloudflare engineer says production requests go through Cloudflare's proxy. The proxy speaks HTTP/2 to Apple (workerd issue 4841, Aug 2025). Open-source projects send to Apple this way today. One did on Nov 4, 2026. Cloudflare's docs don't say it. We probe first (section 7). |
| **Firebase Cloud Messaging** | Only with Google's SDK in the iOS app | Yes | Free. Works over HTTP/1.1 from a Worker. On iOS it needs the Firebase SDK inside the app. Google's old route for raw Apple tokens is deprecated and will be removed on Sep 29, 2027. Works for an APK outside Google Play on phones that have Google Play. |
| **A hosted push service (OneSignal free tier)** | Yes | Yes | Up to 1,000 monthly users free. It still runs on Apple's and Google's services. It adds its own SDK to both apps and a vendor. No work saved at our size. |

---

## 5. Recommendation

- **Push from the server.** The headline in the notification is the point of the morning edition. Only push delivers it reliably on iOS. Breaking alerts need push anyway. It gets built once.
- **iOS through Apple's push service directly**, called from the Worker. No Firebase in the iOS app.
- **Android through Firebase**, built with the Android catch-up (#426). Android readers get what iPhone readers get, breaking alerts included. It needs a Google project, a second key and Google's library in the Android app. It works for the APK outside Google Play. The server is built so Android slots in later without rework.
- **Order:**
  1. The probe (section 7).
  2. Server: device list, sign-up endpoint, morning sender.
  3. iOS: the setting and the sign-up, in a new 2.1 build on TestFlight. The first morning edition that reaches Nikhil's iPhone is the final check. Then the App Store release.
  4. Breaking alerts: two weeks of logging what would have been sent, reviewed with Nikhil, then switched on.
  5. Android, with #426.
- **Web:** no browser notifications for now.

If the probe fails, iOS would need Firebase (Google's SDK in the app). That adds Google to the privacy pages and grows the 2.1 release. It comes back to Nikhil before anything is built.

---

## 6. Design

### 6.1 Server

**Device list.** A `devices` table in the `Refresher` Durable Object's own SQLite storage.

- No new Durable Object class. A new class needs a migration, and Cloudflare blocks `wrangler rollback` across one. The runbook's first rollback step stays possible.
- Not KV: KV is written only by the cron. That rule stays.
- Not D1: a second database to create and manage.

One row per device:

| Field | What it holds |
|-|-|
| `token` | The Apple push token (primary key) |
| `tz` | The phone's time zone, for example `America/Los_Angeles` |
| `morning` | Minutes after local midnight for the morning edition (420 is 7:00) |
| `sent_at` | When the last morning edition went out |
| `retry_at` | Set after a temporary Apple error, for one retry |
| `delivered_at` | When Apple last accepted a send for this device (empty until the first one) |
| `created_at`, `updated_at` | Bookkeeping |

A device with the morning edition off has no row. With #426 the table gains a `platform` field and the sender a Firebase path.

**Sign-up endpoint.** `POST /api/v1/notifications`, new and additive. The published paths and fields are untouched.

```json
{ "platform": "ios", "token": "…", "tz": "America/Los_Angeles", "morning": "07:00" }
```

- The app sends its whole state each time (section 6.2). The server replaces the row.
- `"morning": null` deletes the row.
- Answers `204` on success and `422` with a reason on bad input, like the other endpoints.
- Checks: `platform` is `ios` (the only one for now); token is hex, 64 to 200 characters; time is `HH:MM`. The time zone must be a named zone the runtime knows, older names such as `Asia/Calcutta` included. It is stored in the runtime's own spelling: `america/los_angeles` becomes `America/Los_Angeles`. Offsets such as `+05:30` are refused. Turning off works whatever the time zone says.
- JSON only: other content types get `415`. A web page can't post sign-ups from its visitors' browsers without a preflight.
- The body is limited to 2 KB before it is read (`413`).
- Its own rate limit: 10 requests a minute per address, a new limiter next to the existing two.
- A new time for the same device starts the day fresh: moving 22:00 to 07:00 doesn't skip the next morning. Not while the new time's hour is open: nudging 07:00 to 07:05 at 07:10, after the edition came, doesn't send it again.
- The list holds at most 1,000 devices. When it is full, a new sign-up replaces the oldest row that has never had a delivery. If every row has had one, the endpoint answers `503` and logs it.
- There are no accounts. The token is the identity. A made-up token gets an error from Apple on its first send and is deleted then.

**Sender.** Its own call from the cron handler, next to the refresh. Neither can hold up the other:

```ts
await Promise.allSettled([refresher(env).refresh(), refresher(env).sendMorning()]);
```

Each minute, `sendMorning`:

1. Picks the devices that are due. A device is due when the local time in its time zone is from its chosen time to 60 minutes after, it has no morning edition in the last 20 hours, and any `retry_at` has passed. The 60th minute counts: on a spring-forward day a 02:00 choice reads 03:00. The local clock is read with `Intl.DateTimeFormat` per row. Daylight-saving changes and a phone that changes time zone need no special code.
2. Does nothing when no device is due (no log line).
3. Skips when Today has no brief under 6 hours old (the same rule the Today tab uses). The devices stay due inside their 60 minutes. Past that, the morning is missed and logged.
4. Reads the brief's count and top story from KV (`ai` and `feed`, written by the cron).
5. For each device, claims it before sending: `sent_at` is written only if the row is as it was read. A second run that overlaps this one, or a reader who turned it off meanwhile, makes the claim a no-op. A crash or a deploy mid-send loses a morning edition rather than sending it twice.
6. Sends, with a 5-second timeout per request. It stops starting new sends after 10 seconds. Devices not reached stay due for the next minute.
7. Reads Apple's answer:

| Apple's answer | What the sender does |
|-|-|
| `200` | Sets `delivered_at`. |
| Any `410` (`Unregistered`, `ExpiredToken`) | Deletes the device. |
| `400 BadDeviceToken`, `400 DeviceTokenNotForTopic` | Deletes the device. |
| `403 ExpiredProviderToken` | Signs a new login token and retries once. |
| Other `403` (`InvalidProviderToken`, `BadEnvironmentKeyIdInToken`, `Forbidden`, `UnrelatedKeyIdInToken`), `400 BadTopic`, `400 TopicDisallowed` | A setup problem, not the device's. Stops this minute's sends, logs an error, touches no device. Treated as temporary: if Cloudflare's connection to Apple is shared in a way we can't see, these could come and go. |
| `429` (`TooManyRequests`, `TooManyProviderTokenUpdates`), any `5xx` | Keeps the current login token. Clears `sent_at` and sets `retry_at` 15 minutes ahead (Apple's guidance), while that is still inside the 60 minutes. A device gets up to five tries in its hour (minutes 0, 15, 30, 45 and 60). |
| Our own timeout or a dropped connection | Counts as sent. Apple may already have delivered, and a lost morning beats a doubled one. The minute stops there: a connection that fails at once would fail every device, and the rest go out next minute. |
| Anything else | Logs it and keeps the device. |

A `410` always deletes: it is Apple's word about one phone. A `400` that removes devices deletes them too, except when one reason is given for most of the minute's sends and at least two of those devices had a delivery before. Those are kept: the cause is likely ours, such as a wrong topic.

8. Logs one line when something was due: how many sent, and each failure with its reason and the token's first 8 characters. It logs as an error when nothing was sent and something failed.

The notification carries the count, the top story's outlet and headline (cut to 300 characters), and the story's address, title and outlet for the tap. If the whole payload would pass 3,500 bytes (Apple's limit is 4 KB), the address is left out and a tap opens Today.

The device tables are made on the first notification call, not when the object starts. Nothing here can touch the feed refresh.

**Apple request.** `POST https://api.push.apple.com/3/device/<token>`. Production only: TestFlight and App Store builds both use it. Xcode builds on a cable get no notifications. Testing happens on TestFlight.

- `authorization: bearer <JWT>`: ES256, signed with the Apple key through Web Crypto. Header `kid` (key id), claims `iss` (team id) and `iat`. Apple requires a new one at least every 60 minutes and at most every 20. It is kept in SQLite with its `iat` and re-signed after 50 minutes. A Durable Object restart then doesn't re-sign early.
- `apns-topic: com.nikhilsi.ClearNews`, `apns-push-type: alert`, `apns-priority: 10`.
- `apns-expiration`: two hours after sending. A phone that was off all morning doesn't get a stale edition at noon.
- `apns-collapse-id: morning`: a newer edition replaces an older one that was never shown.
- `redirect: 'manual'`. Workers reject `'error'`.

**Secrets and settings.**

- `APNS_KEY`: the `.p8` file's contents, as a Worker secret.
- `APNS_KEY_ID`, `APNS_TEAM_ID` (`F66D7QPY4N`) and the bundle id: Worker variables.
- Android, with #426: `FCM_SERVICE_ACCOUNT` (secret) and the Firebase project id.

### 6.2 iOS (#425, a new 2.1 build)

- **Capability:** Push Notifications in Xcode. This creates the app's first entitlements file (`aps-environment`). TestFlight and App Store builds use Apple's production service automatically.
- **Settings screen:** a "Morning edition" switch and a time picker, 7:00 AM by default.
- **Turning it on:** ask iOS for permission (alert and sound), then register for push. If the reader says no, the switch goes back off with a line on how to allow it in iOS Settings.
- **Keeping the server in step.** The app sends its whole state: the token iOS gives it, the time zone, and the time. It sends `null` when the switch is off or iOS permission is off. It sends:
  - right away when the switch or the time changes;
  - when the app comes to the front, at most once a day.

  The app asks iOS for the token every time and never keeps its own copy (Apple: "never cache device tokens"). This one rule also repairs a row the server lost, a failed "off" call, and permission turned off in iOS Settings.
- **Tapping the notification:** opens the top story in the reader, with Today behind it. The payload carries the story's address. By 9 AM Today may have moved on.
- **Not needed:** background modes, a notification extension, Firebase. Plain title and body only.
- **Interruption level:** normal (Apple's "active"). Apple reserves "time sensitive" for things like a package at the door, not news.
- **iOS 26 summaries:** a reader who turns on Apple Intelligence summaries for news apps may see our notification summarized by iOS. We can't turn that off. It is the reader's choice on their phone.

### 6.3 Android (#426)

Firebase push, built with the Android catch-up (Nikhil, Nov 9). The same morning edition and, later, breaking alerts.

- **Setup:** a Firebase project, `google-services.json` and the Firebase messaging library. Firebase is moving from registration tokens to installation ids in 2026. The server stores whatever id the library hands it and sends it in the field Firebase expects.
- **Permission:** ask for notification permission when the reader turns the switch on (Android 13 and up).
- **Channel:** one notification channel, "Morning edition", at default importance. "Breaking" gets its own channel later.
- **Settings and sign-up:** the same switch, time picker and whole-state rule as iOS, with `platform: "android"`.
- **Server:** a second sender path through Firebase's HTTP v1 API, with a Google service account login signed through Web Crypto. Firebase's own error answers get their own table, like Apple's in 6.1.
- **Limit:** Firebase needs Google Play on the phone. It does not need the app to come from Google Play.

### 6.4 Notification text

The words come from the brief: the story count plus the top story's outlet and headline. Every word of news is the publisher's, per the no-AI-text rule.

> **Today: 10 stories**  
> NPR News: Democrats seize full control of Congress. And, which candidates made history last night

### 6.5 Breaking alerts (later, sketched for review)

- **A story qualifies when:** it reaches 6 outlets for the first time, within 6 hours of its first article, and its headline article is labeled news (not opinion or feature).
- **Limits:** one alert per story. At most one a day per device. None between 10 PM and 7 AM in the phone's time zone.
- **Opt-in:** its own switch, off by default. Its field in the device list is added then, not now.
- **Before switching it on:** the cron logs every alert it would have sent for two weeks. Nikhil reviews that list and the bar is adjusted.

### 6.6 How readers find it

- Off until the reader turns it on. Apple requires asking first.
- The Settings switch is always there.
- One line at the end of Today, shown once: "Get this every morning at 7:00. Turn on". It goes away when tapped or dismissed.

---

## 7. Probe before building

The one unconfirmed fact: does `fetch()` from a Durable Object reach Apple's push service over HTTP/2?

- A throwaway Worker on the OmSpark account, separate from `clearnews`, with one Durable Object pinned to Western North America.
- It sends one request shaped like a send to `https://api.push.apple.com/3/device/<64 zeros>`: `POST`, the headers from 6.1, a small body, and `authorization: bearer x`. It returns Apple's answer.
- Apple answers only over HTTP/2. Over HTTP/1.1 its reply is unreadable (tested from this Mac, Nov 9). So `403 {"reason":"InvalidProviderToken"}` proves the HTTP/2 path and that the login header gets through. No key and no phone needed.
- Then the Worker is deleted.
- Needs Nikhil's go: it creates and deletes a Worker on the account.

The probe can't show how Cloudflare shares its connections to Apple. The first morning edition that reaches a TestFlight phone is the final check.

**Result (Nov 9, 2026, approved by Nikhil):** passed. The throwaway Worker `clearnews-apns-probe` was deployed, called 4 times, then deleted.

- Every call, from both the Durable Object and a plain Worker, got `403 {"reason":"InvalidProviderToken"}` with an `apns-id` from Apple.
- Each answer took 22 to 143 ms. The calls ran in SEA and SJC.
- After the delete, its address answered 404. The account held its usual four Workers, and `verify.mjs` passed 75 of 75 on production.

---

## 8. What Nikhil does

1. **Go on the probe** (section 7).
2. **Create the Apple push key:** developer.apple.com, Certificates, Identifiers and Profiles, Keys, new key with Apple Push Notifications service, environment **Production**. New keys are limited to one environment, at most two per environment. Download the `.p8` once. Claude files it under `~/.secrets/apple/` and puts it in the Worker as a secret (a Cloudflare write, with his go).
3. **Before the App Store release:** set the EU trader status in App Store Connect, and decide the App Store privacy answers (below).
4. **Android, with #426:** create a Firebase project and a service account key.

Pages to update when this ships:

- **Privacy page** (`web/public/privacy.html`). Three lines become untrue:
  - "We do not collect, store, or share any personal information."
  - App settings "never leave your device."
  - "No personal identifiers, device IDs, or location data are sent."

  New text says: when the reader turns on the morning edition, the app sends a push token, the chosen time and the time zone. They are used only to send it. They are deleted when it is turned off, or when Apple reports the app removed.
- **App privacy manifest** (`PrivacyInfo.xcprivacy`): today it declares no collected data. Update it to match.
- **App Store privacy answers:** sources disagree on whether a push token counts as a device ID there. Nikhil decides.

---

## 9. Rulings (Nikhil, Nov 9, 2026)

1. **The plan:** push from the server. The morning edition first, with the top story's headline. Off by default, with a Settings switch preset to 7:00 AM in the phone's own time zone, and a one-time line at the end of Today. Breaking alerts after two weeks of logging what they would have sent. (Option 1.A; the alternative was a generic reminder on the phone.)
2. **Android:** Firebase push with #426 (option 2.C). Android readers get what iPhone readers get. Nikhil hopes the audience grows on both platforms.
3. **The probe:** approved (option 3.A). It passed (section 7).

---

## 10. Testing

- **Unit tests:**
  - When a device is due: 01:30 and 02:30 on both US daylight-saving change days, 7:00 on those days, `Asia/Kolkata` and `Asia/Calcutta`, a phone that moved time zones, and the end of the 60-minute window.
  - One morning edition per day, even when the sender runs twice in a minute.
  - The endpoint's checks, its limit and the full-list rule.
  - The sender's handling of each Apple answer (mocked), and the stop when most of a minute fails alike.
  - A stale brief sends nothing.
- **Live checks:** `verify.mjs` gains a check that bad sign-ups are refused and store nothing.
- **On the phone:** a TestFlight build on Nikhil's iPhone set two minutes ahead, then the Worker logs.
- **Breaker pass** on the built server and app, per the build playbook.

---

## 11. Sources (read Nov 9, 2026)

- workerd issue 4841, "APNS HTTP/2 Requests via fetch() Failing on macOS but Working in Workers", Cloudflare's Workers lead, Aug 20, 2025: https://github.com/cloudflare/workerd/issues/4841
- A team sending to Apple from a Worker with plain `fetch()`, Nov 4, 2026: https://github.com/twitter-studio/notification-service/pull/26
- Cloudflare, rollbacks (blocked across a Durable Object class change): https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
- Cloudflare, Durable Object lifecycle (deploys during a request): https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- Cloudflare, Workers Web Crypto (ES256 signing): https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Apple, token-based connection to APNs (key environments, JWT refresh): https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- Apple, sending notification requests (headers, 4 KB limit): https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- Apple, responses from APNs (every error code, retry after 15 minutes): https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns
- Apple, `aps-environment` (TestFlight uses production): https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment
- Apple, registering with APNs ("never cache device tokens"): https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns
- Apple, WWDC25 session 227 on background work: https://developer.apple.com/videos/play/wwdc2025/227/
- Apple support engineer on refreshing a scheduled notification: https://developer.apple.com/forums/thread/125912
- Apple, Human Interface Guidelines, managing notifications (interruption levels): https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- App Store Review Guidelines 4.5.4 and 5.1.1: https://developer.apple.com/app-store/review/guidelines/
- Notification summaries for news apps in iOS 26, Jul 22, 2025: https://9to5mac.com/2025/07/22/ios-26-beta-4-re-enables-apple-intelligence-notification-summaries-for-news-apps/
- Google, FCM HTTP v1 send: https://firebase.google.com/docs/cloud-messaging/send/v1-api
- Google, Instance ID server API removal on Sep 29, 2027: https://developers.google.com/instance-id/reference/server
- Google, FCM Android client (apps outside Google Play): https://firebase.google.com/docs/cloud-messaging/android/client
- Android, notification permission: https://developer.android.com/develop/ui/views/notifications/notification-permission
- Android, alarms and Doze: https://developer.android.com/develop/background-work/services/alarms
- OneSignal pricing: https://onesignal.com/pricing
