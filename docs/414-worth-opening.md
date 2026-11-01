# #414: Make ClearNews worth opening every morning

**Status:** proposal for Nikhil, Nov 1, 2026. Nothing here is built yet.  
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
