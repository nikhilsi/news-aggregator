# Product patterns: what makes a news app worth opening every morning

**Date:** November 1, 2026  
**For:** task #414 (the AI step), as input to its design doc. Sources are researched separately; this doc covers product patterns only.  
**Method:** product pages, launch posts and press coverage (linked inline); live looks at Techmeme, Ground News, Particle and Kagi News on Nov 1, 2026; the ClearNews API (all 15 pages of `/api/v1/articles?per_page=50`, 703 articles, about 18:45 UTC); the iOS, Android and web code. Anything I could not check is marked **(unverified)**.


## Lean

If ClearNews does only three things:

1. **A finite "Today" brief is the first screen.** 8 to 12 stories, one card per story, ranked by how many outlets cover it and how fresh it is, with shopping, betting and quiz items kept out. It ends with "You're all caught up". The shipped iOS app can show this with no release: the server renames the `all` tab to "Today", serves the brief there, and moves the full list to a new "Latest" tab.
2. **Story cards that show the coverage, not one article.** "Covered by 5 outlets", each outlet's own headline one tap away, and in General, which of Fox News and NPR covered it. The publishers' words carry the story; any AI text is labeled and cited. Web first, iOS in the next release.
3. **Interests set on the device.** Topic sections (AI, Space, Markets, India, Seattle) built from topic tags the server adds; the choice lives on the phone or in the browser and is never sent. This needs the sources work so AI and Space have enough to show.

Why these three: every product that people open daily on purpose gives them a small, known amount to read, then lets them stop (Kagi News, Axios AM, Ground News's Daily Briefing, Google's five-story briefing). The ones that feel smarter than a feed show the size and spread of coverage (Techmeme, Google Full Coverage, Particle, Ground News). And the ones that survived the AI wave give readers explicit controls instead of guessing from clicks (Yahoo News after Artifact, Feedly, Kagi). Today ClearNews does none of the three: its top 31 cards are the newest item from each source (at most 3 per category), so a gift guide outranks the biggest story of the day.

| Phase | What | App release? | Main risk |
|-|-|-|-|
| A: server only | Fluff filter; group repeats by meaning; rank by outlet count and freshness; Today brief served as the `all` tab, full list moves to "Latest"; AI and Space tabs from topic tags; extra JSON fields (story id, outlets, topics) for later clients | No. iOS 2.0, Android 1.0 and the web all pick it up | A wrong merge hides a story; a URL repeated inside one list (the apps key rows by URL) |
| B: web | Today page with story count, minutes and a caught-up line; story cards with outlet count and each outlet's headline; Fox and NPR coverage marks in General; "new since your last visit" divider; interests in localStorage; compact text-first rows | No. Web deploys any time | AI summary errors, if AI text is shown at all |
| C: iOS 2.1 | Today screen and story view; interests and mutes stored on the device; optional local morning reminder; home screen widget; corrected About text | Yes (App Store) | Scope creep. Ship the Today screen and interests first |

One dependency: ranking by outlet count only works when sources overlap. General has 2 sources today and most tabs have 2 to 5 niche sources, so clusters are small (section 1). The sources research decides how far this goes.


## 1. What ClearNews shows today

Checked on the live API, Nov 1, 2026, about 18:45 UTC.

- **All has 703 articles** on 15 pages of 50 (the apps load 20 at a time). The first 31 are the newest item from each source, at most 3 per category (the "tier 1" sort in `worker/src/pipeline/merge.ts`), then everything else by time. Of positions 32 to 50, 18 of 19 are India items.
- **The biggest story of the day is buried.** The $6.3 billion Binance hack was the lead story on Techmeme and the top Technology story on Kagi News (41 outlets) the same day. In ClearNews it appears 9 times from 5 outlets (The Guardian Business, The Verge, BBC Business, CNBC, Wired) across Finance and Technology, at positions 55, 186, 209, 225, 301, 340, 424, 494 and 505 of All. Never in the top 50.
- **The top 31 include fluff:** "The 30 Best Gifts for Star Wars Fans (2026)" (Wired), "NFL DFS, Eagles vs. Commanders: Daily Fantasy football picks" (CBS Sports), "Panera Bread grabs top honors for America's highest-rated fast-food breakfast item" (Fox News), "15 Slang Words From the 1970s We Still Use Today" (Mental Floss).
- **Sports has one source, CBS Sports, and 14 of its 21 items are betting odds, picks or promo codes.**
- **35 articles have no summary** (The Hindu 16, Times of India 14, Sunny Skyz 5).
- **Repeats exist but clusters are small.** A rough word-overlap check found clear cross-source pairs such as Michael Mann (Fox News, Variety), the Portal "F-Stop" leak (Engadget, The Verge, Kotaku) and the Rubin dwarf planet (Crosscut, GeekWire, Scientific American). Word overlap misses rephrased headlines (it caught little of the Binance cluster), so grouping by meaning will find more. Still, most clusters will be 2 to 5 articles.

So the main problem is not "too many repeats". It is that the top of the app is chosen by which source posted last, not by what matters.

**What the shipped apps can display** (read from the code):

| Thing | iOS 2.0, Android 1.0, web today |
|-|-|
| Card | Image (180 pt on iOS), title (2 lines), summary (3 lines), source name, relative time; iOS adds a share button |
| Tabs | Names and order come from `/api/v1/categories` in all three apps (iOS `CategoryService`, Android `fetchCategories`, web `CategoryTabs`). A tab added on the server appears everywhere |
| Opening tab | Hardcoded id `all` in all three. The server controls its display name and its contents |
| End of list | "You're all caught up" after the last page (iOS `ArticleListView`, Android `HomeScreen`, web `ArticleGrid`). A short list gets a finish line for free |
| Search | Within the selected tab. For `all` the apps send no `category` parameter |
| Reader | Shows `source_name` and a "Read on {source_name}" button, so `source_name` must stay a plain outlet name (no "+3 more") |
| Row identity | The article URL (iOS `id: url`, Android `key = { it.url }`). A URL listed twice in one tab, across pages too, can break the list. Compose rejects duplicate keys (from Compose's documented behavior; not tested here) |
| Extra JSON fields | Ignored (Swift `Codable` skips unknown keys; Android `ignoreUnknownKeys = true`; web types ignore them) |
| Cannot show | An outlet count, other outlets' headlines, labels, a "new" marker, reading time, sections inside a tab |


## 2. What the best products do

| Product | Mechanism that creates pull | Healthy? | Fit for ClearNews |
|-|-|-|-|
| Techmeme | One ranked page of about 30 story clusters; each shows the lead headline, a one-line excerpt and "More:" with every other outlet. A separate pure time "River" | Yes: you scan it in a minute and know you saw what matters | Ranked brief plus Latest; cluster size as importance; dense text |
| Google News | "Top stories" and Headlines, the same for everyone, ranked by how heavily outlets cover a story; Full Coverage one tap away; the 2018 app opened with a five-story briefing | Yes | Rank by outlet count; one tap to all coverage |
| Apple News | Editors pick Top Stories; an algorithm picks Trending; a weekday morning audio briefing | Mixed: the algorithmic side drifts to celebrity news | Do not rank by popularity |
| Particle | One card per story with "N ARTICLES" and a one-line summary; story page with bullets, quotes, source links, "Opposite Sides" spectrum, ask-a-question | Mostly | Outlet count on cards; sources right under any AI text |
| Ground News | Bias bar per story, Blindspot for one-sided coverage, a Daily Briefing marked "7 stories • 797 articles • 7m read" | Yes | Finish line with count and minutes; show which side covered a story without scoring anyone |
| Artifact | Personalization from reading behavior, AI clickbait rewrites, then social features. Closed in 2024 | Pull did not hold | Explicit controls, no social, no behavioral learning |
| Axios AM | Smart Brevity: "1 big thing", "Why it matters", "Go deeper"; a word count and reading time at the top; a consistent length | Yes | Tell the reader the cost up front |
| Semafor | Articles split into "The News", the reporter's view, "Room for Disagreement", "The View From"; Signals gathers many outlets on breaking news | Yes | Label what is the publisher's text and what is ClearNews's |
| Morning Brew | Short daily email, about five minutes, same shape every day, a voice, a light ending | Yes | A fixed shape for the brief, ending on one Feel Good story |
| The Browser | Five hand-picked pieces each weekday, chosen for lasting value | Yes | A small fixed number beats a big variable one |
| Hacker News | Points decay with age, so the front page turns over on its own | Neutral | A time-decay score with outlets in place of votes |
| Feedly, Inoreader | Near-duplicate removal, mute filters, topic priority, summaries on request | Yes | Mute and dedup as explicit tools |
| Kagi News (added: the closest model) | RSS in, LLM summaries out, one briefing a day, about 12 stories per category, "No endless scrolling" | Yes | Proof that a finite RSS-plus-AI brief works; a warning about long AI summaries |

### Techmeme

- **How it looks.** On Nov 1 the lead block was Reuters's Binance headline, a one-line excerpt, then "More:" with 15 other outlets and an "X:" line of 16 posts. The FBI follow-up listed about 35 outlets ([techmeme.com](https://www.techmeme.com/), observed Nov 1, 2026). The "River" tab is "Techmeme in pure reverse chronological order" ([techmeme.com/river](https://www.techmeme.com/river)).
- **How it ranks.** Software crawls sites and ranks what they link to; bigger clusters mean bigger stories. Editors write the headlines (Gabe Rivera now uses LLMs to help) and remove duplicates. About 100,000 people read it daily and traffic rose 25 percent in 2025, partly from interest in AI ([CrazyStupidTech, Sep 2025](https://crazystupidtech.com/2025/09/08/at-20-techmeme-has-never-been-hotter/)). Editors joined the algorithm in 2008 ([Wikipedia](https://en.wikipedia.org/wiki/Techmeme)).
- **The pull.** Thirty seconds tells you what the industry is talking about, and the cluster size tells you how much. Density is a feature: Rivera designed it for "information density" and fast loading (same CrazyStupidTech piece; it says no photos, but I saw small thumbnails on lead stories on Nov 1).

### Google News: Top stories, Headlines, Full Coverage

- Google says its systems "identify the major stories of the moment", mainly from what publishers are writing about. One ranking signal, prominence, includes whether sources heavily cover a story and whether others cite it. Headlines and top news are "not personalized to individuals" ([How news works](https://www.google.com/search/howsearchworks/how-news-works/)).
- Full Coverage is "unpersonalized news from a broad range of sources" ([Google blog](https://blog.google/products/news/look-how-news-google-works/)). It shows "top news, local headlines, in-depth pieces, explainers, interviews and more", and Google built technology to "detect long-running news stories that span many days" ([Google blog, 2021](https://blog.google/products/news/get-full-news-story-full-coverage-search/)).
- The 2018 redesign opened "For You" with "a briefing of five news stories" mixing top headlines, local news and followed topics ([exchange4media](https://www.exchange4media.com/digital-news/google-taps-into-ai-for-an-all-new-google-news-89880.html)).
- **The pull:** the same trustworthy top for everyone, and one tap from any story to all of its coverage.

### Apple News: Top Stories and Apple News Today

- Editors curate Top Stories; an algorithm picks Trending Stories. A Northwestern audit found that "human curation outperformed algorithmic curation in several measures of source diversity", and that the algorithmic side carried more "soft news" about celebrities while editors picked more "news about policy and international events" ([arXiv 1908.00456](https://arxiv.org/abs/1908.00456v1)).
- Apple News Today is "a daily audio news briefing" from Apple News editors, released "mornings Monday through Friday" ([Apple Newsroom, Jul 2020](https://www.apple.com/newsroom/2020/07/apple-news-launches-new-audio-features-expands-local-news-offerings-for-readers/)). Press reports put it at 7 to 10 minutes ([CNBC](https://www.cnbc.com/2020/07/15/apple-news-adds-audio-stories-daily-audio-briefing-local-news.html)). Current length and hosts **(unverified)**.
- **The lesson for ClearNews:** popularity ranking drifts to fluff. ClearNews has no click data anyway, which is fine: rank by coverage and simple rules.

### Particle

- Stories group many outlets. Each card on the site shows "133 ARTICLES" or "11 ARTICLES", a time and a one-sentence summary ([particle.news](https://particle.news/), observed Nov 1, 2026).
- A story page has AI bullets, an "Explain Like I'm 5" mode, a "5 W's" facts mode, quotes, source links "directly under the AI summary" with large tap targets, an "Opposite Sides" view with a red-to-blue spectrum chart, and a chatbot. It uses GPT-4o, GPT-4o mini, Anthropic and Cohere models. Particle says an extra step that finds supporting material cuts AI errors from about "one out of 100 times" to one in 10,000 (company claim, **unverified**). Human editors curate the home page ([TechCrunch, Nov 2024](https://techcrunch.com/2024/11/12/particle-launches-an-ai-news-app-to-help-publishers-instead-of-just-stealing-their-work)).
- In the early beta, bullets were not linked to their sources, which made checking hard ([TechCrunch, Feb 2024](https://techcrunch.com/2024/02/29/former-twitter-engineers-are-building-particle-an-ai-powered-news-reader/)). Since then it added podcast clips matched to stories with vector embeddings ([TechCrunch, Feb 2026](https://techcrunch.com/2026/02/23/particles-ai-news-app-listens-to-podcasts-for-interesting-clips-so-you-you-dont-have-to/)).
- **The pull:** the article count says "we read all of this for you", and the opposite-sides view makes a story feel complete.

### Ground News

- It groups "every news articles written about a recent event" and sorts coverage by "political bias, factuality, ownership". Bias ratings are "averaged from the published ratings from three third-party" raters; Ground News "takes no part in evaluating" them, and a reader can edit a source's rating on their own account ([FAQ](https://ground.news/frequently-asked-questions)).
- The bias bar shows the left, center and right share of the rated sources covering a story ([help article](https://help.ground.news/en/articles/245249)). Blindspot shows stories covered mainly by one side; the weekly Blindspot Report uses "the mean and standard deviation of the aggregate bias ratings of the day's top 100 (most covered and most read) stories" ([Blindspot](https://about.ground.news/blindspot)).
- The home page's Daily Briefing card read "7 stories • 797 articles • 7m read" on Nov 1, 2026 ([ground.news](https://ground.news/)).
- **The pull:** a finite briefing with its cost stated, and the feeling of seeing the other side.
- **For ClearNews:** with two General sources, a bar is meaningless. Naming which outlets covered a story ("Fox News and NPR", or "only Fox News") gives the same signal without scoring anyone.

### Artifact (closed)

- Launched January 2023 by Instagram's founders. It ranked headlines from behavior, weighing "dwell time, read time, shares" as well as clicks ([Yahoo/TechCrunch](https://news.yahoo.com/tech-behind-artifact-newly-launched-140037935.html)). It added AI clickbait rewrites: readers flagged a headline, the team reviewed it, GPT-4 rewrote it, and a star icon marked the AI version ([TechCrunch, Jun 2023](https://techcrunch.com/2023/06/02/artifact-news-app-now-uses-ai-to-rewrite-headline-of-a-clickbait-article)). Then came profiles, reputation scores, posts and comments ([Wikipedia](https://en.wikipedia.org/wiki/Artifact_(app))).
- January 2024: Kevin Systrom said "the market opportunity isn't big enough to warrant continued investment in this way" ([Wikipedia](https://en.wikipedia.org/wiki/Artifact_(app)); [Engadget](https://www.engadget.com/instagrams-founders-are-shutting-down-artifact-their-year-old-news-app-233431390.html)). Analyses add a growing pile of features and an unclear position between social app and AI reader ([Failory](https://newsletter.failory.com/p/why-artifact-failed)). His own post was blocked to my fetch **(unverified first-hand)**.
- Yahoo bought it in April 2024. The rebuilt Yahoo News app lets users "select topics and publishers", block keywords and publishers, flag clickbait for rewriting, and see "succinct, AI generated key points" ([Yahoo press release](https://www.yahooinc.com/press/yahoo-news-app-reimagined-with-next-level-personalization-from-artifact)).
- **The lesson:** behavior-based personalization by a very strong team did not create a lasting habit. What survived is explicit control plus short summaries. ClearNews needs no market, but the warning about feature sprawl applies.

### Axios AM and Smart Brevity

- Stories follow a fixed pattern: a headline, one sentence, "Why it matters", "Go deeper" ([HackerNoon analysis of 1,300 newsletters](https://sia.hackernoon.com/the-holy-grail-of-email-what-analyzing-1-300-axios-newsletters-taught-us-468c23617406)).
- AM opens with "a Smart Brevity™ count that informs the reader of how long it will take to read the issue" and keeps "a consistent length" ([awards entry](https://awards.journalists.org/entries/axios-am/)). Whether every issue still carries the count **(unverified)**.
- Critics say the bold signposts flatten complex stories ([CJR](https://www.cjr.org/criticism/axios-smart-brevity-longform.php)).
- **The pull:** you know the cost before you start, and it is the same small cost every day.

### Semafor: the Semaform and Signals

- Every article separates "The News" from the reporter's view, "Room for Disagreement", "The View From" and "Notable". Editor Gina Chua: it "separates the undisputed facts from the reporter's analysis of those facts" ([Semafor](https://www.semafor.com/article/10/18/2022/what-is-a-semaform-anyway-and-why-should-you-care)).
- Signals is a "multi-source breaking news feed". Journalists use Microsoft and OpenAI tools to search sources across languages; editors verify, write summaries and link to the original reporting ([Semafor](https://semafor.com/article/02/05/2024/introducing-semafor-signals)).
- **For ClearNews:** the useful idea is the labeling. Readers should always know which words are the publisher's and which are ClearNews's.

### Morning Brew

- A short daily email, about five minutes: a market recap, a few short briefs, a small lifestyle section, in a light voice ([TechCrunch, 2018](https://techcrunch.com/2018/03/26/the-morning-brew-is-a-daily-business-briefing-built-for-millennials); [Business Insider](https://www.businessinsider.nl/morning-brew-daily-business-newsletter-overview-2019-1)). Reported open rates around 45 percent; older figures from secondary sources **(unverified today)**.
- **The pull:** the same shape every morning (serious, useful, light) and a voice.

### The Browser

- Five recommended pieces each weekday, chosen by Robert Cottrell and Caroline Crampton for lasting value; five is the number they can reliably fill with pieces they love ([About](https://thebrowser.com/about); [Every profile](https://every.to/superorganizers/the-man-who-reads-1000-articles-a-294349)).
- **The pull:** scarcity and trust. A small fixed number makes each pick feel chosen.

### Hacker News

- The classic score is about (votes minus 1) to the power 0.8, divided by (hours since posting plus 2) to the power 1.8, times penalties. Because time outweighs votes, "nothing stays on the front page too long" ([righto.com](https://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html)). Today's exact formula **(unverified)**.
- **For ClearNews:** the same shape works with distinct outlets in place of votes. The top turns over on its own without random reshuffles.

### Feedly and Inoreader

- Feedly's Leo can prioritize topics, remove near duplicates ("the same article or press release appearing across multiple sources") and mute topics, sites and authors; once muted, "No more content on the topic will turn up" ([Feedly blog](https://blog.feedly.com/?p=11707); [mute filter docs](https://docs.feedly.com/category/706-mute-filters)).
- Inoreader added on-request article summaries in 2025 and presents them as saving time rather than deciding what you see; duplicate removal is a filter rule ([Inoreader blog](https://www.inoreader.com/blog/2025/03/inoreader-q1-highlights-a-strong-start-to-2025)).
- **The pull:** control. Power readers come back because the feed obeys them.

### Kagi News (not on the brief, but the closest model to ClearNews)

- Launched Sep 30, 2025. It reads "thousands of community curated RSS feeds", does not scrape, and publishes once a day around noon UTC as "a natural endpoint to news consumption". "No endless scrolling. No attention hijacking." It does not track or profile readers ([Kagi blog](https://blog.kagi.com/kagi-news)).
- Its public data ([news.kagi.com/kite.json](https://news.kagi.com/kite.json), checked Nov 1, 2026) has 187 sections, including AI and India. World, USA and Technology each had 12 stories, Science 11. Each story carries a title, a long summary with inline citations like `[theguardian.com#1]`, perspectives with source links, a timeline, background, and a count of distinct outlets. The top Technology story (Binance) had 41 outlets; the order roughly, but not strictly, follows outlet count (the 8th story had 15). Science clusters were small (2 to 14 outlets).
- Reviews: "spend five minutes getting caught up, and move on with my day" ([MacSparky](https://www.macsparky.com/blog/2025/10/kagi-news-a-news-site-that-respects-your-time/)). Nieman Lab found it "impressive if a bit fallible": some summaries drift from their headlines and some quotes lack context ([Nieman Lab](https://www.niemanlab.org/2025/10/kagi-news-is-an-ai-powered-app-for-keeping-up-with-the-world/)). Users asked for more than one update a day ([Kagi feedback](https://kagifeedback.org/d/9657-update-timing-is-inconsistent)).
- **For ClearNews:** proof that RSS plus AI plus a finite brief can feel complete, with no accounts and no tracking. Its long AI summaries are where its errors show up; short summaries and visible outlets avoid most of that.

### Instagram's "You're all caught up" (a warning)

- Launched in 2018 as Instagram's first "time well spent" feature ([TechCrunch, 2018](https://techcrunch.com/2018/05/21/scroll-responsibly/)). In 2020 Instagram filled the space after it with suggested posts and ads ([TechCrunch, 2020](https://techcrunch.com/2020/08/19/instagram-finds-new-ad-space-at-the-end-of-your-feed-with-launch-of-suggested-posts-feature)).
- **The lesson:** a finish line only works if nothing loads after it.


## 3. Healthy pull versus engagement bait

The audience side: four in ten people (40 percent) "sometimes or often avoid the news", tied with 2024 as the highest level recorded. Reasons include too much war and politics, feeling powerless, and news that "doesn't feel relevant to their lives". The top AI features people want are summaries (27 percent) and better recommendations (21 percent), but audiences are "broadly sceptical" of automated news and "more accepting of journalists using AI in a supportive role" ([Reuters Institute Digital News Report 2025](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/dnr-executive-summary)). The same report notes a Swedish app with a button to filter out difficult stories when readers are tired.

The bait side: Aza Raskin, who designed infinite scroll in 2006, later said he felt guilty and called such design "behavioural cocaine" ([BGR on BBC Panorama, 2018](https://www.bgr.com/tech/social-media-addicts-us-like-cocaine/)). Nir Eyal's Hook model names "variable reward" (the slot-machine effect) as the engine of habit ([summary](https://getstream.io/blog/hook-model/)).

| Mechanism | Healthy form | Bait form | ClearNews |
|-|-|-|-|
| Daily unit | A finite brief with its count and minutes (Kagi, Axios, Ground News) | An endless feed as the home screen | Today is home; the full list is a tab |
| Finish line | "You're all caught up" and nothing after it | Caught-up, then suggested posts (Instagram 2020) | Today ends. Links to Latest and topics are plain links, nothing autoloads |
| Reason to return | The world changed: "3 new stories since this morning" | Unpredictable rewards and reshuffles | A "new since you last looked" marker, computed on the device; a stable order |
| Importance | How many outlets cover it (Google, Techmeme, Kagi) | What others click (Trending) | Outlet count. No trending: no data, and it drifts to celebrity news |
| Personal fit | Topics and mutes the reader sets (Yahoo, Feedly, Kagi) | Inferred from dwell time and clicks (Artifact) | Explicit only, stored on the device (Nikhil's rule) |
| Notifications | One opt-in reminder at a time the reader picks | Alerts for every story | Maybe in Phase C, scheduled on the phone |
| Tone | Calm, ends light (Morning Brew's shape) | Outrage, cliffhanger headlines | Fluff filter; end the brief with one Feel Good story |
| Social proof | None needed | Streaks, badges, likes, comments | None |
| Density | A list you can scan (Techmeme) | Giant images that force scrolling | Compact rows for the brief in B and C |

**What "attraction" should mean for ClearNews:** the first screen is worth it every time; it costs a known few minutes; it shows what you would otherwise miss (how big a story is, whether both sides covered it); it knows your topics because you told it. All four fit the calm promise and the no-tracking promise.


## 4. Mapping onto ClearNews

### Phase A: server only, no app release

Everything here runs in the cron after the current merge step and writes extra fields into the stored feed. The shipped apps see only reordered lists, fewer cards and new tabs.

**A1. Fluff filter.** Rules first, an LLM only for unclear cases. Drop commerce and betting: gift guides, deals, "% off", promo codes, odds, picks, parlays, DFS (14 of 21 Sports items today). Keep listicles and quizzes in their own tabs (Offbeat exists to be fun) but never in Today or the top of a tab. Log every drop to `/api/v1/status` so Nikhil can review.

**A2. Group repeats by meaning.** Embed title plus summary for each new article; join articles about the same event within about 72 hours; ask an LLM only about borderline pairs ("same event, yes or no?"). Each article gets a `story_id`. Then:
- In Today and Latest: one card per story.
- In a category tab: one card per story within that tab.
- In General: keep both the Fox News and NPR cards, next to each other. That shows both takes on the same event, with no app change.
- The card shown is the member with the best publisher summary (not empty, not a photo caption). Title and summary stay the publisher's own words.
- Never list the same URL twice in one tab, across all pages (Android and iOS key rows by URL).

**A3. Rank by importance.** Replace "newest per source" with a score: distinct outlets in the story (the strong signal), decayed by age the way Hacker News decays votes. Apply it to Today and to the top of each tab; the rest stays by time.

**A4. Today as the opening view.** The apps open on id `all`, and the server owns its name and contents. So:
- `/api/v1/categories` returns `{"id":"all","name":"Today"}` first, then a new `{"id":"latest","name":"Latest"}` with the full list, then the existing tabs.
- `/api/v1/articles` with no category and no search returns the brief: 8 to 12 stories, `total_pages` 1. The apps then show "You're all caught up" right after it.
- With no category and a search, it searches the full list, so search still finds everything.
- Brief recipe: last 24 to 36 hours, fluff out, top stories by score, at most 2 per category, at least one India and one Seattle story when present, and one Feel Good story last. Rebuild on a fixed schedule (hourly, or two editions a day) so it does not reshuffle while someone reads.
- A safer alternative: keep "All" and put the brief at its head. That fixes the top but loses the finish line. I lean to the rename; Nikhil decides, since the family will see it.

**A5. Topic tabs.** The LLM pass that checks fluff also tags topics (`ai`, `space`, `robotics`, `markets`, `india`, `seattle`). The server can add "AI" and "Space" tabs built from tags across all sources (GeekWire, CNBC, Wired, Ars, NASA, Scientific American today). They appear in all three apps at once. Thirteen tabs is already a lot, so pair this with dropping or merging a weak tab (Sports, mostly betting, is the obvious candidate). Depth depends on the sources research.

**A6. Summaries: publishers' words only in Phase A.** The tempting move is to write better AI summaries into the existing `summary` field. I recommend against it. In the shipped apps that text would sit under "NPR News" or "BBC Business" with no label, which is the exact failure that made Apple pause its news summaries after the BBC complained (section 5). Phase A can still improve summaries without writing any: fill the 35 empty ones from another member of the same story, strip boilerplate, and pick the clearest publisher summary for the story's card.

**Extra fields for later clients** (ignored by the shipped apps): `story_id`, `story_size`, `outlets` (names and URLs of other members), `topics`, `importance`, and optionally `story_summary` with `story_summary_sources`. Phase B uses them right away.

**What Phase A cannot do:** show an outlet count, other outlets' headlines, labels, reading time or a "new" marker. Do not fake these with dummy cards or by editing titles or `source_name`; the reader would show them as "Read on NPR News +3 more".

### Phase B: the web app (can change now)

- **B1. Today page.** A numbered list of 8 to 12 stories with a header such as "9 stories · about 5 min · updated 7:00". Compact rows: a small thumbnail, the headline, one line of summary, "5 outlets". It ends with "You're caught up" and plain links to Latest and the topic sections. Nothing loads after it.
- **B2. Story card and story page.** Tapping "5 outlets" opens every outlet's own headline with its source name and time, each linking out, the way Techmeme's "More:" works. This shows perspectives with no AI text at all: each line is a quote, attributed. A story page (`/story?id=`) lists the coverage by time, which gives a simple timeline for multi-day stories like Binance.
- **B3. Coverage marks in General.** "Covered by Fox News and NPR", or "Only Fox News" / "Only NPR". No left and right scores: with two sources a bar says nothing, and outlet-level ratings are disputed (section 5).
- **B4. New since your last visit.** The browser stores the last visit time in localStorage and draws a divider. Nothing is sent to the server, so the privacy promise holds.
- **B5. Interests.** Checkboxes for topics and mutes, stored in localStorage. Today gets small sections (AI, Space, Markets, India, Seattle, three stories each) in the order the reader chose.
- **B6. Optional story summary.** If used: at most two sentences, written only from the members' RSS titles and descriptions, labeled "Summary by ClearNews from 5 outlets", with the outlets linked right under it, as Particle does. Never under a single publisher's name.

### Phase C: what would justify an iOS release

- **C1. Today screen and story view** (the core reason to ship): count and minutes up top, caught-up state at the end, story cards with outlet count, a story view listing every outlet's headline.
- **C2. Interests and mutes on the device**, kept in `UserDefaults`. The server serves every tag; filtering happens on the phone. No account.
- **C3. Optional morning reminder.** One local notification at a time the reader picks ("Today: 9 stories, about 5 min"), scheduled on the phone. No push server, no tracking. Off by default.
- **C4. Home screen widget** with the top three Today headlines and their update time.
- **C5. "New since you last opened"** marker, stored on the device.
- Also: the About text still says "financial news APIs".

C1 and C2 together justify a release. C3 to C5 are small extras that can ride along. Android follows the same list later.


## 5. The AI part

### What these products run

| Product | Grouping | Ranking | Text generation | Labels |
|-|-|-|-|-|
| Techmeme | Link graph plus editors | Linking activity, cluster size, editors | Editors write headlines, LLM-assisted | None |
| Google News | "Identify the major stories" across publishers; detects long-running stories | Prominence, authority, freshness | None: publishers' headlines are shown | Fact-check tags ([IJNet](https://ijnet.org/en/story/google-news-now-highlights-fact-checks-alongside-daily-news)) |
| Particle | A pipeline that groups related content; embeddings for podcast clips | Its own ranking decides which link and quote come first | Bullets, headline, sub-headline, modes, chatbot | Political spectrum chart |
| Ground News | Groups articles per event | Most covered and most read | A "Ground Summary" | Outlet ratings averaged from AllSides, Ad Fontes Media, Media Bias Fact Check |
| Kagi News | A clustering step over RSS items | Roughly by distinct outlets | Long summaries with inline citations, perspectives, timeline | None |
| Artifact, then Yahoo | Personalization model | Behavior (Artifact), chosen topics (Yahoo) | GPT-4 headline rewrites marked with a star; "Key Takeaways" bullets | AI marker on rewrites |
| Feedly, Inoreader | Near-duplicate detection | Topic priority, mutes | Summaries on request | None |
| Semafor Signals | Journalists with AI search tools | Editors | Editors write | Fact versus view sections |

Most products use the same three steps: group articles by meaning, rank stories by how many outlets cover them, then show either the publishers' own headlines (Techmeme, Google) or a cited AI summary (Particle, Kagi, Ground News).

### Known failure modes

- **Wrong merge plus summary.** Apple Intelligence merged three New York Times alerts into one notification falsely saying Netanyahu had been arrested, and told BBC readers that Luigi Mangione had shot himself. Apple paused summaries for news apps in January 2025 and added a warning that summaries may contain mistakes ([The Decoder](https://the-decoder.com/apple-pauses-ai-generated-news-summaries-after-serious-accuracy-issues-surface/); [ABC7](https://abc7news.com/post/apple-is-pulling-ai-generated-notifications-news-generating-fake-headlines/15810860/)). The press group RSF said a warning "just transfers the responsibility to users".
- **Wrong attribution.** In an EBU and BBC study of more than 3,000 answers from ChatGPT, Copilot, Gemini and Perplexity, 45 percent had at least one significant issue, and 31 percent had serious sourcing problems ([VRT summary, Oct 2025](https://communication.vrt.be/largest-study-of-its-kind-shows-ai-assistants-misrepresent-news-content-45-of-the-time-regardless-of-language-or-territory)). ClearNews's task is narrower (summarize a few RSS snippets), but the risk is the same kind.
- **Made-up text under a publisher's name.** Dow Jones and the New York Post sued Perplexity in 2024, claiming it invented passages and credited them to their papers, and also reproduced paragraphs ([Engadget](https://www.engadget.com/ai/wall-street-journal-and-new-york-post-are-suing-perplexity-ai-for-copyright-infringement-050135219.html)). Outcome **(unverified)**.
- **Summaries that drift.** Kagi News summaries sometimes wander from their headline; quotes lose context ([Nieman Lab](https://www.niemanlab.org/2025/10/kagi-news-is-an-ai-powered-app-for-keeping-up-with-the-world/)).
- **Rewrites nobody needed.** Artifact's founders admitted some clickbait rewrites were unnecessary ([Gizmodo](https://gizmodo.com/artifact-clickbait-news-ai-1850499448)).
- **Bias labels.** Ratings are per outlet, not per article, and they are judgment calls; Ground News lets readers override them and says ratings "can evolve over time" ([FAQ](https://ground.news/frequently-asked-questions)). A label on ClearNews would be the first thing family members argue with.
- **Popularity drift.** Algorithmic picks lean to celebrity and soft news (Apple News audit above).
- **Merge errors specific to ClearNews.** Two different cyclones, two different elections, or a new development folded into an old story (Binance "hack" versus Binance "withdrawals resume" is fine as one story; two unrelated Delhi crimes are not).

### Guardrails for ClearNews

1. **AI decides grouping, order and filtering; publishers' words do the talking.** In Phase A no AI text reaches a reader.
2. **Any AI text is labeled, short and cited.** At most two sentences, attributed to ClearNews, with the outlets it came from linked right under it, built only from RSS titles and descriptions.
3. **Check before showing.** Every number and proper name in an AI sentence must appear in the source text; otherwise fall back to the lead publisher's summary.
4. **Merge carefully.** A time window, a similarity threshold, an LLM yes/no only for borderline pairs, a cap on story size, and merges that can be undone (members keep their own records).
5. **Name outlets instead of rating them.**
6. **Always link out**, and keep the publisher's name on every card.
7. **A kill switch** (a config flag) that serves today's ordering, and a log of merges and drops in `/api/v1/status` (no user data).

**Cost, roughly:** Workers AI lists `@cf/baai/bge-m3`, a multilingual embedding model (useful for India), at $0.012 per million input tokens, and Workers Paid includes 10,000 free Neurons a day ([model page](https://developers.cloudflare.com/workers-ai/models/bge-m3/); [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). A day of new articles is on the order of 1,000 items times about 100 tokens, so embeddings cost well under a cent a day (my estimate, **unverified** against measured counts). LLM calls for borderline merges, fluff and topic tags are the larger cost; the design doc should measure them.

### Copyright

Keep generated text short, link out every time, and work from what publishers put in their RSS feeds. Kagi states the same stance: it does not scrape, and publishers decide what their feeds include ([Kagi blog](https://blog.kagi.com/kagi-news)). Particle's answer to publishers is prominent links back ([TechCrunch](https://techcrunch.com/2024/11/12/particle-launches-an-ai-news-app-to-help-publishers-instead-of-just-stealing-their-work)). The Perplexity suits show where the risk sits: long reproduced passages and invented text credited to a paper. Showing each outlet's own headline with a link (B2) carries the least risk of all. This is not legal advice.


## 6. Open questions for Nikhil

1. Rename the `all` tab to "Today" in the shipped apps, or keep "All" with the brief at its head?
2. Brief size (8, 10, 12) and schedule (hourly, or a morning and an evening edition in Seattle time)?
3. Drop betting and shopping entirely, or only keep them out of Today and the tops of tabs?
4. Add AI and Space tabs now, or wait for the sources work? Which tab gives up its place?
5. Any AI-written text at all (B6), or publishers' words only?


## 7. What I could not verify

- Artifact's own shutdown post (medium.com blocked my fetch); the quote comes from Wikipedia and press coverage.
- Particle's accuracy claim (one in 10,000) and how it groups stories.
- Kagi's exact ranking rule; I inferred "roughly by outlet count" from its Nov 1 data.
- Ground News's exact bias bar math and Blindspot thresholds.
- Apple News Today's current length and hosts; Morning Brew's current open rates; whether every Axios AM still shows the Smart Brevity count.
- Hacker News's current formula (the cited one is from 2013).
- Techmeme photos: the 2025 profile says none; I saw small thumbnails on lead stories on Nov 1, 2026.
- The outcome of the Dow Jones and New York Post suit against Perplexity.
- That a repeated URL crashes the Android list; this follows Compose's documented rule for duplicate keys and was not tested on a device.
- How many repeats meaning-based grouping will find in ClearNews; my word-overlap check undercounts, and the Binance cluster was found by keyword.
- The embedding cost estimate.
