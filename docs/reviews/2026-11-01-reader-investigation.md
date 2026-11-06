# #423: The reader view, measured

**Date:** Nov 1, 2026  
**Ask (Nikhil):** "we never paid much attention to the actual article conversion and display. I think that's a very weak link." Filed as P1, investigation first.  
**Status:** Nikhil approved the server and web items on Nov 1 ("Yes go ahead"). Built and deployed as 3.5.0 (section 7). Photos through getclearnews.com wait for his yes; the feed's full text is held; the app fixes go with iOS 2.1. Rerun on Nov 5 with `worker/scripts/measure-reader.mjs` (section 8).

## 1. Summary

- **Opening works.** 238 of 250 sampled articles from all 53 sources opened in production, in 0.36 s at the median. Two sites block the reader outright: NDTV and UPI's odd-news feed (5 of 5 each).
- **About 1 in 9 articles is cut short.** 24 of 220 checkable articles lose 30% or more of their text. The worst are Ars Technica (all four of its feeds: AI, Tech, Space, Science), where readers get a third to a half of each article and sometimes start mid-story, and BBC (World, Business, India, Uplifting, Health).
- **Page junk stays in.** "Skip to content", newsletter sign-up forms, "149 Comments", rows of empty bullets, "CLICK HERE TO DOWNLOAD THE FOX NEWS APP", subscribe pitches. The same photo shows two or three times (the first photo in the text repeats the photo above the title in 48 of 238 articles), and captions repeat.
- **The apps don't style captions, figures or tables**, so photo credits read like body text. On the web, a long link can push the page sideways on a phone. Every client shows the same failure screen whatever went wrong.
- **A fix is within reach, with no new service and $0.** A newer extractor, Defuddle (MIT, works with the HTML parser the Worker already uses), with Readability as a fallback, cut short articles from 24 to 10 on the same pages and removed about a third of the junk. Add a phrase filter, the full text that 13 feeds already send, resized images served from getclearnews.com, and CSS fixes in each client.

## 2. How the reader works today

- **Server** (`worker/src/reader/reader.ts`): the Worker fetches the article page (Chrome's user agent, 15 s limit, SSRF checks on every redirect), runs Mozilla Readability on linkedom, and keeps an allowlist of tags (no classes, no `srcset`, no iframes or video). No cache: every open fetches the publisher again. The full text some feeds include is never used.
- **Web** (`web/src/components/ReaderModal.tsx`): photo above the title (`image_url` from the feed), title, source, author, time and reading time, then the HTML in Tailwind's `prose` style.
- **iOS** (`ReaderView.swift`, `ReaderWebView.swift`): a sheet with the photo (capped at 250 pt), title and meta row, then a WKWebView with the app's own CSS (system font, 17 px, line height 1.7, dark mode).
- **Android** (`ReaderScreen.kt`): the same layout, a WebView with the same CSS plus theme colors.

## 3. What was measured

- **250 articles**: the 5 newest from each of the 53 enabled sources (Nov 1, 23:50 UTC), read through production's `/api/v1/articles/reader`, so Cloudflare's network and the publishers' bot rules apply.
- **The same pages, saved, through four extractors** with the production tag allowlist: Readability on linkedom (production), Readability on jsdom (a full browser-like page model), Defuddle on linkedom, Defuddle on jsdom.
- **Completeness reference**: the article text publishers embed for search engines (schema.org `articleBody`, 78 articles from 17 sources), and for every page the words in paragraphs of 12+ words outside navigation, headers, footers and sidebars (220 pages; video pages excluded).
- **Display**: real results rendered in copies of each client's reader. iOS through the app's own views in the simulator (27 screenshots), the web with its compiled CSS, Android with its HTML template.

Scripts and raw results were kept in the session scratchpad; the 250-article run is easy to repeat after a change.

## 4. Findings

### 4.1 Opening

| Result | Articles |
|-|-|
| Opened | 238 of 250 (95%) |
| Blocked by the publisher (403): NDTV, UPI Odd News | 10 (all 10 of their articles) |
| No text found: BBC Uplifting | 2 |
| Time to open | median 0.36 s, 90th percentile 0.69 s, slowest 1.5 s |

NDTV and UPI also refused requests from a home connection, so the block is not specific to Cloudflare. Neither feed carries full text, so for those two the best the reader can do is the feed summary and a link.

### 4.2 Cut-short articles

| Source | Readability (production) | Defuddle | The page's paragraphs |
|-|-|-|-|
| Ars Technica (8 checked across its 4 feeds) | 253 to 489 words | 575 to 1,355 | 512 to 1,337 |
| BBC World (3) | 340, 433, 624 | 606, 957, 959 | 543, 948, 846 |
| BBC Uplifting, India, Business | 0 to 305 | 156 to 704 | 144 to 676 |
| Google DeepMind (Genie 4) | 1,827 | 3,796 | about 3,400 |
| A.V. Club | 139 | 245 | 256 |

- **Why:** Ars splits each article into three blocks with ad slots between them (`post-content` three times on the page), and Readability keeps the one it scores highest. That is why some Ars articles open mid-story ("Reddit's average number of DAUqs increased 12 percent…" is the first line of a Reddit story) and show "1 min read" for a 570-word piece.
- **Not the parser:** Readability on jsdom scored exactly the same on every measure (24 cut short).
- **Where the page carries its own text** (17 sources), both extractors capture the whole article; values above 100% are extra text: Fox News about 135%, The Verge 126%.

### 4.3 Junk left in

- The Verge, every article: "Skip to main content", the subtitle twice, the byline and bio, then "Follow topics and authors…", six empty bullets and "The Verge Daily… Email (required)".
- Ars: "Skip to content" and the section label at the top; the author bio, "149 Comments", a stray photo and empty numbered items at the end (10 articles end with "N Comments").
- Fox News: "NEW You can now listen to Fox News articles!", "CLICK HERE TO DOWNLOAD THE FOX NEWS APP". Guardian: "skip past newsletter promotion". Scientific American: "Subscribe to Support Independent Journalism". India Today (with Defuddle): "Advertisement".
- 9 empty figures and 31 articles with empty paragraphs. IEEE's Video Friday keeps "Enjoy today's videos!" with the videos removed.
- The author field: undecoded "Terrence O&#x27;Brien", a Facebook URL as the author (IEEE, 11 articles), "Sponsored Content".

### 4.4 Photos

- The photo above the title repeats as the first photo in the text in 48 of 238 articles; The Verge shows it three times. Ars repeats its caption.
- Weight: median 0.3 MB of images per article, 2.1 MB at the 90th percentile, 15 MB at worst; Quanta's median is 4.9 MB. Ars embeds a 7,936 × 5,034 original. `srcset` is dropped, so the original file is what loads.
- Every photo loads straight from the publisher, which sees the reader's IP address.

### 4.5 Display, per client

| Problem | Web | iOS | Android |
|-|-|-|-|
| Captions and credits styled as body text; figures with default 40 px margins | styled by `prose` | yes | yes |
| Tables, lists without CSS | styled | yes | yes |
| A long link widens the page on a phone (no `overflow-wrap`) | yes | no | no |
| Links in the text | leave the app (same tab) | Safari | external browser, no crash guard |
| Photo above the title | no height limit (a square photo fills a desktop screen) | pops in late and pushes the text down | blank 250 dp box if it fails |
| Meta row with a long author | wraps | squeezes into narrow columns | squeezes |
| Zoom | yes | blocked (`maximum-scale=1`) | blocked |
| Failure screen | same message for every reason | same | same |

Dark mode works in all three.

### 4.6 Pages that are not articles

- BBC video pages give about 225 words of page text and no video.
- Atlas Obscura place pages lose half their text with Readability; Defuddle fails on them.

## 5. Extractors side by side (same 220 pages)

| Pipeline | Missing 30%+ of the article | Junk lines | Empty bullets | Repeated text | Median time |
|-|-|-|-|-|-|
| Readability on linkedom (production) | 24 | 57 | 79 | 35 | 7 ms |
| Readability on jsdom | 24 | 57 | 79 | 35 | 32 ms |
| Defuddle on linkedom | 13 | 38 | 30 | 25 | 40 ms |
| **Defuddle, Readability as fallback** (when Readability finds 50% more paragraph text) | **10** | **40** | **30** | **26** | about 50 ms |

Defuddle alone loses text on Scientific American (it drops the opening paragraphs) and Atlas Obscura; the fallback covers both. Of the 10 still short, Cascade PBS and Latent Space already send their full text in their feeds.

## 6. Proposal

**Server (reaches all three clients with no app release):**
1. Defuddle first, Readability as fallback. First a short spike: bundle Defuddle into the Worker (about 340 KB), rerun the 250 articles in the Workers runtime, compare.
2. A cleanup pass after extraction: a phrase list ("Skip to content", "download the … app", newsletter and subscribe lines, "N Comments"), empty bullets, empty figures and paragraphs, a first photo that repeats the photo above the title, repeated captions.
3. The feed's full text when the feed carries it (13 sources, including Latent Space, NASASpaceflight, The Robot Report, GeekWire, Cascade PBS, Fox News, IEEE Spectrum, Simon Willison), used when the page fails or gives less.
4. A clean author field: decode entities, drop URLs and "Sponsored".
5. Photos through Cloudflare image resizing from getclearnews.com (width about 1,200, modern format): lighter pages, and publishers no longer see readers' addresses. Free for the first 5,000 unique images a month, which reader photos stay well under.
6. A cache of each extracted article (24 hours) and the Today stories read ahead each hour: instant opens, fewer requests to publishers.
7. Video pages answer with a reason (`video`) so clients can say "This is a video" with a link, instead of page text.

**Web (any time):** `overflow-wrap` on the content, links open in a new tab, a height limit on the photo above the title, one rounding rule for reading time, and a failure message per reason.

**Apps (with iOS 2.1, step 4 of #414, and the next Android build):** CSS for figure, figcaption, tables and lists; a placeholder while the photo loads; a meta row that wraps; failure messages per reason; zoom allowed.

**How we know it worked:** rerun the 250-article script. Targets: at most 4% of articles missing 30% or more, junk lines halved, no repeated photo, no failures except the two sites that block the reader.

**Cost:** $0. Workers Paid already covers the CPU (about 50 ms per open), and image resizing stays inside the free tier.

## 7. Built (3.5.0, Nov 1)

- **Extraction:** Defuddle first, Readability as the fallback, both sanitized and cleaned before the comparison; Readability wins only with 25% more words in paragraphs of 12+ words. (The first rule, 50% on uncleaned output, let an author bio and a subscribe pitch tip the choice on The Verge, and then lost Scientific American's opening paragraphs; comparing after cleanup fixed both.)
- **Cleanup:** whole-line furniture, support pitches, word-for-word repeats, tracking pixels, comma-joined `srcset` addresses, the repeated photo above the title with its caption (only caption text goes with it: a figcaption, the photo's own description, a credit or a short line), the byline and bio at the top, orphaned credits, empty wrappers.
- **Also:** clean author field; reason `video` for video pages; results cached in KV for 6 hours and Today's stories read ahead after each brief; web failure messages per reason, links in a new tab, wrapping for long links, a height cap on the photo, single quote marks in quotes.
- **Offline, same 236 pages:** cut 30%+ by the yardstick 24 to 12 (the rest is mostly the yardstick counting subtitles and pitches; real misses are a lead paragraph on three Atlas Obscura places, Latent Space's Arca piece and one Scientific American story), junk lines 46 to 8, empty bullets 79 to 30 (galleries), empty blocks 195 to 0, repeated text 13 to 0, the photo twice 40 to 2.
- **Production, 55 articles re-read after the deploy** (Ars, BBC, The Verge, Fox, Scientific American, DeepMind, A.V. Club, IEEE, NASA, Guardian Travel, Atlas Obscura, NDTV): words 39,504 to 44,763; junk markers 81 to 1. Ars stories 286 to 642, 489 to 1,341, 361 to 1,071, 312 to 921 words; BBC 340 to 606, 175 to 704, 0 to 156; DeepMind 1,828 to 3,801. BBC video pages now answer `video`. NDTV still blocks the reader.
- **Cost:** a first open takes longer, 0.82 s at the median against 0.36 s before, since both extractors and the cleanup run; a second open and Today's stories come from the cache. Bundle 2.2 MB (0.49 MB compressed), startup 26 ms.
- **Checks:** 104 tests (the extraction runs in the Workers runtime), verify 75/75, the iOS decoder sweep (which also opens one article per tab through the reader) 1,413 articles with 0 failures.
- **Photos (3.5.1, Nikhil's yes on Nov 1):** every reader photo now loads from `getclearnews.com/img`, resized to 1,200 pixels in AVIF or WebP, with a signed address so only reader photos are resized. A Quanta article's 7 photos: 5.9 MB to 1.3 MB. No zone setting was needed (Cloudflare resizes from a Worker on any zone it serves).
- **Feed full text:** held with a trigger as #424.

## 8. Rerun with the script (Nov 5, 2026, #436)

- **How:** `worker/scripts/measure-reader.mjs run`, Nov 6, 00:28 UTC (Nov 5 in Seattle). The newest 5 articles of each of the 53 sources, each URL read once: 249 articles. Run folder `2026-11-06T00-28-53Z` under `worker/.fixtures/reader-runs/` (local).
- **Not quite the Nov 1 measure.** The Nov 1 scripts were lost, so the script rebuilds the measures from sections 3 to 5 and #436. Video pages now answer `video` and count as not opened; on Nov 1 they opened as page text. Cut short has two yardsticks. The plain one is the page's long paragraphs outside nav, header, footer and aside, as #436 describes. The tight one also leaves out dialogs, forms, hidden blocks, headings, junk paragraphs and repeated paragraphs. The articles are different, and Fox News and CNBC changed feeds after the Nov 1 sample (3.5.2).

| Measure | Nov 1, before 3.5.0 | Nov 1, after 3.5.0 | Nov 5, production |
|-|-|-|-|
| Opened | 238 of 250 (95%) | not rerun | 210 of 249 (84%) |
| Blocked by the publisher | NDTV, UPI Odd News | not rerun (NDTV still blocked) | NDTV, UPI Odd News, BBC (5 feeds), Smithsonian: 33 |
| Time to open, fresh reads | median 0.36 s | median 0.82 s | median 0.92 s, 90th percentile 1.55 s |
| Cut short 30%+ | 24 | 12 of 236 (offline) | 12 of 203 plain, 4 tight, none on a read-through |
| Junk lines | 46 | 8 (offline) | 10 |
| Empty bullets | 79 | 30 (galleries) | 0, plus 7 gallery items holding only a photo |
| Empty blocks | 195 | 0 | 0 |
| Repeated text | 13 | 0 | 5 |
| Photo twice | 40 | 2 | 1 of 196 |

The "before" and "after" columns are section 7's numbers for the same pages; opened and time are from sections 4.1 and 7.

**Findings**

- **BBC and Smithsonian now refuse the reader.** All five BBC feeds (World, India, Business, Uplifting, Health) and Smithsonian answer 403 to the reader on Cloudflare. The same pages load from a home connection. Both opened on Nov 1, so the block started since. BBC World feeds General and the Today brief. Nothing changed here; it needs a decision.
- **No article misses 30% of its text on a read-through.** The 12 plain cuts are the yardstick counting page extras: Scientific American's subscribe pitches, Cascade PBS's republish box and an author bio printed twice, a sign-up dialog on Latent Space, related headlines on TechCrunch, Kotaku and Atlas Obscura. Atlas Obscura place pages do lose their two or three "Know Before You Go" paragraphs (where it is, tours, best time to visit).
- **Junk the cleanup misses:** The Decoder's subscribe pitch at the end of all 5 of its articles; Fox's "SIGN UP TO GET THE POLITICS NEWSLETTER" and a "Subscribed" button; Good News Network's "SHARE This … With Your Friends…" line (3 of 5).
- **Repeated text:** two paragraphs printed twice by The Hindu, a Verge caption, a Guardian headline, an address on Matador.
- **Photo twice:** one Verge page carries its lead photo twice, and the cleanup removes only the first copy. Its feed photo address also holds a literal `&#038;` where `&` belongs, so the crop settings after it are lost.
- **14 opened articles are not in the served feed** (grouped under another outlet's card, or dropped as deals or listicles). For those the reader answers with no source name, photo or date, which is what a reader gets on opening one from a "Covered by N outlets" list.
- **Not checked:** Times of India pages hold their text in `<div>` with line breaks, not paragraphs, so the yardstick has nothing to measure on any of its 5.
- **Cache:** 15 of 210 opens came from the reader's cache, the oldest extracted 5 hours before the run.
- **Seen in the iOS simulator run, missed by the measure:** an NPR article shows its photo above the title and again at the top of the text. The feed and the page use different addresses for that photo, so neither the cleanup nor the measure matches them. Google DeepMind posts keep "Your browser does not support the video tag." where a video was.

## 9. Four fixes from section 8 (Nov 6, 2026, #453)

Nikhil asked for four: NPR's photo shown twice, the video tag fallback text, coverage lists that include the card's own URL or one URL twice, and photos that come through as "undefined". Built as 3.6.2 and deployed Nov 6 (Worker b1e80c93).

- **NPR's photo twice:** NPR's photo addresses end in "/" and carry the original in `?url=`, so the photo key was empty and never matched. The key now comes from the original. Nearly every NPR article had shown its photo twice; the measure missed it for the same reason and now counts it. The caption in the block right after the removed photo goes too, when it starts with the photo's alt text or carries NPR's "hide caption".
- **Video leftovers:** sanitize-html now drops what is inside `video` and `audio`; the fallback sentence is page furniture; a figure left with only a caption of 12 words or fewer is removed.
- **Coverage:** an entry with the card's own URL, or a URL already listed, is skipped.
- **Photo addresses:** a feed photo must be an absolute web address and not a tracking pixel; the output gate turns any other value into null, and the cron then looks up og:image.
- **Breaker pass** (a separate agent) found three problems in the first version, all fixed: NPR's tracking pixel became the photo; removing caption-only figures also removed long captions whose photo had been lost earlier (DW, JSTOR Daily, The Conversation keep them now); NPR's caption was left at the top of the text.
- **Regression check:** the old and new reader on the same saved pages (the Nov 6 production run): 20 of 241 pages change, each by one of the fixes above; nothing else is removed.

| Measure, same 241 articles | Before (production) | After (new code) |
|-|-|-|
| Opened | 239 | 239 |
| Photo twice | 9 (NPR News 3, NPR Health 5, CBS Sports 1) | 1 (the CBS list thumbnail) |
| Junk lines | 10 | 9 (the DeepMind video line gone) |
| Cut short, tight yardstick | 6 | 5 |
| Repeated text | 7 | 7 |

Before: run `2026-11-06T14-55-19Z` on production. After: `2026-11-06T15-12-52Z`, the same articles through a local Worker running the new code (`READER_BASE`, `SAMPLE_FROM`); its pages came from a Mac, not Cloudflare, so its open times and the few pages that changed in between (a live blog, a CNBC update) are not part of the comparison.

Feed data, production's stored state rebuilt with the new code: cards listing their own URL 2 to 0, cards listing a URL twice 1 to 0, photos that are not web addresses 2 to 0.

**On production after the deploy** (run `2026-11-06T15-51-21Z`, a new sample of 242): photo twice 9 to 0, the DeepMind video line gone, opened 240 of 242. Junk lines stayed at 10: a newly sampled Fox article brought its newsletter line, an open item. The live feed, once rebuilt: no card lists its own URL or a URL twice, and no photo is anything but a web address (NPR's re-read at the next fetch).

**Found on the way, not fixed:** DW's photos inside the text are lost (they carry `data-url` and no `src`), and so are The Conversation's (only `srcset`), so their captions stand alone. Today's shortlist (`src/ai/brief.ts`) still counts one article in two feeds as two outlets, which lifts its score. Still open on #453: The Decoder's pitch, Good News Network's share line, Fox's newsletter line, The Hindu's repeats, the Verge's second copy of its lead photo, Atlas Obscura's "Know Before You Go", the Verge's `&#038;`.

