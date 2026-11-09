# Notifications design (#435): independent review and answers

**Date:** November 9, 2026  
**Reviewed:** the first draft of [`docs/435-notifications-design.md`](../435-notifications-design.md), against the Worker code (`cron.ts`, `refresher.ts`, `index.ts`, `api.ts`, `ai/`), `wrangler.jsonc`, the deploy runbook, `web/public/privacy.html`, the iOS app, and current Apple, Google, Android and Cloudflare docs.  
**Reviewer:** a separate agent that did not write the design. It changed no files.  
**Answers:** by the author. Every finding is answered below. The design doc was revised the same day.

**Summary:** the reviewer agreed with the direction: push from the server, iOS direct to Apple. It found 12 issues, 2 high and 4 medium. The sender and the way the app keeps the server in step had bugs as written. All 12 are taken. One part of finding 6 is declined.

Two claims were rechecked at the source before answering:

- **Finding 1:** in a run that builds a brief, the read-ahead runs to 2 seconds before the 40-second deadline (`cron.ts`, step 8). A sender after it starts at about 38 seconds.
- **Finding 5:** Cloudflare's rollback page says rollbacks are not allowed across "a Durable Object class lifecycle change" made through the migrations array.

| # | Finding | Severity | Answer |
|-|-|-|-|
| 1 | The sender at the end of the cron run can send twice, send late, or push the run past a minute | High | Taken |
| 2 | "Send again if the token changed" means caching the token, and lost rows never heal | High | Taken |
| 3 | A Production-only key contradicts the sandbox route | Medium | Taken |
| 4 | Apple's answers are only partly handled | Medium | Taken |
| 5 | A new Durable Object class blocks `wrangler rollback`; `Refresher` already has SQLite | Medium | Taken |
| 6 | Anyone can fill the sign-up list | Medium | Taken in part |
| 7 | `next_at` and the time zone math invite daylight-saving bugs | Medium | Taken |
| 8 | Privacy page and App Store paperwork under-scoped | Low to medium | Taken |
| 9 | Tighten the probe; keep the login token in storage | Low | Taken |
| 10 | Over-built and Android-unready pieces | Low | Taken |
| 11 | The Android alarm is weaker than the draft said | Low | Taken |
| 12 | What the reader sees on tap and on the lock screen | Low | Taken |

---

## 1. The sender inside the cron run (high)

**Finding:**

- The draft put the sender at the end of each cron run. After a new brief, the read-ahead already uses the run's time up to 2 seconds before its 40-second deadline.
- The sender had no time budget and no per-request timeout. A slow call to Apple could stretch the run past 60 seconds. Two runs would then work at once in the same object and pick the same devices.
- A deploy mid-send would lose the "sent" mark and send again.
- After a cron outage every device would get its "morning" edition late, say at 3 PM.
- If the refresh threw, nothing would be sent.

**Answer: taken.** Section 6.1 now has:

- **Its own call:** `sendMorning()` runs next to `refresh()` through `Promise.allSettled`. Neither holds up the other.
- **Time limits:** a 5-second timeout per request, and no new sends after 10 seconds.
- **Marked first:** `sent_at` is written before each send. A crash loses a morning rather than doubling it.
- **No late sends:** a device is due only within 60 minutes of its chosen time.

## 2. Keeping the server in step with the phone (high)

**Finding:**

- "Send again if the token or time zone changed" needs a stored copy to compare against. Apple says never to cache device tokens.
- A row lost on the server (a deletion, a failed call, the cap) never comes back. The app believes it is signed up and nothing arrives.
- A reader who turns notifications off in iOS Settings still gets `200` from Apple. The server would keep sending, and the privacy line "deleted when turned off" would be false for that path.

**Answer: taken.** Section 6.2 now has:

- **Whole state, every time:** the app sends token, time zone and time. It sends `null` when the switch or iOS permission is off.
- **When:** right away on a change, and on coming to the front at most once a day.
- **The token:** the app asks iOS for it every time and keeps no copy.
- **What the server does:** replaces the row, and deletes it on `null`. Lost rows, failed calls and permission turned off in iOS Settings all heal the next day.

## 3. Sandbox versus a Production-only key (medium)

**Finding:**

- New Apple keys work in one environment only. The draft created a Production key but also sent to the sandbox for Xcode builds. Those sends would fail with `BadEnvironmentKeyIdInToken`.
- The app can't read its own environment. The `env` field would be a guess. A wrong guess deletes the device.

**Answer: taken.**

- **Production only.** The `env` field and the sandbox host are gone.
- **Testing:** on TestFlight. TestFlight uses production. Section 10 already planned it.

## 4. Apple's answers (medium)

**Finding:** the draft handled only some of Apple's answers. Missing or wrong:

- `410 ExpiredToken` and `400 DeviceTokenNotForTopic`.
- 403s and 400s that mean our setup is wrong, not the device.
- The two meanings of 429.
- A default for anything else.
- A retry every minute for 5xx, where Apple says wait 15 minutes.

**Answer: taken.** Section 6.1 now has a table for every answer:

- **Deletes the device:** any 410, `BadDeviceToken`, `DeviceTokenNotForTopic`.
- **Stops the minute, touches nothing:** setup errors.
- **One retry 15 minutes later:** 5xx and `TooManyRequests`, if still inside the 60 minutes.
- **Keeps the current login token:** `TooManyProviderTokenUpdates`.
- **Logs and keeps the device:** anything else.
- **Guard:** if most sends in one minute fail alike, the sender stops and deletes nothing.

## 5. A new Durable Object class (medium)

**Finding:**

- A new `Notifier` class needs a migration. Cloudflare blocks `wrangler rollback` across one, and that is the runbook's first rollback step.
- `Refresher` is already declared with SQLite storage and uses none of it.
- Pinning a second object to Western North America adds nothing. Apple doesn't care where requests come from.

**Answer: taken.** Rechecked on Cloudflare's rollback page. The `devices` table lives in `Refresher`'s own SQLite. That means no migration, no new binding and no calls between objects.

## 6. Filling the sign-up list (medium)

**Finding:**

- At the shared limit of 100 requests per 10 seconds, a script fills the 1,000-row cap in under two minutes and can keep it full.
- Fake tokens also make Apple slow down our sends to readers.
- Suggested: a tight limiter of its own, a silent test push at sign-up, and evicting never-delivered rows when full.

**Answer: taken in part.**

- **Taken:** the endpoint gets its own limiter (10 a minute per address). When the list is full, a sign-up replaces the oldest row that has never had a delivery.
- **Declined:** the silent test push at sign-up. It adds a second kind of send and an Apple call to every sign-up. At a handful of readers, the limiter and the eviction rule are enough. Revisit if the logs ever show junk sign-ups.

## 7. Daylight saving and `next_at` (medium)

**Finding:**

- A stored next-send time in UTC invites daylight-saving bugs: 01:30 happens twice in the fall, and 02:30 doesn't exist in the spring.
- Tests at the 7:00 default would never hit the change. It happens at 2 AM.
- iOS can report older time zone names (`Asia/Calcutta`). A check against the runtime's canonical list would reject them.

**Answer: taken.**

- **No stored next time:** each minute the sender reads each row's local clock. A device is due between its time and 60 minutes after, with no edition in the last 20 hours.
- **Time zone check:** the `Intl.DateTimeFormat` constructor. It accepts older names.
- **Tests:** 01:30 and 02:30 on both change days, `Asia/Kolkata` and `Asia/Calcutta`, and a phone that moved.

## 8. Privacy page and App Store paperwork (low to medium)

**Finding:**

- Three lines of the privacy page become untrue, not one.
- Apple's guideline 5.1.1 asks for retention and deletion terms.
- The app's privacy manifest declares no collected data.
- Whether a push token counts as a device ID in the App Store privacy answers is disputed.

**Answer: taken.** Section 8 now lists the three lines, the new text with when data is deleted, the privacy manifest update, and the App Store privacy answers as Nikhil's call.

## 9. The probe and the login token (low)

**Finding:**

- The probe's logic is sound: Apple answers only over HTTP/2. It should send a `POST` shaped like a send, with a dummy login header, and expect `403 InvalidProviderToken`. That also proves the header gets through.
- The probe can't show how Cloudflare's proxy shares connections to Apple between customers. If it shares them, that could cause 403s that come and go.
- A login token kept only in memory is lost on every restart of the object. The sender could then re-sign too often.

**Answer: taken.**

- **Probe:** section 7 sends a request shaped like a send, with a dummy login header, and expects `InvalidProviderToken`.
- **Setup 403s:** treated as temporary. They are logged, and no device is touched.
- **Login token:** stored in SQLite with its issue time.
- **Final check:** the first morning edition that reaches Nikhil's iPhone on TestFlight.

## 10. Over-built and Android-unready pieces (low)

**Finding:**

- The `breaking` field existed before breaking alerts do.
- A count cap where a time budget fits better.
- A log line every minute.
- `platform: android` accepted with no Android sender.
- A token rule that would reject Firebase ids.

**Answer: taken.**

- **Dropped:** the `breaking` field and the count cap. A 10-second budget replaces the cap.
- **Logging:** only when something was due.
- **Platform:** only `ios` is accepted.
- **Firebase ids:** moot with no Android push.

## 11. The Android alarm (low)

**Finding:** the draft made Android's phone-scheduled alarm sound more dependable than Android's docs say. Exact alarms need a permission that isn't pre-granted for apps targeting Android 13 and up. Inexact alarms can be an hour late. The reviewer read this as support for Firebase on Android.

**Answer: taken.** Nikhil first noted that the Android app was never on Google Play and has few users. For a short while the design dropped Android push for a phone alarm. He then ruled for Firebase push on Android with #426 (Nov 9). Android readers get breaking alerts too. Section 6.3 now describes Firebase push. The phone-alarm option is gone.

## 12. Tap and lock screen (low)

**Finding:**

- Tapping opens Today. By 9 AM Today may no longer hold the story in the notification.
- iOS 26 can summarize news-app notifications when the reader opts in. No developer opt-out was found.

**Answer: taken.**

- **Tap:** opens the notified story in the reader, with Today behind it. The payload carries its address.
- **iOS summaries:** section 6.2 notes them as the reader's choice on their phone.

---

## The reviewer's notes on the decision list

- **Add the cheapest alternative.** A generic reminder scheduled on the phone: no server, no key, no privacy change, no headline. *Answer:* added to section 4 and to decision 1.
- **Say what happens if the probe fails.** Firebase in the iOS app changes the privacy pages and grows the release. *Answer:* added to section 5. It comes back to Nikhil before anything is built.

## Checked and found correct by the reviewer

- **Section 2 facts:** the app and project facts.
- **Login token rules:** Apple's JWT rules and the two-keys-per-environment limit.
- **Request details:** the headers, the 4 KB limit, and TestFlight using production.
- **Guideline 4.5.4:** read in full. An opt-in morning edition meets it.
- **Workers runtime:** workerd rejects `redirect: 'error'` (its source code).
- **Evidence:** workerd issue 4841 and the Nov 4, 2026 pull request say what the draft said. That pull request signed its login token on a Mac. Signing inside a Worker is still untested by it.
- **Signing:** an Apple P-256 key imports and signs in Node's Web Crypto. Not run in workerd.
- **Google:** the Instance ID removal date and OneSignal's free tier.
- **Section 3:** the brief counts add up.

Not verified by the reviewer: the WWDC25 session details and Firebase's page on apps outside Google Play.
