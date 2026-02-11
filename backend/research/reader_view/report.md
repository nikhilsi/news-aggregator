# Reader View Extraction Test Report

**Date**: 2026-02-10 22:28
**Articles tested**: 24
**Sources covered**: 14

---

## Summary Table

| Source | Category | Title | Traf Words | Traf Imgs | Read Words | Read Imgs | Notes |
|--------|----------|-------|-----------|-----------|-----------|-----------|-------|
| polygon | entertainment | Best DeadGear Cannonball route in Romeo ... | 913 | 0 | 962 | 7 | — |
| polygon | entertainment | How to get Emerald Flowsion in Romeo Is ... | 903 | 0 | 947 | 4 | — |
| nasa-breaking-news | science | Summer Heat Hits Southeastern Australia | 534 | 0 | 535 | 0 | — |
| google-news-entertainment | entertainment | GOP lawmakers urge FCC probe after Bad B... | 50 | 0 | 21 | 0 | read: very short |
| google-news-entertainment | entertainment | Britney Spears Sells Her Song Catalog - ... | — | — | — | — | Fetch failed: HTTPStatusError: Client error  |
| google-news-sports | sports | 2026 Olympics, Day 4 recap: USA women’s ... | 928 | 0 | 1031 | 4 | — |
| the-verge | tech | The Toyota Highlander is now a three-row... | 884 | 0 | 864 | 0 | — |
| google-news-sports | sports | Lucas: Miami Rapid Reactions - Universit... | 1485 | 0 | 704 | 0 | — |
| google-news-health | health | Out-of-state person with measles visited... | 272 | 0 | 272 | 0 | — |
| google-news-science | science | Scientists Have Discovered a Protein Tha... | 681 | 0 | 700 | 2 | — |
| the-verge | tech | Amazon Ring’s Super Bowl ad sparks backl... | 1044 | 0 | 1027 | 0 | — |
| google-news-health | health | Shasta County outbreak drives Calif.'s f... | — | — | — | — | Fetch failed: HTTPStatusError: Client error  |
| fmp-general-news | finance | Yen roars back as US consumer engine spu... | — | — | — | — | Fetch failed: HTTPStatusError: Client error  |
| google-news-tech | tech | Google Chrome 145 Released With JPEG-XL ... | 267 | 0 | 154 | 1 | — |
| engadget | tech | Samsung Galaxy Unpacked 2026: Everything... | 1584 | 0 | 1627 | 0 | — |
| new-scientist | science | Newborn marsupials seen crawling to moth... | 622 | 0 | 612 | 1 | — |
| google-news-science | science | Baboon Sibling Rivalry Suggests Monkeys ... | — | — | — | — | Fetch failed: HTTPStatusError: Client error  |
| ars-technica-science | science | SpaceX's next-gen Super Heavy booster ac... | 357 | 0 | 358 | 0 | — |
| fmp-general-news | finance | Dow Jones & Nasdaq 100: Fed Cut Bets Lif... | 1024 | 0 | 382 | 0 | — |
| google-news-tech | tech | Microsoft February 2026 Patch Tuesday fi... | 2335 | 0 | 1879 | 1 | — |
| wired | tech | Salesforce Workers Circulate Open Letter... | 813 | 0 | 618 | 0 | — |
| engadget | tech | Discord will soon require age verificati... | 540 | 0 | 522 | 0 | — |
| fmp-articles | finance | Spotify's Strategic Focus on AI and User... | 271 | 0 | 269 | 0 | — |
| fmp-articles | finance | Quest Diagnostics (NYSE: DGX) Sees Posit... | 349 | 0 | 328 | 0 | — |

---

## Stats

- **Total articles tested**: 24
- **Successfully fetched**: 20
- **Trafilatura success**: 20/20 (100%)
- **Readability success**: 20/20 (100%)
- **Both succeeded**: 20/20 (100%)

---

## Per-Source Breakdown

### Ars Technica - Science (`ars-technica-science`)

**SpaceX's next-gen Super Heavy booster aces four days of "cryoproof" testing**
- URL: https://arstechnica.com/space/2026/02/spacexs-starbase-is-coming-alive-again-after-a-lull-in-starship-testing/
- Fetch: 150,881 bytes in 386ms
- Raw file: `raw/ars-technica-science-spacexs-next-gen-super-heavy.html`
- **trafilatura**: 357 words, 0 images → `extracted/ars-technica-science-spacexs-next-gen-super-heavy_trafilatura.txt`
  - Preview: _The upgraded Super Heavy booster slated to launch SpaceX’s next Starship flight has completed cryogenic proof testing, clearing a hurdle that resulted..._
- **readability**: 358 words, 0 images → `extracted/ars-technica-science-spacexs-next-gen-super-heavy_readability.html`
  - Preview: _The upgraded Super Heavy booster slated to launch SpaceX’s next Starship flight has completed cryogenic proof testing, clearing a hurdle that resulted..._

### Engadget (`engadget`)

**Samsung Galaxy Unpacked 2026: Everything we're expecting from the S26 launch on February 25**
- URL: https://www.engadget.com/mobile/smartphones/samsung-galaxy-unpacked-2026-everything-were-expecting-from-the-s26-launch-on-february-25-130000524.html?src=rss
- Fetch: 449,937 bytes in 656ms
- Raw file: `raw/engadget-samsung-galaxy-unpacked-2026-everything-w.html`
- **trafilatura**: 1584 words, 0 images → `extracted/engadget-samsung-galaxy-unpacked-2026-everything-w_trafilatura.txt`
  - Preview: _Samsung Galaxy Unpacked 2026: Everything we're expecting from the S26 launch on February 25 What to expect when you're expecting the Samsung Galaxy S2..._
- **readability**: 1627 words, 0 images → `extracted/engadget-samsung-galaxy-unpacked-2026-everything-w_readability.html`
  - Preview: _Samsung’s 2025 was filled with new foldables , an ultra-thin new form factor and the launch of Google's XR platform . After making some announcements ..._

**Discord will soon require age verification to access adult content**
- URL: https://www.engadget.com/social-media/discord-will-soon-require-age-verification-to-access-adult-content-140000218.html?src=rss
- Fetch: 373,180 bytes in 396ms
- Raw file: `raw/engadget-discord-will-soon-require-age-verificatio.html`
- **trafilatura**: 540 words, 0 images → `extracted/engadget-discord-will-soon-require-age-verificatio_trafilatura.txt`
  - Preview: _Discord will soon require age verification to access adult content Following widespread backlash, the company now says AI will automatically verify "m..._
- **readability**: 522 words, 0 images → `extracted/engadget-discord-will-soon-require-age-verificatio_readability.html`
  - Preview: _Discord is the latest company looking to bolster its child safety (again) . Starting in March, all users will have a "teen-appropriate experience" by ..._

### FMP - Market Analysis (`fmp-articles`)

**Spotify's Strategic Focus on AI and User Engagement to Drive Growth**
- URL: https://financialmodelingprep.com/market-news/spotify-growth-strategy-ai-user-engagement-analysis
- Fetch: 66,026 bytes in 642ms
- Raw file: `raw/fmp-articles-spotifys-strategic-focus-on-ai-and-us.html`
- **trafilatura**: 271 words, 0 images → `extracted/fmp-articles-spotifys-strategic-focus-on-ai-and-us_trafilatura.txt`
  - Preview: _FMP Feb 10, 2026 - Evercore ISI sets a price target of $700 for Spotify (NYSE:SPOT), indicating a potential increase of about 47%. - Spotify's stock h..._
- **readability**: 269 words, 0 images → `extracted/fmp-articles-spotifys-strategic-focus-on-ai-and-us_readability.html`
  - Preview: _Evercore ISI sets a price target of $700 for Spotify (NYSE:SPOT) , indicating a potential increase of about 47% . Spotify's stock has seen a 14.77% ri..._

**Quest Diagnostics (NYSE: DGX) Sees Positive Financial Outlook and Stock Upgrade**
- URL: https://financialmodelingprep.com/market-news/quest-diagnostics-dgx-stock-upgrade-financial-outlook-2026
- Fetch: 76,354 bytes in 615ms
- Raw file: `raw/fmp-articles-quest-diagnostics-nyse-dgx-sees-posit.html`
- **trafilatura**: 349 words, 0 images → `extracted/fmp-articles-quest-diagnostics-nyse-dgx-sees-posit_trafilatura.txt`
  - Preview: _FMP Feb 10, 2026 - Jefferies upgraded Quest Diagnostics (NYSE: DGX) to "Buy" with a price target increase from $215 to $220. - Projected 2026 profit a..._
- **readability**: 328 words, 0 images → `extracted/fmp-articles-quest-diagnostics-nyse-dgx-sees-posit_readability.html`
  - Preview: _Quest Diagnostics (DGX) Stock Upgrade and Financial Outlook 2026 Jefferies upgraded Quest Diagnostics (NYSE: DGX) to "Buy" with a price target increas..._

### FMP - Financial News (`fmp-general-news`)

**Yen roars back as US consumer engine sputters**
- URL: https://www.reuters.com/business/finance/global-markets-view-europe-2026-02-11/
- Fetch: FAILED — HTTPStatusError: Client error '401 HTTP Forbidden' for url 'https://www.reuters.com/business/finance/global-markets-v

**Dow Jones & Nasdaq 100: Fed Cut Bets Lift US Futures**
- URL: https://www.fxempire.com/forecasts/article/dow-jones-nasdaq-100-fed-cut-bets-lift-us-futures-1578784
- Fetch: 361,738 bytes in 979ms
- Raw file: `raw/fmp-general-news-dow-jones-nasdaq-100-fed-cut-bets.html`
- **trafilatura**: 1024 words, 0 images → `extracted/fmp-general-news-dow-jones-nasdaq-100-fed-cut-bets_trafilatura.txt`
  - Preview: _Advertisement Advertisement By: - US stock futures advanced in the Asian session as Fed rate cut bets offset weak US jobs concerns. - Dow Jones and Na..._
- **readability**: 382 words, 0 images → `extracted/fmp-general-news-dow-jones-nasdaq-100-fed-cut-bets_readability.html`
  - Preview: _A positive from the January figures was the less marked decline in producer prices, suggesting an improving demand backdrop. Producers adjust prices b..._

### Google News - Entertainment (`google-news-entertainment`)

**GOP lawmakers urge FCC probe after Bad Bunny's Super Bowl performance - Axios**
- URL: https://www.axios.com/2026/02/10/bad-bunny-super-bowl-halftime-show-fcc-investigation
- Fetch: 185,749 bytes in 270ms
- Raw file: `raw/google-news-entertainment-gop-lawmakers-urge-fcc-p.html`
- **trafilatura**: 50 words, 0 images → `extracted/google-news-entertainment-gop-lawmakers-urge-fcc-p_trafilatura.txt`
  - Preview: _9 hours ago - Politics & Policy Bad Bunny's "illegal" halftime show needs investigation: Republicans Add Axios as your preferred source to see more of..._
- **readability**: 21 words, 0 images → `extracted/google-news-entertainment-gop-lawmakers-urge-fcc-p_readability.html`
  - Preview: _Bad Bunny performs at the Super Bowl 60 halftime show on Feb. 8 in Santa Clara, California. Photo: Kevin Sabitus/Getty Images..._

**Britney Spears Sells Her Song Catalog - The New York Times**
- URL: https://www.nytimes.com/2026/02/10/arts/music/britney-spears-catalog-deal.html
- Fetch: FAILED — HTTPStatusError: Client error '403 Forbidden' for url 'https://www.nytimes.com/2026/02/10/arts/music/britney-spears-c

### Google News - Health (`google-news-health`)

**Out-of-state person with measles visited N.J. hospital, health department says - NJ.com**
- URL: https://www.nj.com/middlesex/2026/02/out-of-state-person-with-measles-visited-nj-hospital-health-departments-says.html
- Fetch: 226,939 bytes in 223ms
- Raw file: `raw/google-news-health-out-of-state-person-with-measle.html`
- **trafilatura**: 272 words, 0 images → `extracted/google-news-health-out-of-state-person-with-measle_trafilatura.txt`
  - Preview: _An out-of-state person with measles visited a hospital in New Jersey last week, health officials said. On Friday, Feb. 6, the person visited the pedia..._
- **readability**: 272 words, 0 images → `extracted/google-news-health-out-of-state-person-with-measle_readability.html`
  - Preview: _An out-of-state person with measles visited a hospital in New Jersey last week, health officials said. On Friday, Feb. 6, the person visited the pedia..._

**Shasta County outbreak drives Calif.'s first measles surge since 2020 - SFGATE**
- URL: https://www.sfgate.com/bayarea/article/shasta-county-outbreak-california-measles-21346144.php
- Fetch: FAILED — HTTPStatusError: Client error '403 Forbidden' for url 'https://www.sfgate.com/bayarea/article/shasta-county-outbreak-

### Google News - Science (`google-news-science`)

**Scientists Have Discovered a Protein That Reverses Brain Aging in The Lab - ScienceAlert**
- URL: https://www.sciencealert.com/scientists-have-discovered-a-protein-that-reverses-brain-aging-in-the-lab
- Fetch: 191,862 bytes in 160ms
- Raw file: `raw/google-news-science-scientists-have-discovered-a-p.html`
- **trafilatura**: 681 words, 0 images → `extracted/google-news-science-scientists-have-discovered-a-p_trafilatura.txt`
  - Preview: _Our brains age along with the rest of our bodies, and as they do, they produce fewer new brain cells. Now, researchers have found a key mechanism thro..._
- **readability**: 700 words, 2 images → `extracted/google-news-science-scientists-have-discovered-a-p_readability.html`
  - Preview: _Our brains age along with the rest of our bodies , and as they do, they produce fewer new brain cells . Now, researchers have found a key mechanism th..._

**Baboon Sibling Rivalry Suggests Monkeys Feel Jealousy Like People - The New York Times**
- URL: https://www.nytimes.com/2026/02/10/science/jealousy-siblings-baboons-monkeys.html
- Fetch: FAILED — HTTPStatusError: Client error '403 Forbidden' for url 'https://www.nytimes.com/2026/02/10/science/jealousy-siblings-b

### Google News - Sports (`google-news-sports`)

**2026 Olympics, Day 4 recap: USA women’s hockey rolls on, Shiffrin struggles, Malinin shines - The New York Times**
- URL: https://www.nytimes.com/athletic/7036946/2026/02/10/olympics-recap-usa-womens-hockey-shiffrin-malinin/
- Fetch: 233,435 bytes in 142ms
- Raw file: `raw/google-news-sports-2026-olympics-day-4-recap-usa-w.html`
- **trafilatura**: 928 words, 0 images → `extracted/google-news-sports-2026-olympics-day-4-recap-usa-w_trafilatura.txt`
  - Preview: _The Athletic has live coverage of the 2026 Winter Olympics. It happens. Many expected a nail-biter when women’s hockey powerhouses U.S. and Canada cla..._
- **readability**: 1031 words, 4 images → `extracted/google-news-sports-2026-olympics-day-4-recap-usa-w_readability.html`
  - Preview: _The Athletic has live coverage of the 2026 Winter Olympics. It happens. Many expected a nail-biter when women’s hockey powerhouses U.S. and Canada cla..._

**Lucas: Miami Rapid Reactions - University of North Carolina Athletics**
- URL: https://goheels.com/news/2026/2/10/mens-basketball-lucas-miami-rapid-reactions
- Fetch: 690,516 bytes in 909ms
- Raw file: `raw/google-news-sports-lucas-miami-rapid-reactions-uni.html`
- **trafilatura**: 1485 words, 0 images → `extracted/google-news-sports-lucas-miami-rapid-reactions-uni_trafilatura.txt`
  - Preview: _University of North Carolina Athletics Lucas: Miami Rapid Reactions February 10, 2026 | Men's Basketball, Featured Writers, Adam Lucas Quick takeaways..._
- **readability**: 704 words, 0 images → `extracted/google-news-sports-lucas-miami-rapid-reactions-uni_readability.html`
  - Preview: _By Adam Lucas 1. Second half offensive struggles torpedoed Carolina on the road, as the Heels lost 75-66 at Miami while shooting 26.5% in the final 20..._

### Google News - Technology (`google-news-tech`)

**Google Chrome 145 Released With JPEG-XL Image Support - Phoronix**
- URL: https://www.phoronix.com/news/Chrome-145-Released
- Fetch: 77,647 bytes in 358ms
- Raw file: `raw/google-news-tech-google-chrome-145-released-with-j.html`
- **trafilatura**: 267 words, 0 images → `extracted/google-news-tech-google-chrome-145-released-with-j_trafilatura.txt`
  - Preview: _Google Chrome 145 Released With JPEG-XL Image Support Back in 2022 Google deprecated and then removed JPEG-XL image support from the Chrome/Chromium b..._
- **readability**: 154 words, 1 images → `extracted/google-news-tech-google-chrome-145-released-with-j_readability.html`
  - Preview: _Back in 2022 Google deprecated and then removed JPEG-XL image support from the Chrome/Chromium browser codebase and now in 2026 it's back. Last month ..._

**Microsoft February 2026 Patch Tuesday fixes 6 zero-days, 58 flaws - BleepingComputer**
- URL: https://www.bleepingcomputer.com/news/microsoft/microsoft-february-2026-patch-tuesday-fixes-6-zero-days-58-flaws/
- Fetch: 118,124 bytes in 794ms
- Raw file: `raw/google-news-tech-microsoft-february-2026-patch-tue.html`
- **trafilatura**: 2335 words, 0 images → `extracted/google-news-tech-microsoft-february-2026-patch-tue_trafilatura.txt`
  - Preview: _Today is Microsoft's February 2026 Patch Tuesday with security updates for 58 flaws, including 6 actively exploited and three publicly disclosed zero-..._
- **readability**: 1879 words, 1 images → `extracted/google-news-tech-microsoft-february-2026-patch-tue_readability.html`
  - Preview: _Today is Microsoft's February 2026 Patch Tuesday with security updates for 58 flaws, including 6 actively exploited and three publicly disclosed zero-..._

### NASA Breaking News (`nasa-breaking-news`)

**Summer Heat Hits Southeastern Australia**
- URL: https://science.nasa.gov/earth/earth-observatory/summer-heat-hits-southeastern-australia/
- Fetch: 285,094 bytes in 864ms
- Raw file: `raw/nasa-breaking-news-summer-heat-hits-southeastern-a.html`
- **trafilatura**: 534 words, 0 images → `extracted/nasa-breaking-news-summer-heat-hits-southeastern-a_trafilatura.txt`
  - Preview: _While a part of the United States braved extreme winter cold, January 2026 brought sweltering summer conditions to many parts of Australia. Australia’..._
- **readability**: 535 words, 0 images → `extracted/nasa-breaking-news-summer-heat-hits-southeastern-a_readability.html`
  - Preview: _While a part of the United States braved extreme winter cold , January 2026 brought sweltering summer conditions to many parts of Australia. Australia..._

### New Scientist (`new-scientist`)

**Newborn marsupials seen crawling to mother's pouch for the first time**
- URL: https://www.newscientist.com/article/2514915-newborn-marsupials-seen-crawling-to-mothers-pouch-for-the-first-time/?utm_campaign=RSS%7CNSNS&utm_source=NSNS&utm_medium=RSS&utm_content=home
- Fetch: 438,093 bytes in 151ms
- Raw file: `raw/new-scientist-newborn-marsupials-seen-crawling-to.html`
- **trafilatura**: 622 words, 0 images → `extracted/new-scientist-newborn-marsupials-seen-crawling-to_trafilatura.txt`
  - Preview: _Minuscule marsupial newborns that weigh less than a grain of rice have been filmed crawling towards their mother’s pouch for the first time. Unlike pl..._
- **readability**: 612 words, 1 images → `extracted/new-scientist-newborn-marsupials-seen-crawling-to_readability.html`
  - Preview: _VIDEO Minuscule marsupial newborns that weigh less than a grain of rice have been filmed crawling towards their mother’s pouch for the first time. Unl..._

### Polygon (`polygon`)

**Best DeadGear Cannonball route in Romeo Is a Dead Man**
- URL: https://www.polygon.com/romeo-is-a-dead-man-best-deadgear-cannonball-route-power-ups/
- Fetch: 263,684 bytes in 477ms
- Raw file: `raw/polygon-best-deadgear-cannonball-route-in-romeo-is.html`
- **trafilatura**: 913 words, 0 images → `extracted/polygon-best-deadgear-cannonball-route-in-romeo-is_trafilatura.txt`
  - Preview: _Romeo Is a Dead Man's DeadGear Cannonball power-up minigame is so much more than some classic arcade entertainment. While navigating the purple alien ..._
- **readability**: 962 words, 7 images → `extracted/polygon-best-deadgear-cannonball-route-in-romeo-is_readability.html`
  - Preview: _Romeo Is a Dead Man 's DeadGear Cannonball power-up minigame is so much more than some classic arcade entertainment. While navigating the purple alien..._

**How to get Emerald Flowsion in Romeo Is a Dead Man**
- URL: https://www.polygon.com/romeo-is-a-dead-man-emerald-flowsion-how-to-get/
- Fetch: 248,651 bytes in 454ms
- Raw file: `raw/polygon-how-to-get-emerald-flowsion-in-romeo-is-a.html`
- **trafilatura**: 903 words, 0 images → `extracted/polygon-how-to-get-emerald-flowsion-in-romeo-is-a_trafilatura.txt`
  - Preview: _Be sure to get Emerald Flowsion in Romeo Is a Dead Man, or he'll become a permanently dead man before long. Serving as the space-time continuum's most..._
- **readability**: 947 words, 4 images → `extracted/polygon-how-to-get-emerald-flowsion-in-romeo-is-a_readability.html`
  - Preview: _Be sure to get Emerald Flowsion in Romeo Is a Dead Man , or he'll become a permanently dead man before long. Serving as the space-time continuum's mos..._

### The Verge (`the-verge`)

**The Toyota Highlander is now a three-row electric SUV with 320 miles of range**
- URL: https://www.theverge.com/transportation/875906/toyota-highlander-ev-suv-range-specs
- Fetch: 522,926 bytes in 129ms
- Raw file: `raw/the-verge-the-toyota-highlander-is-now-a-three-row.html`
- **trafilatura**: 884 words, 0 images → `extracted/the-verge-the-toyota-highlander-is-now-a-three-row_trafilatura.txt`
  - Preview: _Toyota unveiled the new 2027 Highlander, a fully redesigned midsize SUV that marks the brand’s first three-row electric vehicle for the US market and ..._
- **readability**: 864 words, 0 images → `extracted/the-verge-the-toyota-highlander-is-now-a-three-row_readability.html`
  - Preview: _Toyota unveiled the new 2027 Highlander, a fully redesigned midsize SUV that marks the brand’s first three-row electric vehicle for the US market and ..._

**Amazon Ring’s Super Bowl ad sparks backlash amid fears of mass surveillance**
- URL: https://www.theverge.com/tech/876866/ring-search-party-super-bowl-ad-online-backlash
- Fetch: 537,288 bytes in 46ms
- Raw file: `raw/the-verge-amazon-rings-super-bowl-ad-sparks-backla.html`
- **trafilatura**: 1044 words, 0 images → `extracted/the-verge-amazon-rings-super-bowl-ad-sparks-backla_trafilatura.txt`
  - Preview: _Ring’s new Search Party feature has once again drawn backlash for the company. A 30-second ad that aired during Sunday’s Super Bowl showed Ring camera..._
- **readability**: 1027 words, 0 images → `extracted/the-verge-amazon-rings-super-bowl-ad-sparks-backla_readability.html`
  - Preview: _Ring’s new Search Party feature has once again drawn backlash for the company. A 30-second ad that aired during Sunday’s Super Bowl showed Ring camera..._

### Wired (`wired`)

**Salesforce Workers Circulate Open Letter Urging CEO Marc Benioff to Denounce ICE**
- URL: https://www.wired.com/story/letter-salesforce-employees-sent-after-marc-benioffs-ice-comments/
- Fetch: 1,334,417 bytes in 216ms
- Raw file: `raw/wired-salesforce-workers-circulate-open-letter-urg.html`
- **trafilatura**: 813 words, 0 images → `extracted/wired-salesforce-workers-circulate-open-letter-urg_trafilatura.txt`
  - Preview: _Employees at Salesforce are circulating an internal letter to chief executive Marc Benioff calling on him to denounce recent actions by US Immigration..._
- **readability**: 618 words, 0 images → `extracted/wired-salesforce-workers-circulate-open-letter-urg_readability.html`
  - Preview: _Employees at Salesforce are circulating an internal letter to chief executive Marc Benioff calling on him to denounce recent actions by US Immigration..._

---

## Files

- `raw/` — Original HTML pages as downloaded
- `extracted/*_trafilatura.txt` — Plain text extracted by trafilatura
- `extracted/*_readability.html` — HTML extracted by readability-lxml
