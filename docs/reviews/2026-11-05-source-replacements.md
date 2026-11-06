# Replacement sources for the 8 blocked feeds

**Checked on 2026-11-05 (Seattle), reader calls between 01:20 and 01:30 UTC on Nov 6.** Nikhil ruled on Nov 5 that sources whose stories do not open in the reader go: BBC World, BBC News India, NDTV, BBC Business, BBC Uplifting, BBC Health, UPI Odd News and Smithsonian Magazine. This doc finds replacements.

**How it was checked.**
- **Mac screen.** Each feed was fetched from this Mac with the Worker's browser User-Agent and parsed with the Worker's own parser (`articlesFromXml` in `worker/src/feeds/fetch.ts`), so item counts, dates and feed photos are what the cron would see. 96 feed URLs were screened; most were dropped here for being stale, empty, off topic or full of deals.
- **Cloudflare test.** Survivors went through production's reader, `GET /api/v1/articles/reader?url=...`: three recent articles each (stories, not deals, video or live blogs), plus the feed URL itself. A candidate whose first article was refused was not tested further. **84 reader calls**, 5.5 seconds apart, no 429s.
- **Words.** "Reader / page" is the reader's `word_count` against the words in the page's own paragraphs of 12+ words, fetched from the Mac (nav, header, footer and aside left out). Close numbers mean the whole article came through.
- Candidates that failed on Nov 1 (`2026-11-01-sources-research.md`) were not retried. Scripts and raw results are in the session scratchpad; no repo file other than this one was changed.

## Recommendations

| Tab | Gap | Pick | Feed URL | Why |
|-|-|-|-|-|
| Offbeat | UPI Odd News | Popular Science | https://www.popsci.com/feed/ | Odd animal, archaeology and science stories ("Relaxed bear wins award for luxurious eating style"), about 49 a week, 3 of 3 opened in full. |
| Offbeat | Smithsonian | JSTOR Daily | https://daily.jstor.org/feed/ | Odd history and culture essays, the Smithsonian lane. Free, about 5 a week, 3 of 3 opened in full. |
| Health | BBC Health | The Conversation (US, Health) | https://theconversation.com/us/health/articles.atom | Health explainers written by researchers and edited by a nonprofit newsroom, 3 of 3 opened in full (1,150 to 1,350 words). |
| Health | second, optional | KFF Health News | https://kffhealthnews.org/feed/ | Nonprofit health newsroom, free, 3 of 3 opened in full (900 to 2,400 words). Policy heavy, and it often co-publishes with NPR, so some overlap with NPR Health. |
| General | BBC World | DW (World) | https://rss.dw.com/atom/rss-en-world | Germany's public broadcaster, the closest match to BBC World: world news outside US politics, 4 of 4 articles opened in full. Use the Atom feed (see Notes). |
| Finance | BBC Business | ABC News Business (AP wire) | https://abcnews.go.com/abcnews/businessheadlines | AP business wire with an international slice (Bank of England, Asian shares, Kenya mining) as BBC Business had; photos in the feed; 3 of 3 opened in full. |
| India | optional | The Indian Express (India) | https://indianexpress.com/section/india/feed/ | A clearly reputable national daily; 3 of 3 opened in full. The reader appends a "Live Updates" list of about 65 words to each (a cleanup gap, not a block). |
| Feel Good | optional | Reasons to be Cheerful | https://reasonstobecheerful.world/feed/ | Solutions journalism, long reads (1,550 to 2,100 words), about 5 a week, 3 of 3 opened in full. |

If only one Health source is wanted: The Conversation, since KFF Health News overlaps NPR Health more. Result: 8 sources out, 6 to 8 in, depending on the optional rows.

## Results by tab

"Last 7 days" is items in the feed dated in the last 7 days, out of the items the feed carries. "Photos" is items with a photo in the feed; items without one get the page's `og:image` in the cron. "Feed from CF" is yes when the reader answered `extraction_empty` for the feed URL.

### Offbeat (Atlas Obscura stays)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **Popular Science** | https://www.popsci.com/feed/ | 49 of 74 | 74 of 74 | ok 908 / 854; ok 554 / 519; ok 676 / 660 | yes |
| **JSTOR Daily** | https://daily.jstor.org/feed/ | 5 of 10 | 10 of 10 | ok 831 / 858; ok 511 / 564; ok 753 / 802 | yes |
| The History Blog | http://www.thehistoryblog.com/feed | 5 of 5 | 5 of 5 | ok 318 / 343; ok 399 / 426; ok 324 / 755 (the page count includes reader comments; the article is whole) | yes |
| Nautilus | https://nautil.us/feed/ | 10 of 10 | 10 of 10 | ok 417 / 411; ok 3,296 / 3,330; ok 1,031 / 995 | yes |
| Live Science | https://www.livescience.com/feeds.xml | 38 of 50 | 50 of 50 | ok 578 / 741; **ok 123 / 971**; ok 971 / 1,123 | yes |
| Neatorama | https://www.neatorama.com/feed | 15 of 15 | 12 of 15 | ok 156 / 249; ok 163 / 257; ok 106 / 186 | yes |

- **Popular Science:** about 5 of its latest 30 are shopping posts ("Amazon's early Black Friday deals..."); the AI step drops those.
- **Alternates:** The History Blog (daily archaeology finds; its feed links are http, and `https://www.thehistoryblog.com/feed` also answers) and Nautilus (pages carry a subscriber prompt, but all 3 came through whole).
- **Live Science** is not recommended for now: one article was cut at a "Latest Videos" box (123 of about 776 words), and every page marks itself `isAccessibleForFree: False` inside a `paywall-locker` block, so a metered wall may follow.
- **Neatorama** opens, but its posts are 100 to 250 word blurbs that point elsewhere.
- No "odd news" outlet in the UPI style survived the screen (see Failed). Popular Science carries most of the weird and fun side.

### Health (NPR Health stays)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **The Conversation (US, Health)** | https://theconversation.com/us/health/articles.atom | 8 of 25 | 25 of 25 | ok 1,173 / 1,110; ok 1,342 / 1,264; ok 1,154 / 1,118 | yes |
| **KFF Health News** | https://kffhealthnews.org/feed/ | 10 of 10 | 10 of 10 | ok 918 / 895; ok 1,809 / 1,814; ok 2,391 / 2,313 | yes |
| ABC News Health | https://feeds.abcnews.com/abcnews/healthheadlines | 9 of 25 | 25 of 25 | ok 245 / 234; ok 295 / 284; ok 444 / 429 | yes |
| Science News (Health) | https://www.sciencenews.org/topic/health-medicine/feed | 6 of 20 | 20 of 20 | ok 490 / 453; ok 295 / 308; ok 491 / 458 | yes |

- **Alternates:** ABC News Health (AP wire, short pieces on outbreaks and the FDA) and Science News (research news, about 6 a week).
- KFF's feed carries only 10 items, so its weekly volume is likely higher than 10.

### General: world news (Fox News and NPR News stay)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **DW World** | https://rss.dw.com/atom/rss-en-world | 11 of 11 (8 in 24 h) | 0 | ok 279 / 255 | yes |
| DW Top stories (same host, articles for DW) | https://rss.dw.com/atom/rss-en-top | 21 of 21 | 0 | ok 284 / 252; ok 1,109 / 1,010; ok 1,047 / 939 | yes |
| ABC News International (AP wire) | https://feeds.abcnews.com/abcnews/internationalheadlines | 25 of 25 | 25 of 25 | ok 413 / 389; ok 1,260 / 1,217; ok 534 / 514 | yes |
| CBC World | https://www.cbc.ca/webfeed/rss/rss-world | 19 of 19 | 19 of 19 | ok 1,207 / 1,077; ok 1,007 / 868; ok 918 / 743 | yes |
| France 24 | https://www.france24.com/en/rss | 24 of 24 | 23 of 24 | **forbidden** (also 403 from the Mac) | not tested |

- **DW World** has no photos in the feed; DW pages carry `og:image`, so the cron fills them in (as for CNBC). Its stories this week: the Gulf on the US midterms, Serbia, North Korea and the EU, a Korean Arctic shipping route, Kosovo.
- **Alternates:** ABC News International (AP wire, all outside the US, photos in the feed, 25 in the last 24 hours) and CBC World (5 of its newest 9 were US stories).

### Finance (CNBC and The Guardian Business stay)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **ABC News Business (AP wire)** | https://abcnews.go.com/abcnews/businessheadlines | 25 of 25 | 25 of 25 | ok 680 / 669; ok 421 / 381; ok 468 / 455 | yes |
| CBS MoneyWatch | https://www.cbsnews.com/latest/rss/moneywatch | 29 of 30 | 0 | ok 652 / 649; ok 425 / 416; ok 632 / 627 | yes |
| NPR Business | https://feeds.npr.org/1006/rss.xml | 10 of 10 | 10 of 10 | ok 550 / 499; ok 943 / 878; ok 1,369 / 1,240 | yes |
| MarketWatch | https://feeds.content.dowjones.io/public/rss/mw_topstories | 10 of 10 | 10 of 10 | **forbidden** (401 from the Mac) | not tested |

- **ABC News Business** carries some legal and media stories under business ("'ER' and 'The Pitt' similar enough for lawsuit to move forward"). The feed redirects to `abcnews.com/abcnews/businessheadlines`; using that URL saves a hop. Its `moneyheadlines` feed carries the same items.
- **Alternates:** CBS MoneyWatch (US focus, no feed photos, 5 of 29 are video pages, some cross-posted general news) and NPR Business (good, but NPR would then be in three tabs).

### India (Times of India, India Today, Scroll.in and The Hindu stay)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **The Indian Express (India)** | https://indianexpress.com/section/india/feed/ | 200 of 200 (22 in 24 h) | 200 of 200 | ok 478 / 347; ok 667 / 501; ok 976 / 846 | yes |
| Hindustan Times (India) | https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml | 100 of 100 (96 in 24 h) | 100 of 100 | ok 576 / 513; ok 704 / 586; ok 690 / 574 | yes |

- **Indian Express:** the reader's extra words are a trailing "Live Updates" list (about 65 words on each article); the story text is whole.
- **Hindustan Times** opens, but about 100 items a day means its newest 30 cover a few hours and would crowd the tab. Its reader output also keeps "Also Read" lines.

### Feel Good (Good News Network, Positive News, Sunny Skyz and DailyGood stay)

| Candidate | Feed URL | Last 7 days | Photos | Articles, reader / page words | Feed from CF |
|-|-|-|-|-|-|
| **Reasons to be Cheerful** | https://reasonstobecheerful.world/feed/ | 5 of 10 | 9 of 10 | ok 1,566 / 1,628; ok 2,059 / 2,252; ok 2,080 / 2,302 | yes |
| The Optimist Daily | https://www.optimistdaily.com/feed/ | 9 of 10 | 10 of 10 | ok 549 / 658; ok 558 / 664; ok 542 / 655 | yes |

- **The Optimist Daily** opens, but mixes in tips ("8 surprising household uses for toothpaste") and podcast transcripts, and each article ends with a membership pitch.

## Failed and why

**Blocked from Cloudflare (reader `forbidden`)**
- **France 24** and **MarketWatch.** Both also refuse this Mac with a browser User-Agent (403 and 401), so this is general bot blocking, not Cloudflare only.

**Paywalled or off topic (screened out without reader calls)**
- **STAT News:** 15 of 20 items are STAT+ (subscribers only).
- **NBC News Health:** of 23 items in 7 days, 4 are NBC articles; 11 are TODAY lifestyle, 4 shopping, 4 video.
- **Boing Boing** (deals and partisan politics), **Popular Mechanics** (shopping heavy), **Gizmodo** (tech and politics), **Colossal** (art), **Open Culture** (video and lists), **Kottke** (link posts, 8 of 60 with photos), **Laughing Squid** (no photos, video posts), **Futility Closet** (short puzzles, 2 of 10 with photos), **Aeon** (essays), **Upworthy** (viral, 3 of 10 with photos), **Medical Xpress** (press releases, 30 a day), **Guardian Health** (NHS England, letters and columns), **Fox News Health** (tabloid items such as "NYC marathon runner, 24, dies ... after sending dad chilling texts"), **CBS News Health** (4 a week, no photos), **Guardian World** (US, UK and Australian news mixed in; Guardian is already in two tabs), **NPR World** (NPR is already in General), **The Independent World** (77 a day), **Euronews** and **CBS News World** (no photos, bulletins and video), **Sky News World** (6 items), **Mint** (business and lifestyle mix), **Quartz** (4 items, layoff lists), **The Conversation Business** (6 a week). Not probed: **Al Jazeera** (no feed photos, live blogs), **CSM World** (no feed photos), **ScienceAlert** (overlaps Science).

**Dead, stale or no usable feed (from the Mac)**
- Stale: Oddity Central (newest 48 days), Fox News Science (39 days), NPR Strange News (37 days), Hakai Magazine, CNN Health (since 2023), Yes! Magazine (22 days).
- Too slow: Sky News Strange News and NY Post Weird But True (1 in 7 days each), Messy Nessy Chic and Public Domain Review (1), Amusing Planet (2), Good Good Good (3, mostly roundups).
- No feed or refused: IFLScience and Live Science Health (403), Firstpost (403), Marketplace (404 and 500), Al Jazeera Economy, ABC Australia, Deccan Herald, The News Minute, Down To Earth, Weird Universe and Ripley's (404), HuffPost Weird News (empty) and Good News (404), PBS NewsHour (202, no items, as on Nov 1), The Wire, Discover and Arkeonews (not a feed), Heritage Daily (HTTP/2 error).

## Notes

- **DW: use the Atom feeds.** DW's RDF feeds (`rss.dw.com/rdf/...`) parse with no dates in our parser (0 of 11 items dated), so the 7-day window would drop them. The Atom feeds (`rss.dw.com/atom/...`) carry the same stories with dates.
- **One offbeat story, five outlets.** Today the 2,800-year-old Siberian cannabis tomb was in Live Science, Popular Science, ScienceAlert, Nautilus and Gizmodo. Offbeat science sources overlap with each other and with the Science tab; the story grouping should fold them into one card.
- **Not verified:** one day and three articles per source. Publishers change blocking rules (BBC and Smithsonian opened on Nov 1 and not on Nov 5). A day of `/api/v1/status` and a `measure-reader.mjs` run after the change is the deciding test.
- The reader cached each article it opened for up to 6 hours, as any open does.

## Decision and result (Nov 5, 2026)

- **Checked again** before proposing: each of the 8 picks parsed with the Worker's parser (all items dated, recent ones present) and one fresh article each opened in full through production's reader.
- **Nikhil approved** six of them: DW World (General, 10 at most), ABC News (Finance), The Conversation (Health), JSTOR Daily and Popular Science (Offbeat; Popular Science 10 at most, shopping posts skipped with Wired's title filter), Reasons to be Cheerful (Feel Good). Not added: The Indian Express (India keeps four sources) and KFF Health News (repeats NPR Health). ABC's feed is used at its final address, `https://abcnews.com/abcnews/businessheadlines`.
- **Deployed** as 3.6.1 (Worker version 145ea4c4). All six fetched on the next cron runs from SEA: DW World 10, ABC News 25, The Conversation 8, JSTOR Daily 5, Popular Science 10, Reasons to be Cheerful 5. `verify.mjs` 75 of 75; the decoder sweep 1,274 articles, 0 failures.
- **Measured** with `measure-reader.mjs run 5` on the six: 30 of 30 opened. The one cut flagged (Reasons to be Cheerful) is the yardstick counting the site's cookie notice, newsletter pitches and related teasers; the article is whole. One junk line left: The Conversation's "Read more of our stories about …".
- **Lesson:** the run started before the cron had rebuilt the feed with the new sources, so 18 reads had no feed data (no photo above the title to clean against) and stay cached that way for up to 6 hours. After a source change, wait until `/api/v1/status` shows a feed built after the new sources' first success, then measure.

