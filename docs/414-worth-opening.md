# #414: Make ClearNews worth opening every morning

**Status:** approved by Nikhil, Nov 1, 2026 (section 5 leans taken). Step 1 built as 3.2.0, step 2 as 3.3.0 and 3.3.1, step 3 (the web) as 3.4.0, step 4's Must items (iOS 2.1, #425) built on Nov 5 and on the App Store since Nov 10 (section 9), with one change from the table: Google DeepMind went to the AI tab, since its posts this week were a frontier model and a world model.  
**Ask (Nikhil, Nov 1):** "I need to feel the attraction and addiction to open the app for my news." Gut feel: the presentation is not the best, and sources for things like AI and space are missing. Also: "physical AI is a topic that I love."  
**Inputs:** `docs/reviews/2026-11-01-product-patterns-research.md` (what makes news products worth opening), `docs/reviews/2026-11-01-sources-research.md` (source audit and tested candidates), and a prototype of story grouping run on the live feed (section 3).

## 1. Why the app does not pull you in today

Measured on the live app, Nov 1, 2026:

1. **No idea of what matters today.** The top of All is the newest item from each source, so it is a grab bag ordered by the clock. The day's biggest story, the $6.3 billion Binance hack, appears 9 times from 5 outlets scattered between position 3 and position 495, and never as one story.
2. **Fluff gets prime spots.** In the first 31 cards: a Star Wars gift guide, NFL fantasy picks, Panera's best breakfast, "15 Slang Words From the 1970s", a church entry from Atlas Obscura. Sports is 14 of 21 betting items. Wired is 13 of 30 deals and buying guides. Engadget is 14 of 20 how-to pieces. Mental Floss is lists and quizzes.
3. **Your interests are missing.** No AI tab: 38 of 703 items are about AI, scattered over six tabs. Space is NASA's picture of the day. Physical AI has 4 items in the whole app (a Meta humanoid prototype, London robotaxis, two robot videos), none where you would look.
4. **Some sources quietly broke.** Crosscut now carries PBS NewsHour's national video clips (0 Seattle stories). Ars Technica Tech posted 2 items in a week. Seattle Eater has nothing newer than 9 days. Finance leans UK (half of BBC Business and of the Guardian's business feed).
5. **The screen is slow to scan.** The iOS app shows one story per screen (a full-width photo, title, summary). Every story looks equally important. Thirty stories is thirty screens.

The India cleanup (#413) fixed volume. These five are what is left.

## 2. What makes a news app worth opening

From the product research (Techmeme, Google News, Apple News, Particle, Ground News, Axios, Semafor, Kagi News, Artifact's shutdown):

- **A small, finished daily read.** The products people open on purpose give them a known amount and then let them stop: "the 10 things that matter this morning", ending in "You're all caught up". This is healthy pull, the opposite of an endless scroll.
- **Stories, not articles.** The products that feel smarter than a feed show one card per story with the size and spread of coverage ("covered by 6 outlets"), and each outlet's own headline one tap away.
- **Explicit interests.** The products that lasted give readers controls (follow AI, mute sports) instead of guessing from clicks. ClearNews already promises no tracking, so the choice lives on the phone.

## 3. Proof on today's data

Grouping by meaning works on ClearNews's own feed. All 697 live articles were embedded with Workers AI (`@cf/baai/bge-m3`, title plus summary) and grouped by cosine similarity:

| Threshold | Stories with 2+ outlets | Result |
|-|-|-|
| 0.70 | 18 | Too loose: unrelated items merge (the midterms with a business story) |
| **0.75** | **11** | **Right: Binance becomes one story, 6 outlets and 10 articles, ranked first; Michael Mann (Fox, Variety), the AO3 outage (A.V. Club, Wired), a Martian meteorite (NASA, Scientific American), Assam evictions (NDTV, Scroll) all pair correctly** |
| 0.80 | 5 | Too tight: Binance splits into three |

The catch: only 11 stories have two or more outlets, because most tabs have 2 to 5 sources that rarely overlap. Coverage count ranks the top handful; a brief of 10 to 12 needs a second signal (step 2).

## 4. Proposal, in four steps

### Step 1: Sources (server only, no AI, days)

From the sources research, all tested from Cloudflare (feed reachable, article readable in the in-app reader):

| Change | Sources |
|-|-|
| New **AI** tab | The Decoder, Ars Technica AI, Latent Space, Simon Willison |
| New **Physical AI** tab | The Robot Report, IEEE Spectrum Robotics, TechCrunch Robotics (autonomy), Google DeepMind's blog (world models, e.g. "Genie 4: A new generation of world simulation"). Each posts a few times a week (about 30 a week together); step 2's topic tags add robotics, humanoid and autonomy stories from every other source |
| New **Space** tab | NASASpaceflight, Ars Technica Space, Universe Today, and NASA moved from Science |
| Science | add Quanta Magazine (long explainers) |
| Fixes | Ars Technica Tech to its live `/gadgets/` feed; Guardian Business to its US edition; Crosscut replaced by Cascade PBS's article feed (same newsroom) |
| Swaps | Mental Floss out, Smithsonian in (it works from Cloudflare) |
| Drops | Engadget (how-to pieces), Seattle Eater (evergreen guides) |
| Filters | Wired deals and buying guides; CBS Sports betting items (title rules; the AI filter in step 2 replaces them) |

42 enabled sources become 52; tabs 12 become 15. The AI tab gets about 55 to 75 stories a week, Physical AI about 30 before topic tags, Space about 40. All Physical AI candidates were tested from Cloudflare on Nov 1 (feeds reachable). The AI and Space sources go before Tech and Science in `sources.ts`, because dedup keeps the first source listed.

### Step 2: The Today brief and story grouping (server only, the AI step)

What the shipped iOS 2.0 and Android apps show with no release:

- **The first tab becomes "Today":** the server renames `all` and serves 10 to 12 stories there, one card per story, ranked. Every app already ends a list with "You're all caught up", so it reads as a finished brief. The full list moves to a new "Latest" tab.
- **One card per story everywhere:** repeats collapse into the best-covered outlet's article (the publisher's own headline, summary and image). No duplicate URL in any tab, since the apps key rows by URL.
- **No fluff:** a small model labels each new article (news, analysis, how-to, deals, betting, quiz, listicle, celebrity); fluff never reaches Today or the top of a tab.
- **Ranking:** outlets covering the story first, then an importance score from a small model given your interests (AI, physical AI, space, Seattle, India, markets, big US and world news), then freshness. Today keeps General's red and blue balance: when a political story makes it, both Fox and NPR coverage count.
- **Extra JSON fields** (story id, outlets, topics) ride along for the web and the next iOS release; today's apps ignore them.
- **No AI-written text** shown in this step. Every word on screen stays the publisher's. AI only groups, labels and ranks. (Apple paused its AI news summaries after they misreported BBC stories; summaries come later, labeled and cited, if at all.)

How it runs: inside the existing cron, after the fetch. Embeddings with `bge-m3` (a few hundred new articles a day), labels and importance with a mid-size Workers AI model such as Gemma 4 26B. Cost at today's volume (about 411 new articles a day, about 60 tokens each): roughly 2,000 Neurons a day against 10,000 free, so **$0**. Guardrails: merges need the 0.75 threshold and a time window; a story's card links to the original; a daily log of merges and drops to check early on.

### Step 3: The web app (can change any time)

- A Today page: date, "10 stories, about 8 minutes", compact text-first rows with a small image, and a caught-up line.
- Story cards that say "Covered by 6 outlets" and open to each outlet's headline; in General, a mark for which of Fox and NPR covered it.
- "New since your last visit" divider and chosen interests, both kept in the browser only.
- Topic sections under Today: AI, Physical AI, Space, Seattle, India, Markets, in the order you pick.

### Step 4: iOS 2.1 (an App Store release, your call)

- Today screen and a story view with all coverage.
- Compact rows (5 to 6 stories per screen instead of 1), photos smaller.
- Interests and mutes stored on the phone; an optional local morning reminder; a home screen widget with today's top 3.
- About text fixed ("financial news APIs").

## 5. Decisions for Nikhil

1. **Step 1 sources:** go with the table above? Sub-choices with my lean: AI, Physical AI and Space as their own tabs; tab order Today, AI, Physical AI, Space, Tech, Science, General, Local, India, Finance, then the rest.
2. **Step 2 Today:** rename All to "Today" with 10 to 12 stories, and move the full list to "Latest"? Lean: yes.
3. **AI-written text:** none in step 2 (lean), labeled summaries maybe in step 3.

Also open, smaller: drop betting and shopping everywhere or only keep them out of Today (lean: drop everywhere); brief size and refresh (lean: 10 stories, refreshed with the feed, morning edition later).

## 6. Order of work

Step 1 first (a day, no risk to the apps), then step 2 (a few days, tested with the Swift decoder sweep, the contract diff and a day of watching merges), then step 3 on the web, then step 4 when you want an App Store release.

## 7. Step 2 build design (Nov 1, after a prototype on live data)

### What the prototype showed

Run on the 275 articles from the last 30 hours of the live feed, through Workers AI:

- **Labels work.** Gemma 4 26B (`@cf/google/gemma-4-26b-a4b-it`, thinking off, JSON schema) labeled all 275 in 39 seconds (11 batches of 25, 8 in parallel) for 380 Neurons, with no failures. It found 29 fluff items (8 celebrity, 6 listicles, 6 how-to, 6 opinion, 3 deals); every one checked by hand was right.
- **Grouping works but is rare.** bge-m3 at 0.75 made 209 stories; 9 have two or more outlets.
- **A score alone makes a poor brief.** Importance plus coverage plus interest minus age picked three India politics items (the six India outlets overlap each other), CNBC market commentary, and gave importance 4 to most notable items.
- **An editor pass fixes it.** The score picks a shortlist of 40; one model call picks 10 against a short reader profile and rules (2 seconds, 26 Neurons). Result: the Binance hack linked to North Korea, OpenAI cutting its fundraising goal, the Artemis III plan, the self-driving boom, AI-found robot security bugs, Alaska Air cutting 125 Washington jobs, one India item (the opposition rally), Trump's tariff plans.
- **Left to fix:** a second Binance item and one CNBC commentary piece. Asking for 14 picks and dropping near repeats after the pick fixes both.

### How it runs

- **Tabs.** `all` keeps its id (every app opens it first) and is renamed "Today": the brief, about 10 stories. A new `latest` tab ("Latest"), second in the list, holds the full merged list that All shows now.
- **Search.** Without a tab, search covers Latest. All three apps send no category for the first tab, so search still covers everything.
- **One card per story in every tab.** Repeats within 48 hours collapse to the best-covered outlet's article, so India's overlapping outlets collapse too.
- **Topic tags.** AI, Physical AI and Space also show matching stories from any source.
- **In the cron, after the fetch.** New articles are labeled (batches of 25) and embedded (batches of 100) within a time budget; the rest waits for the next run. Results are kept by URL in a KV key `ai` (labels plus 8-bit embeddings, about 1 MB) and pruned with the articles.
- **The brief is rebuilt hourly**, and whenever it is missing. It reads as an edition instead of a list that shifts every minute.
- **Near repeats:** after the editor's picks, a pick at cosine 0.70 or more to an earlier pick is dropped. Measured on live data: pairs from 0.70 to 0.75 were the same event or a close follow-up; pairs near 0.62 were different stories (two separate OpenAI stories), so a lower cutoff would drop real news. Two Binance stories (the hack, then withdrawals resuming) sat below 0.60, so the editor prompt is what keeps those apart.
- **Grouping misses some repeats:** at 0.75 the Alaska Senate ruling from CNBC and NPR (0.69) stays two cards. A lower threshold merged unrelated stories, so 0.75 stays: a missed merge shows one extra card, a wrong merge hides a story.
- **If Workers AI fails,** unlabeled articles count as news, tabs work as today and the last brief stays for up to 6 hours; after that, or with no brief at all, Today shows the full list as before.
- **Extra JSON fields** on articles (`topics`, and `coverage`: the other outlets' headlines and links for the same story) for the web in step 3. Android ignores unknown keys (`ignoreUnknownKeys = true` in `ApiClient.kt`), iOS's `JSONDecoder` ignores them by default, and the web reads typed fields. Checked with the decoder sweep and the contract diff.
- **No AI-written text.** Every headline, summary and image stays the publisher's.
- **Cost.** About 600 Neurons a day for labels and 600 for hourly briefs, against 10,000 free a day: $0.
- **Review.** Each brief build logs its shortlist, picks and the fluff it dropped, for a few days of checking.

### Decisions (Nikhil, Nov 1)

1. **Refresh:** Today is an hourly edition, not rebuilt on every feed refresh.
2. **Fluff in tabs:** deals, betting, quizzes, listicles and celebrity items are dropped everywhere; how-to, opinion and features stay in their tabs but never reach Today.
3. **World news:** BBC World joins General, capped at 10 like Fox News and NPR News. No source covered world news before; BBC World posts about 18 world stories a day, all with images, and sits outside US politics.

## 8. Step 3 build design (Nov 1, the web)

Built from section 4 and the approved mockup (the artifact linked on #414). Nikhil approved the design, the build and the production deploy in advance on the evening of Nov 1.

- **API, one field.** The first tab's `/api/v1/articles` response adds `brief_at`: when the brief was built, or null while Today shows the full list. Other tabs and search are unchanged, and the apps ignore unknown keys.
- **Today page** (first tab, no search, while a brief exists): the date; chips for the story count, a reading time from the headlines and summaries, when the edition was built and how many stories are new since your last visit; ten numbered rows (the publisher's headline, source and time, a small photo, the summary on wider screens); then "You're all caught up" with the time of the next edition. Without a brief, the first tab shows the full list as before, with a note.
- **Coverage.** A story other outlets also covered shows "N more outlets"; tapping it lists each outlet's own headline, and each opens in the reader. Cards in every tab get the same.
- **Fox and NPR marks.** On any story labeled US politics, two dots show whether Fox News and NPR News covered it (filled) or not yet (hollow), in Today and in every tab.
- **New since your last visit.** Stories published after your previous visit carry a "New" mark in Today, the topic sections and every tab, and Today counts them. A new visit starts after 30 minutes away. Marks instead of a divider: Today is ranked and the tabs list each source's newest first, so no single line splits new from old.
- **Your topics.** Sections under Today, by default AI, Physical AI, Space, Local, India and Finance: up to 4 stories each that Today does not already show, and a link to the full tab. "Edit topics" picks which sections show and in what order, from every tab.
- **Kept in the browser only.** The topic list and the last-visit time live in localStorage, like the theme. Nothing about them reaches the server; the privacy page says so.
- **Not in this step:** AI-written text, mutes, sharing changes, the apps.
- **Checks:** a Worker test and a live check for `brief_at`; a browser walk on a local Worker serving production's feed, then on production, at desktop and phone widths, light and dark.

## 9. Step 4 build design (Nov 5, iOS 2.1, the Must items of #425)

Nikhil asked for the Must items only, on Nov 5. Notifications wait for the #435 design; the Should and Could items (topic sections, "new since your last visit", widget, reminder, mutes) are not in this build. No App Store release in this step.

- **Today screen.** On the first tab, while the server has a brief (`brief_at` present): "Today", the date, chips for the story count and "updated N min ago", numbered compact rows (the publisher's headline up to 3 lines, source and time, a 64-point photo), then "You're all caught up" with the next edition's time (`brief_at` plus an hour). A search, another tab, or no brief shows the 2.0 cards. The Home title is small and inline (Nikhil, Nov 5), so 5 full rows and part of a sixth fit once scrolled, against 1 card in 2.0.
- **Coverage and marks**, on Today's rows as on the web: "Covered by N outlets" opens to each outlet's own headline, each opening in the reader; Fox and NPR marks on stories whose main topic is US politics. The cards in other tabs are unchanged.
- **New fields read leniently.** The app now decodes `topics`, `coverage` and `brief_at`. If any of them is missing or changes shape, the article list still loads without it; the old fields are decoded as strictly as before. The decoder sweep compares what it decoded with the raw JSON, so a silent loss shows up there.
- **Coverage links** carry only an outlet, a headline and an address, and the server usually has no feed data for them, so the reader shows the outlet and headline from the list.
- **Reader.** The photo above the title keeps a fixed height while it loads. It is the list's photo, usually cached already; if that fails, the reader's resized copy. Coverage links show no photo, so the title never jumps when the reader answers. The meta line is one wrapping line. Failure messages per reason, as on the web, with "Watch on" for videos. Figures, captions, tables and lists styled; zoom allowed, and the page pans while zoomed in.
- **Staying current.** Pull to refresh keeps the list on screen. Coming back to the app reloads Today once its edition is over an hour old, and the "updated" and next-edition times redraw every minute.
- **Readable colours.** The links, chips and the caught-up line use the web's darker shades in light mode; the system blue and green are too light on white.
- **About** no longer mentions financial news APIs. Version 2.1, build 3.
- **Checks:** the decoder sweep against production; a simulator run against production (iPhone 17, light and dark, and the largest text size) through a temporary launch hook, removed after; an independent breaker review (one bug, the coverage label overflowing at the largest text sizes, and several smaller items, all fixed). Not exercised in the simulator: pinch zoom, VoiceOver, iPad, pull to refresh. Those go on Nikhil's phone walk.

