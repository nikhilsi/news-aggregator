# News sources research for ClearNews

**Checked on 2026-11-01, a Sunday, between about 18:40 and 19:30 UTC.** Weekday volume is higher for most outlets, so "items in the last 24 hours" undercounts. The 7-day counts are the better guide.

**How it was checked.**
- **Live audit.** Every article in every tab was read from `getclearnews.com/api/v1/articles?category=<id>&per_page=50` (703 articles), plus `/api/v1/status`. Shares of low-signal items were counted by hand from the titles, with a regex pass to help.
- **Mac test.** Each candidate feed was fetched from this Mac with the browser User-Agent the Worker uses, and parsed with feedparser. "With image" uses the Worker's own order: `media:content`, `media:thumbnail`, an image enclosure, then an `<img>` in the summary or content. Items without one still get an `og:image` from the article page in the cron.
- **Cloudflare test.** Feeds and articles were probed through the live reader, `GET /api/v1/articles/reader?url=...`, which fetches from Cloudflare. 38 probes in total, spaced 4.5 seconds apart. "CF feed reachable" means the reader answered `extraction_empty` (the URL answered and was not an HTML article). "Forbidden" means the publisher refused Cloudflare.
- Scripts and raw results are in `/private/tmp/claude-501/sources-research/`. No repo file other than this one was changed.

## Recommendation

Add an **AI** tab and a **Space** tab, fix four feeds that point at the wrong thing, drop two dead or low-signal feeds, and filter shopping and betting items out of two more. The AI tab is the biggest win: AI stories already make up 38 of the 703 live items, but they are scattered over six tabs.

| # | Action | id | Name | Feed URL | Tab | Why | Tests (Mac, then Cloudflare) |
|-|-|-|-|-|-|-|-|
| 1 | Add | `the-decoder` | The Decoder | https://the-decoder.com/feed/ | ai (new) | AI-only news: models, research, industry. Busiest AI source tested: 7 items in 24 hours on a Sunday. | 10 items, newest 4 h, 10/10 images, ETag and Last-Modified. CF feed reachable. Article ok, 877 words. |
| 2 | Add | `ars-technica-ai` | Ars Technica AI | https://arstechnica.com/ai/feed/ | ai | Critical reporting on models, agents, security and policy. | 18 in 7 days, 20/20 images, ETag and LM. CF feed reachable. Article ok, 285 words. |
| 3 | Add | `latent-space` | Latent Space | https://latent.space/feed | ai | AI engineering: a daily AINews recap plus builder interviews (coding agents, inference, evals). | 11 in 7 days, 18/20 images, LM. CF feed reachable. Article ok, 703 words. |
| 4 | Add | `simon-willison` | Simon Willison | https://simonwillison.net/atom/entries/ | ai | Long posts on LLM tools, local models and prompt injection. About one a week, so low volume but high signal. | 1 in 7 days, 9/15 images, LM. CF reachable (probed on the same host's full feed). Article ok, 2,301 words. |
| 5 | Add | `robot-report` | The Robot Report | https://www.therobotreport.com/feed/ | ai | Robotics and physical AI: humanoids, world models, industry. Nothing in the app covers this today. | 15 in 7 days, 15/15 images, ETag and LM. CF feed reachable. Article ok, 1,256 words. |
| 6 | Add | `nasaspaceflight` | NASASpaceflight | https://www.nasaspaceflight.com/feed/ | space (new) | Launches, Starship, Artemis, the space industry in depth. | 5 in 7 days, 10/10 images, ETag and LM. CF feed reachable. Article ok, 1,195 words. |
| 7 | Add | `ars-technica-space` | Ars Technica Space | https://arstechnica.com/space/feed/ | space | Space industry analysis and the weekly Rocket Report. | 7 in 7 days, 20/20 images, ETag and LM. CF feed reachable. Article ok, 5,180 words. |
| 8 | Add | `universe-today` | Universe Today | https://www.universetoday.com/rss.xml | space | Astronomy and planetary science, several a day. | 20 in 7 days, 20/20 images, ETag and LM. CF feed reachable. Article ok, 637 words. |
| 9 | Move | `nasa-breaking-news` | NASA | unchanged | science to space | Belongs with the other space sources. | Live today, 9 items. |
| 10 | Add | `quanta-magazine` | Quanta Magazine | https://www.quantamagazine.org/feed/ | science | Long explainers in math, physics and biology. The "big picture" pick. | 4 in 7 days, 5/5 images, ETag and LM. CF feed reachable. Article ok, 2,017 words. |
| 11 | Fix URL | `ars-technica-tech` | Ars Technica Tech | https://arstechnica.com/gadgets/feed/ | tech | The current `technology-lab` feed had 2 items in 7 days. `/gadgets/` is Ars's "Tech" section. | 17 in 7 days, 20/20 images, ETag and LM. CF feed reachable. Article not probed (Ars articles passed twice). |
| 12 | Replace | `cascade-pbs` (replaces `crosscut`) | Cascade PBS | https://www.cascadepbs.org/articles/rss/ | local | `crosscut.com/feed` now redirects to the station's video feed: 0 of 14 live items are Seattle news. This is the same newsroom's article feed. | 4 in 7 days (low), 15/15 images, ETag. CF feed reachable. Article ok, 511 words. |
| 13 | Fix URL | `guardian-business` | The Guardian Business | https://www.theguardian.com/us/business/rss | finance | The UK edition feed is half UK domestic (14 of 30). Same publisher, US edition. | 16 in 7 days, 20/20 images, ETag. CF feed reachable. Article not probed. |
| 14 | Replace | `smithsonian` (enable, replaces `mental-floss`) | Smithsonian Magazine | https://www.smithsonianmag.com/rss/latest_articles/ | offbeat | Mental Floss is 10 of 30 lists or quizzes. Smithsonian was turned off for a droplet 403; it works from Cloudflare. | 10 in 7 days, 10/10 images, LM. CF feed reachable. Article ok, 960 words. |
| 15 | Drop | `engadget` | Engadget | | tech | 14 of 20 live items are how-to or service pieces. | |
| 16 | Drop | `seattle-eater` | Seattle Eater | | local | 0 items in the app. The feed is 10 evergreen "best restaurants" guides; the newest is 9 days old. | |
| 17 | Filter | `wired` | Wired | unchanged | tech | 13 of 30 live items are deals, buying guides or product reviews. A title filter removes them (regex below). | |
| 18 | Filter | `cbs-sports` | CBS Sports | unchanged | sports | 14 of 21 live items (29 of 36 in the full feed) are betting odds, picks or promo codes. | |

**Result.** 42 enabled sources become 49: 9 added, 2 dropped, 2 swapped one for one (rows 12 and 14), 2 URLs fixed (rows 11 and 13). Tabs go from 12 to 14. New tab volume, from the 7-day counts: AI about 55 to 75 items a week (The Decoder's feed holds only 10 items, so its weekly count is uncertain), Space about 40.

### Needs a decision from Nikhil

1. **Fox News feed.** 14 of the 25 live Fox items are celebrity, sports or lifestyle, for example "'Baywatch' beauty Erika Eleniak on pace for $1 million OnlyFans payday decades after iconic TV role". Fox's politics feed, https://moxie.foxnews.com/google-publisher/politics.xml, is all politics (25 items, 15 in 24 hours, 25/25 images, ETag, CF feed reachable). Swapping keeps the right and left balance with NPR News but makes General more political. Same host as today's Fox feed, which already redirects to `moxie.foxnews.com`.
2. **A Space tab, or fold it into Science.** Folding would make Science 8 sources. A separate tab keeps both readable. I lean toward the tab.
3. **Robotics inside the AI tab.** I put The Robot Report in AI. "AI & Robotics" is a possible tab name, but tab names have to fit the UI. That is a question for the presentation work.
4. **Tab order.** For pull, AI probably belongs right after General. Also for the presentation work.
5. **Simon Willison's volume.** His long posts come about once a week. His full feed (`/atom/everything/`, 15 in 7 days) adds quote posts and software release notes (for example "datasette-llm 0.1a9"), which read as noise in a news list. I picked the long posts only.
6. **Smithsonian in Offbeat or Science.** Its old entry says Science. Its "Smart News" items (a 2,800-year-old bone flute, a 4,000-year-old dog paw print) fit Offbeat, and Science already gains Quanta.
7. **Optional drops.** Sunny Skyz (5 items a week; 2 of 5 repeat Good News Network or DailyGood stories; titles show broken entities such as "Bus Driverand#039;s"). BBC Business (14 of 27 items UK domestic); CNBC's Business feed tested well as a US replacement (25 in 7 days, earnings heavy; article ok, 622 words; no feed images, so it relies on `og:image` like today's CNBC feed).

### Notes for the change itself

- **Dedup runs per tab.** A URL in two tabs' feeds shows in both tabs. Measured overlap: 6 of 20 Ars AI items are also in the Ars Tech feed, and 5 of 20 Ars Space items are also in Ars Science. Only the All tab dedups across sources, and there the source listed first in `sources.ts` wins (when both have images). So list the AI and Space sources before Tech and Science.
- **The NASA URL** `https://www.nasa.gov/rss/dyn/breaking_news.rss` redirects to `https://www.nasa.gov/news-release/feed/`. Using the final URL saves a hop. Optional.
- **Wired filter** (skipped 17 of 40 in the full feed and 13 of 30 live; every news story was kept):
  ```
  /\b(deals?|sale|coupons?|lowest price|review)\b|\(20\d\d\)|^(the )?(\d+ )?best\b|worth buying|gifts? (for|ideas)/i
  ```
- **CBS Sports filter** (kept 7 of 36 in the full feed). "picks" could also catch a trade story about draft picks.
  ```
  /\b(odds|picks|predictions?|promo|bonus|betting|bets|parlays?|DFS|fantasy|sportsbooks?)\b/i
  ```
- Both filters are stopgaps. The AI step planned in #414 is meant to filter this kind of fluff for every source; when it lands, these regexes can go.

## Evidence

### 1. Audit of the current sources (live API)

"Low signal" means deals and buying guides, quizzes, horoscopes, numbered lists, celebrity or tabloid items, programme stubs, or items off the tab's topic. Counts are by hand from the titles.

| Tab | Source | Live items | Low signal | What the noise is | Example |
|-|-|-|-|-|-|
| General | Fox News | 25 | 14 (56%) | Celebrity (5), sports (4), lifestyle (5) | "Paige Spiranac unloads her Halloween content on America, Jenn Sterger as Wednesday Addams & Capturing Bigfoot" |
| General | NPR News | 10 | 0 to 2 | Service pieces, still news | "Here's how to watch election night as the polls close, hour-by-hour" |
| Local | GeekWire | 30 | 4 (13%) | Weekly roundup, "Tech Moves" people columns, podcast | "Week in Review: Most popular stories on GeekWire for the week of Oct. 25, 2026" |
| Local | KIRO 7 | 14 | 8 (57%) | Traffic, crash and crime briefs | "Diesel truck rolls over, closes Snohomish road Friday night" |
| Local | Crosscut | 14 | 14 (100%) | Not local: PBS NewsHour, Washington Week, Amanpour and NOVA clips, a show trailer | "October 30, 2026 - PBS News Hour full episode"; "Jacob Aune II With WR" |
| Local | Seattle Eater | 0 | n/a | Nothing in the 7-day window | Feed is 10 evergreen guides such as "The 38 Best Restaurants in Seattle" |
| Feel Good | Good News Network | 25 | 2 (8%) | Horoscope column, daily history item | "Your Halloween Horoscope Advice: 'Free Will Astrology' by Rob Brezsny" |
| Feel Good | BBC Uplifting | 5 | 0 | | |
| Feel Good | DailyGood | 7 | 0 | | |
| Feel Good | Sunny Skyz | 5 | 2 (repeats) | Same stories as GNN and DailyGood; broken HTML entities | "5th Grade Girl Saves Bus Driverand#039;s Life After Recognizing Something Was Wrong" |
| Feel Good | Positive News | 5 | 1 | Self promotion | "Positive News launches new video podcast exploring what's going right in the world" |
| Science | Ars Technica Science | 10 | 0 | | |
| Science | NASA | 9 | 0 | 3 are Astronomy Picture of the Day posts | |
| Science | New Scientist | 10 | 4 (40%) | Book extracts and lists | "Read an extract from Dark Eden by Chris Beckett" |
| Science | Scientific American | 30 | about 6 (20%) | Halloween pieces, a puzzle, a book review | "Math Puzzle: Mysterious pyramid" |
| Tech | The Verge | 10 | 3 (30%) | Staff fluff | "Happy Pikmin Day Eve"; "Keyboards of The Verge" |
| Tech | Wired | 30 | 13 (43%) | Deals (6), buying guides (4), product reviews (3) | "Wayfair Coupons: Up to 80% Off November 2026"; "Mattress Deals: Save Over $600 Before Black Friday 2026" |
| Tech | Ars Technica Tech | 2 | stale | The feed now carries only the IT section: 2 items in 7 days | |
| Tech | Engadget | 20 | 14 (70%) | How-to and service pieces | "5 Spotify settings you'll wish you changed sooner"; "You might be neglecting the one thing that keeps your PC healthy" |
| Entertainment | Variety | 10 | 3 | Streaming lists, a shopping guide | "The Best Pop-Culture Advent Calendars for 2026" |
| Entertainment | Polygon | 10 | 4 | Lists | "The 10 Most Anticipated Sci-Fi and Fantasy Books of November 2026" |
| Entertainment | Kotaku | 20 | 3 | Lists, shopping | "15 Excellent Horror Games You Can Get On Steam For Less Than $10 Each" |
| Entertainment | A.V. Club | 30 | on topic | Mostly celebrity and TV news, which is the tab's job | "Jennifer Lawrence is all done getting painted blue for a paycheck, thank you very much" |
| Finance | CNBC | 30 | 4 (13%) | Lifestyle, affiliate rates, stock tips | "I'm a psychologist who studies couples: People in the happiest relationships do 1 thing differently..." |
| Finance | BBC Business | 27 | 14 UK domestic, 1 stub | Budget, Poundland, Yorkshire Water; a radio programme listing | "Burnham 'ready to support' Poundland staff as retailer faces collapse"; "The Bottom Line" |
| Finance | The Guardian Business | 30 | 14 UK domestic, 3 opinion | UK budget and high street | "High street 'slot farms' could avoid budget tax rise through bingo hall loophole" |
| Health | BBC Health | 21 | 2 stubs | Radio programme listings; NHS focus | "Woman's Hour"; "Inside Health" |
| Health | NPR Health | 10 | 1 | A quiz inside an otherwise good piece | The feed answered with 0 items in the 18:38 UTC run and 10 at 18:54; transient |
| Sports | CBS Sports | 21 | 14 (67%) | Betting odds, picks, promo codes | "Use DraftKings promo code to get $200 bonus + NBA League Pass on Bills-Ravens, Chiefs-Broncos, NFL Week 8" |
| Offbeat | Mental Floss | 30 | 10 (33%) lists or quiz; most of the rest is evergreen trivia | | "Quiz: Can You Name All 50 U.S. States on a Blank Map?"; "20 Movie Stars of the '90s Who Disappeared From Hollywood" |
| Offbeat | Atlas Obscura | 13 | 0 | Short place entries, on topic | "World's Tallest Barber Pole in Forest Grove, Oregon" |
| Offbeat | UPI Odd News | 25 | 15 (60%) short video captions | "Watch:" and "Look:" posts | "Watch: Deer causes chaos inside North Carolina laundromat" |
| Travel | Condé Nast Traveler | 29 | 12 (41%) | Lists, gear guides, a horoscope | "Snag These 11 Fall Travel Deals Before It's Too Late"; "Your November 2026 Horoscope: We're Turning a Corner This Month..." |
| Travel | The Guardian Travel | 7 | 0 | 4 of 7 are UK trips | |
| Travel | Matador Network | 10 | 0 | | |
| Travel | Frommer's | 6 | 0 | | |
| India | Times of India | 19 | 9 on one rally | Quote spats from the INDIA bloc rally | |
| India | NDTV | 20 | 6 (30%) crime | | "Man Argues With Wife, Family Interferes. He Kills Daughter And Frames Them" |
| India | India Today, The Hindu, Scroll.in, BBC News India | 16, 29, 30, 9 | low | The Hindu leans hyper-local civic news | |

Side notes:
- Live Fox shows 25 items against NPR's 10. The uncommitted `maxItems: 10` in the working tree evens that out once deployed.
- Every live item has an image (feed image or `og:image`), so images are not a gap today.

### 2. Topic gaps against Nikhil's interests

- **AI has no home.** 38 of 703 live titles mention AI (AI, OpenAI, Anthropic, Claude, Gemini, agents, Nvidia and similar). They sit in Local (12, all GeekWire), Finance (10), Tech (9), Science (3), Entertainment (3) and Feel Good (1).
- **Tech is consumer and shopping.** 27 of the 62 Tech items are Engadget how-tos or Wired shopping. Ars Tech is nearly empty.
- **Space is mostly press releases.** Science carries about 10 space titles this week, from NASA (press releases and picture posts) and Ars Science. GeekWire adds a little Blue Origin business news. No launch or space industry source.
- **Robotics and physical AI: 4 relevant titles in the whole app**, none where you would look for them (an Engadget item on a Meta humanoid prototype, a Guardian item on London robotaxis, two UPI robot videos).
- **Markets have one US source.** CNBC is the only US business feed; BBC and Guardian are about half UK domestic.
- **Local is thin.** Crosscut carries no local news and Seattle Eater carries nothing, so Local is GeekWire plus KIRO 7.

### 3. Candidate test results

Mac columns: HTTP status, items in the feed, age of the newest item in hours, items dated in the last 7 days, items with an image in the feed, and validators. "Reachable" in the CF feed column means `extraction_empty`. All feed content types on the Mac were XML.

**Recommended**

| Candidate | HTTP | Items | Newest (h) | Last 7 days | With image | ETag | Last-Modified | CF feed | CF article |
|-|-|-|-|-|-|-|-|-|-|
| The Decoder | 200 | 10 | 4.0 | 10 | 10 | yes | yes | reachable | ok, 877 words |
| Ars Technica AI | 200 | 20 | 45.2 | 18 | 20 | yes | yes | reachable | ok, 285 words |
| Latent Space | 200 | 20 | 26.8 | 11 | 18 | no | yes | reachable | ok, 703 words |
| Simon Willison (entries) | 200 | 15 | 101.0 | 1 | 9 | no | yes | reachable (full feed, same host) | ok, 2,301 words |
| The Robot Report | 200 | 15 | 4.9 | 15 | 15 | yes | yes | reachable | ok, 1,256 words |
| NASASpaceflight | 200 | 10 | 15.3 | 5 | 10 | yes | yes | reachable | ok, 1,195 words |
| Ars Technica Space | 200 | 20 | 42.8 | 7 | 20 | yes | yes | reachable | ok, 5,180 words |
| Universe Today | 200 | 20 | 15.8 | 20 | 20 | yes | yes | reachable | ok, 637 words |
| NASA (current, for reference) | 200 | 10 | 14.9 | 10 | 10 | yes | yes | live in the app | live in the app |
| Quanta Magazine | 200 | 5 | 52.1 | 4 | 5 | yes | yes | reachable | ok, 2,017 words |
| Ars Technica Tech (`/gadgets/`) | 200 | 20 | 45.2 | 17 | 20 | yes | yes | reachable | not probed |
| Cascade PBS articles | 200 | 15 | 77.0 | 4 | 15 | yes | no | reachable | ok, 511 words |
| Smithsonian Magazine | 200 | 10 | 46.6 | 10 | 10 | no | yes | reachable | ok, 960 words |
| The Guardian Business (US) | 200 | 20 | 6.9 | 16 | 20 | yes | no | reachable | not probed |
| Fox News politics (decision) | 200 | 25 | 1.4 | 25 | 25 | yes | no | reachable | not probed |
| CNBC Business (optional) | 200 | 30 | 30.9 | 25 | 0 | no | no | not probed (same host as live CNBC) | ok, 622 words |

For comparison, the current Ars Tech feed (`technology-lab`) gave 20 items, newest 45.8 h, 2 in 7 days.

**Tested and not picked**

| Candidate | HTTP | Items | Newest (h) | Last 7 days | With image | CF feed | CF article |
|-|-|-|-|-|-|-|-|
| Spaceflight Now | 200 | 10 | 44.2 | 7 | 10 | reachable | **forbidden (2 of 2 articles)** |
| ESPNcricinfo | 200 | 100 | 0.0 | 100 | 100 | reachable | **forbidden** |
| Tangle | 200 | 15 | 4.9 | 14 | 15 | reachable | ok but 58 words (member wall) |
| The Verge AI | 200 | 10 | 26.8 | 10 | 10 | reachable | ok, 308 words |
| TechCrunch AI | 200 | 20 | 21.2 | 20 | 0 | reachable | ok, 226 words |
| Simon Willison (full feed) | 200 | 30 | 2.3 | 15 | 10 | reachable | ok, 89 words (a quote post) |

## Not recommended and why

**Blocked or cut off from Cloudflare**
- **Spaceflight Now.** Excellent launch coverage, and the feed is reachable, but both article pages tried returned 403 to Cloudflare (200 from the Mac). The in-app reader would fail on every item. NASASpaceflight and Ars Space cover the same ground and read fine.
- **ESPNcricinfo.** Good for cricket, and the feed is reachable, but the article page returned 403 to Cloudflare.
- **Tangle.** Built to show left and right arguments side by side, which suits General's balance goal. But posts sit behind a member wall: the reader got 58 words from a daily piece.

**AI candidates**
- **The Verge AI.** Good, but The Verge is already in Tech and 4 of its 10 AI items are also in the main feed. A consumer slant. First alternate if a fifth AI news source is wanted.
- **TechCrunch AI.** No images in the feed, 3 of 20 items promote TechCrunch's own conference ("4 days left: How TechCrunch Founder Summit helps you make more useful connections to scale"), and the reader got only 226 words.
- **MIT Technology Review AI.** 6 of the 10 items in its AI feed are sponsored "Insights" pieces (for example "Creating AI value with enterprise context"). Metered paywall. Newest item 81 hours old.
- **IEEE Spectrum AI and Robotics.** AI: 6 in 7 days, mixed with IEEE member news and sponsored items ("Master AI Chip Principles With New IEEE Design Program"). Robotics: 2 in 7 days.
- **VentureBeat AI.** The AI category feed is stale (newest item 66 days old); the main feed carries only 7 items.
- **Wired AI.** 5 of its 10 items are already in the main Wired feed.
- **Company blogs.** Anthropic has no feed (`/rss.xml` and `/news/rss.xml` return 404). The Google DeepMind feed returned 0 items. OpenAI's feed has 1,341 items and no images. The Google AI blog had 1 item in 7 days. Hugging Face has 894 items and no images. The news sources above cover the announcements that matter.
- **Weekly newsletters.** Import AI (1 in 7 days), Interconnects (2), Ahead of AI (newest 200 h), One Useful Thing (newest 291 h), Last Week in AI (newest 566 h). Good reads, too slow for a daily tab. Latent Space's daily recap covers the same ground.
- **Hacker News (hnrss.org).** No images in any item, and links go to arbitrary sites (repos, PDFs). Not probed from Cloudflare.
- **Techmeme.** Item links point at techmeme.com pages, not the articles, and many sources behind them are paywalled.
- **Others.** 404 Media (partial paywall, not probed), SemiAnalysis (paywalled, 1 in 7 days), MarkTechPost (3 of 10 items with images; not reviewed further), AI News at artificialintelligence-news.com (502 from the Mac).

**Space candidates**
- **SpaceNews.** Mostly company press releases and webinar notices ("TechnoMile Recognized as a 2026 Inc. Power Partner Award Winner"). 7 in 7 days.
- **Space.com.** 50 in 7 days with images, but heavy on sci-fi entertainment, "On this day in space" posts, podcasts and skywatching lists. It would swamp a Space tab. Not probed.
- **Payload, ESA, JPL, Planetary Society, EarthSky.** Payload (13 in 7 days, space business) is a fair later add. ESA had 7 in 7 days; JPL and the Planetary Society send no images; EarthSky is night-sky guides. None probed.

**Big picture, general and markets**
- **The Conversation.** Academic explainers, 50 in 7 days, mostly US politics and policy. It would swamp any tab.
- **Axios** (87 in 7 days, mostly politics scoops) and **The Hill** (100 items, 33 in 24 hours, many opinion pieces). Either would shift General's balance; that is Nikhil's call. Neither probed.
- **Christian Science Monitor** (no images in the feed), **Semafor** (174 items in 7 days in one feed, many regional briefs), **The Dispatch** (newsletters and podcasts, partial paywall), **Big Think** (self-help mixed with astrophysics), **Rest of World** (2 in 7 days). Not probed.
- **Markets.** The WSJ feed is stale (newest item about 21 months old). Bloomberg has no feed images and a paywall. Business Insider Markets was 9 of 10 law firm "shareholder alert" releases. CNBC Investing is stock tips ("Bank of America says buy these stocks ahead of earnings before it's too late"). The Yahoo Finance feed returned 404. Fortune mixes career advice and opinion.

**Local, sports and India**
- **KUOW** (feed URL redirects to the homepage, 0 items), **Axios Seattle** and **Seattle PI** (404). **KOMO** works from the Mac (41 in 7 days) and could be a later Local add; not probed. The Urbanist, West Seattle Blog and Capitol Hill Seattle are neighborhood or single-topic.
- **ESPN** and **PBS NewsHour** feeds answered 202 with no items. **BBC Sport** is mostly UK football. **Yahoo Sports** is high volume and aggregated.
- **India.** The tab was just cleaned (#413), so no change proposed. For later: The Print's feed returned 0 items, Indian Express carried 200 items in 24 hours (too many), and Inc42 (Indian startups, 24 in 7 days) could suit an India tech angle. None probed.

## What I could not verify

- **One day, one probe each.** Publishers change blocking rules. Spaceflight Now and Cricinfo show the pattern: feed allowed, articles refused. A day of `/api/v1/status` after any change is the deciding test, as with the move.
- **`extraction_empty` does not strictly prove a feed.** A 200 challenge page would look the same. Response times were 0.1 to 1.7 seconds, the Mac saw XML for every feed, and articles on the same hosts read fine (except Spaceflight Now and Cricinfo), so I think these feeds are fine.
- **Not probed from Cloudflare:** articles from Ars Tech `/gadgets/`, Guardian US Business and Fox politics (each is on a host already serving a live source); the Simon Willison entries feed (the full feed on the same host was probed); the CNBC Business feed (same host as the live CNBC feed).
- **Ars word count.** The reader returned 285 words for the Ars AI article; the page has about 887 words inside `<p>` tags, some of them page furniture. It may be a partial extraction. Ars sources already behave this way in the app today.
- **Sunday volume.** The 24-hour numbers are low for most outlets. The 7-day numbers are capped by feed length for feeds that carry only 10 items (The Decoder, The Verge AI, Smithsonian), so their weekly volume may be higher than shown.
- **Low-signal shares** are hand counts from titles over one week. Halloween inflated seasonal fluff (Scientific American, Mental Floss, Condé Nast Traveler).
