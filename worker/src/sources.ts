// Source registry: every category and news source ClearNews knows about.
// Categories show in the order below; "all" is always first.
// Adding, removing or disabling a source is a one-line change here plus a deploy.
// Moved from backend/sources.yaml on Nov 1, 2026 (task #400). FMP (financial_api) was dropped then.

export interface Category {
  id: string;
  name: string;
}

export interface Source {
  id: string;
  name: string;
  type: 'rss' | 'news_api';
  url: string;
  category: string;
  /** Echoed by /api/v1/sources; nothing filters on it. */
  isCuratedPositive: boolean;
  enabled: boolean;
  /** Items whose title matches are skipped (roundups and quizzes that repeat other items). */
  skipTitle?: RegExp;
  /** A lower cap than MAX_PER_SOURCE, to keep paired sources even (General). */
  maxItems?: number;
}

/** Every source is refreshed when its last check is this old (sources.yaml had 15 for all). */
export const TTL_MINUTES = 15;

/** Each source shows at most its newest 30 items, none older than 7 days (#413). */
export const MAX_PER_SOURCE = 30;
export const MAX_AGE_DAYS = 7;

// "all" keeps its id because every app opens it first; since Nov 1, 2026 it is
// the Today brief, and "latest" holds the full list it used to show (#414).
export const CATEGORIES: readonly Category[] = [
  { id: 'all', name: 'Today' },
  { id: 'latest', name: 'Latest' },
  { id: 'ai', name: 'AI' },
  { id: 'physical_ai', name: 'Physical AI' },
  { id: 'space', name: 'Space' },
  { id: 'tech', name: 'Technology' },
  { id: 'science', name: 'Science' },
  { id: 'general', name: 'General' },
  { id: 'local', name: 'Local' },
  { id: 'india', name: 'India' },
  { id: 'finance', name: 'Finance' },
  { id: 'feel_good', name: 'Feel Good' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'health', name: 'Health' },
  { id: 'sports', name: 'Sports' },
  { id: 'offbeat', name: 'Offbeat' },
  { id: 'travel', name: 'Travel' },
];

// Order matters: when two sources carry the same link, the All tab keeps the
// one listed first. Ars Technica files stories in two sections (AI and Gadgets,
// Space and Science), so AI and Space come before Technology and Science.
// Sources added or changed on Nov 1, 2026 were tested from Cloudflare first
// (docs/reviews/2026-11-01-sources-research.md, #414 step 1).
export const SOURCES: readonly Source[] = [
  // AI
  { id: 'the-decoder', name: 'The Decoder', type: 'rss', url: 'https://the-decoder.com/feed/', category: 'ai', isCuratedPositive: false, enabled: true },
  { id: 'ars-technica-ai', name: 'Ars Technica AI', type: 'rss', url: 'https://arstechnica.com/ai/feed/', category: 'ai', isCuratedPositive: false, enabled: true },
  { id: 'latent-space', name: 'Latent Space', type: 'rss', url: 'https://latent.space/feed', category: 'ai', isCuratedPositive: false, enabled: true },
  // Long posts only; the full feed adds quote posts and release notes.
  { id: 'simon-willison', name: 'Simon Willison', type: 'rss', url: 'https://simonwillison.net/atom/entries/', category: 'ai', isCuratedPositive: false, enabled: true },
  { id: 'google-deepmind', name: 'Google DeepMind', type: 'rss', url: 'https://deepmind.google/blog/rss.xml', category: 'ai', isCuratedPositive: false, enabled: true },
  // Physical AI: robotics, humanoids, autonomy (Nikhil's favorite topic).
  { id: 'robot-report', name: 'The Robot Report', type: 'rss', url: 'https://www.therobotreport.com/feed/', category: 'physical_ai', isCuratedPositive: false, enabled: true },
  { id: 'ieee-spectrum-robotics', name: 'IEEE Spectrum Robotics', type: 'rss', url: 'https://spectrum.ieee.org/feeds/topic/robotics.rss', category: 'physical_ai', isCuratedPositive: false, enabled: true },
  { id: 'techcrunch-robotics', name: 'TechCrunch Robotics', type: 'rss', url: 'https://techcrunch.com/category/robotics/feed/', category: 'physical_ai', isCuratedPositive: false, enabled: true },
  // Space
  { id: 'nasaspaceflight', name: 'NASASpaceflight', type: 'rss', url: 'https://www.nasaspaceflight.com/feed/', category: 'space', isCuratedPositive: false, enabled: true },
  { id: 'ars-technica-space', name: 'Ars Technica Space', type: 'rss', url: 'https://arstechnica.com/space/feed/', category: 'space', isCuratedPositive: false, enabled: true },
  { id: 'universe-today', name: 'Universe Today', type: 'rss', url: 'https://www.universetoday.com/rss.xml', category: 'space', isCuratedPositive: false, enabled: true },
  // Moved from Science; the old breaking_news URL redirects here.
  { id: 'nasa-breaking-news', name: 'NASA', type: 'rss', url: 'https://www.nasa.gov/news-release/feed/', category: 'space', isCuratedPositive: false, enabled: true },
  // Technology
  { id: 'the-verge', name: 'The Verge', type: 'rss', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', isCuratedPositive: false, enabled: true },
  // Deals, buying guides and reviews skipped (13 of 30 items on Nov 1).
  { id: 'wired', name: 'Wired', type: 'rss', url: 'https://www.wired.com/feed/rss', category: 'tech', isCuratedPositive: false, enabled: true, skipTitle: /\b(deals?|sale|coupons?|lowest price|review)\b|\(20\d\d\)|^(the )?(\d+ )?best\b|worth buying|percent off|gifts? (for|ideas)/i },
  // Ars's "Tech" section since Nov 1, 2026; technology-lab had 2 items a week.
  { id: 'ars-technica-tech', name: 'Ars Technica Tech', type: 'rss', url: 'https://arstechnica.com/gadgets/feed/', category: 'tech', isCuratedPositive: false, enabled: true },
  // Off since Nov 1, 2026: mostly how-to pieces (14 of 20).
  { id: 'engadget', name: 'Engadget', type: 'rss', url: 'https://www.engadget.com/rss.xml', category: 'tech', isCuratedPositive: false, enabled: false },
  // Science
  { id: 'ars-technica-science', name: 'Ars Technica Science', type: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/science', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'new-scientist', name: 'New Scientist', type: 'rss', url: 'https://www.newscientist.com/feed/home/', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'scientific-american', name: 'Scientific American', type: 'rss', url: 'https://www.scientificamerican.com/platform/syndication/rss/', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'quanta-magazine', name: 'Quanta Magazine', type: 'rss', url: 'https://www.quantamagazine.org/feed/', category: 'science', isCuratedPositive: false, enabled: true },
  // General keeps a balance of right- and left-leaning outlets (Nikhil, Nov 1, 2026).
  // All capped at 10 so the tab stays even all the way down (NPR's feed carries 10).
  // Fox's politics feed since Nov 1, 2026 (#416): of 7 shown from its latest feed,
  // 4 were entertainment and 2 sports, against NPR's 6 politics stories of 10.
  { id: 'fox-news', name: 'Fox News', type: 'rss', url: 'https://moxie.foxnews.com/google-publisher/politics.xml', category: 'general', isCuratedPositive: false, enabled: true, maxItems: 10 },
  { id: 'npr-news', name: 'NPR News', type: 'rss', url: 'https://feeds.npr.org/1001/rss.xml', category: 'general', isCuratedPositive: false, enabled: true, maxItems: 10 },
  // World news, outside US politics (Nikhil, Nov 1, 2026). DW replaces BBC World since Nov 5,
  // 2026 (#453). The Atom feed: DW's RDF feeds carry no dates our parser reads. No feed photos;
  // og:image fills them in.
  { id: 'dw-world', name: 'DW World', type: 'rss', url: 'https://rss.dw.com/atom/rss-en-world', category: 'general', isCuratedPositive: false, enabled: true, maxItems: 10 },
  // Off since Nov 5, 2026 (#453): the reader gets 403 from Cloudflare on every article, so its stories never open. Nikhil: sources that don't give us the story go.
  { id: 'bbc-world', name: 'BBC World', type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'general', isCuratedPositive: false, enabled: false, maxItems: 10 },
  // Off since Nov 1, 2026: a third-party copy of AP (feedx) that stopped updating in September.
  { id: 'ap-news', name: 'AP News', type: 'rss', url: 'https://feedx.net/rss/ap.xml', category: 'general', isCuratedPositive: false, enabled: false },
  // Local (Seattle)
  { id: 'geekwire', name: 'GeekWire', type: 'rss', url: 'https://www.geekwire.com/feed/', category: 'local', isCuratedPositive: false, enabled: true },
  { id: 'kiro7', name: 'KIRO 7', type: 'rss', url: 'https://www.kiro7.com/arc/outboundfeeds/rss/?outputType=xml', category: 'local', isCuratedPositive: false, enabled: true },
  // Crosscut's newsroom, now Cascade PBS; crosscut.com/feed turned into PBS national video.
  { id: 'cascade-pbs', name: 'Cascade PBS', type: 'rss', url: 'https://www.cascadepbs.org/articles/rss/', category: 'local', isCuratedPositive: false, enabled: true },
  { id: 'crosscut', name: 'Crosscut', type: 'rss', url: 'https://crosscut.com/feed', category: 'local', isCuratedPositive: false, enabled: false },
  // Off since Nov 1, 2026: evergreen restaurant guides, nothing new in 9 days.
  { id: 'seattle-eater', name: 'Seattle Eater', type: 'rss', url: 'https://seattle.eater.com/rss/index.xml', category: 'local', isCuratedPositive: false, enabled: false },
  // Off since Nov 1, 2026: answers 403 to every fetch from Cloudflare.
  { id: 'mynorthwest', name: 'MyNorthwest', type: 'rss', url: 'https://mynorthwest.com/feed/', category: 'local', isCuratedPositive: false, enabled: false },
  // Off since Nov 1, 2026: redirects every fetch from Cloudflare to its YouTube channel.
  { id: 'king5-local', name: 'KING 5', type: 'rss', url: 'https://www.king5.com/feeds/syndication/rss/news/local', category: 'local', isCuratedPositive: false, enabled: false },
  // Off since Nov 1, 2026: answers 403 to every fetch from Cloudflare, even from Seattle.
  { id: 'seattle-times-local', name: 'The Seattle Times', type: 'rss', url: 'https://www.seattletimes.com/seattle-news/feed/', category: 'local', isCuratedPositive: false, enabled: false },
  // India
  // Off since Nov 5, 2026 (#453): the reader gets 403 from Cloudflare on every article, so its stories never open. Nikhil: sources that don't give us the story go.
  { id: 'bbc-india', name: 'BBC News India', type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml', category: 'india', isCuratedPositive: false, enabled: false },
  // Off since Nov 5, 2026 (#453): refuses the reader everywhere (403), so its stories never open.
  { id: 'ndtv', name: 'NDTV', type: 'rss', url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'india', isCuratedPositive: false, enabled: false },
  // India-only feed since Nov 1, 2026; the top stories feed carried US and UK news.
  { id: 'times-of-india', name: 'Times of India', type: 'rss', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'india-today', name: 'India Today', type: 'rss', url: 'https://www.indiatoday.in/rss/home', category: 'india', isCuratedPositive: false, enabled: true, skipTitle: /weekly news quiz/i },
  { id: 'scroll-in', name: 'Scroll.in', type: 'rss', url: 'http://feeds.feedburner.com/ScrollinArticles.rss', category: 'india', isCuratedPositive: false, enabled: true, skipTitle: /^rush hour:/i },
  { id: 'the-hindu', name: 'The Hindu', type: 'rss', url: 'https://www.thehindu.com/feeder/default.rss', category: 'india', isCuratedPositive: false, enabled: true },
  // Finance: replaces FMP (approved by Nikhil, Nov 1, 2026). CNBC's Business feed since
  // Nov 1 (#416): its Top News feed was half US politics. No feed images; og:image fills in.
  { id: 'cnbc-business', name: 'CNBC', type: 'rss', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', category: 'finance', isCuratedPositive: false, enabled: true },
  // AP's business wire, with an international slice; replaces BBC Business since Nov 5, 2026 (#453).
  { id: 'abc-business', name: 'ABC News', type: 'rss', url: 'https://abcnews.com/abcnews/businessheadlines', category: 'finance', isCuratedPositive: false, enabled: true },
  // Off since Nov 5, 2026 (#453): the reader gets 403 from Cloudflare on every article, so its stories never open. Nikhil: sources that don't give us the story go.
  { id: 'bbc-business', name: 'BBC Business', type: 'rss', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'finance', isCuratedPositive: false, enabled: false },
  // US edition since Nov 1, 2026; the UK edition was half UK domestic news.
  { id: 'guardian-business', name: 'The Guardian Business', type: 'rss', url: 'https://www.theguardian.com/us/business/rss', category: 'finance', isCuratedPositive: false, enabled: true },
  // Feel Good / Positive News
  { id: 'good-news-network', name: 'Good News Network', type: 'rss', url: 'https://www.goodnewsnetwork.org/feed/', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'positive-news', name: 'Positive News', type: 'rss', url: 'https://positive.news/feed', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'sunny-skyz', name: 'Sunny Skyz', type: 'rss', url: 'https://www.sunnyskyz.com/rss_tebow.php', category: 'feel_good', isCuratedPositive: true, enabled: true },
  // Long, solution-focused stories, about 5 a week; replaces BBC Uplifting since Nov 5, 2026 (#453).
  { id: 'reasons-to-be-cheerful', name: 'Reasons to be Cheerful', type: 'rss', url: 'https://reasonstobecheerful.world/feed/', category: 'feel_good', isCuratedPositive: true, enabled: true },
  // Off since Nov 5, 2026 (#453): the reader gets 403 from Cloudflare on every article, so its stories never open. Nikhil: sources that don't give us the story go.
  { id: 'bbc-uplifting', name: 'BBC Uplifting', type: 'rss', url: 'https://feeds.bbci.co.uk/news/topics/cx2pk70323et/rss.xml', category: 'feel_good', isCuratedPositive: true, enabled: false },
  { id: 'dailygood', name: 'DailyGood', type: 'rss', url: 'https://www.dailygood.org/feed/', category: 'feel_good', isCuratedPositive: true, enabled: true },
  // Entertainment
  { id: 'av-club', name: 'A.V. Club', type: 'rss', url: 'https://www.avclub.com/rss', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'polygon', name: 'Polygon', type: 'rss', url: 'https://www.polygon.com/rss/index.xml', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'variety', name: 'Variety', type: 'rss', url: 'https://variety.com/feed/', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'kotaku', name: 'Kotaku', type: 'rss', url: 'https://kotaku.com/rss', category: 'entertainment', isCuratedPositive: false, enabled: true },
  // Health
  // NPR's current health feed since Nov 1, 2026; the old one (103537970) stopped in January.
  { id: 'npr-health', name: 'NPR Health', type: 'rss', url: 'https://feeds.npr.org/1128/rss.xml', category: 'health', isCuratedPositive: false, enabled: true },
  // Health explainers by researchers (The Conversation US); replaces BBC Health since Nov 5, 2026 (#453).
  { id: 'conversation-health', name: 'The Conversation', type: 'rss', url: 'https://theconversation.com/us/health/articles.atom', category: 'health', isCuratedPositive: false, enabled: true },
  // Off since Nov 5, 2026 (#453): the reader gets 403 from Cloudflare on every article, so its stories never open. Nikhil: sources that don't give us the story go.
  { id: 'bbc-health', name: 'BBC Health', type: 'rss', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'health', isCuratedPositive: false, enabled: false },
  // Sports: betting odds, picks and promo codes skipped (14 of 21 items on Nov 1).
  { id: 'cbs-sports', name: 'CBS Sports', type: 'rss', url: 'https://www.cbssports.com/rss/headlines/', category: 'sports', isCuratedPositive: false, enabled: true, skipTitle: /\b(odds|picks|predictions?|promo|bonus|betting|bets|parlays?|DFS|fantasy|sportsbooks?)\b/i },
  // Offbeat / Weird / Fun
  { id: 'atlas-obscura', name: 'Atlas Obscura', type: 'rss', url: 'https://www.atlasobscura.com/feeds/latest', category: 'offbeat', isCuratedPositive: false, enabled: true },
  // Odd history and culture; replaces Smithsonian since Nov 5, 2026 (#453). About 5 a week.
  { id: 'jstor-daily', name: 'JSTOR Daily', type: 'rss', url: 'https://daily.jstor.org/feed/', category: 'offbeat', isCuratedPositive: false, enabled: true },
  // Odd animal, archaeology and science stories; replaces UPI Odd News since Nov 5, 2026 (#453).
  // No working odd-news feed was left. It posts about 50 a week, so capped at 10 to leave room for
  // the others; shopping posts skipped with Wired's filter.
  { id: 'popular-science', name: 'Popular Science', type: 'rss', url: 'https://www.popsci.com/feed/', category: 'offbeat', isCuratedPositive: false, enabled: true, maxItems: 10, skipTitle: /\b(deals?|sale|coupons?|lowest price|review)\b|\(20\d\d\)|^(the )?(\d+ )?best\b|worth buying|percent off|gifts? (for|ideas)/i },
  // Off since Nov 5, 2026 (#453): refuses the reader everywhere (403), so its stories never open.
  { id: 'upi-odd', name: 'UPI Odd News', type: 'rss', url: 'https://rss.upi.com/news/odd_news.rss', category: 'offbeat', isCuratedPositive: false, enabled: false },
  // Off since Nov 5, 2026 (#453): Cloudflare bot protection on its site; feed and reader get 403
  // from Cloudflare since Nov 5, 02:09 UTC. It had replaced Mental Floss on Nov 1.
  { id: 'smithsonian', name: 'Smithsonian Magazine', type: 'rss', url: 'https://www.smithsonianmag.com/rss/latest_articles/', category: 'offbeat', isCuratedPositive: false, enabled: false },
  { id: 'mental-floss', name: 'Mental Floss', type: 'rss', url: 'https://www.mentalfloss.com/feed', category: 'offbeat', isCuratedPositive: false, enabled: false },
  // Travel
  { id: 'conde-nast-traveler', name: 'Condé Nast Traveler', type: 'rss', url: 'https://www.cntraveler.com/feed/rss', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'guardian-travel', name: 'The Guardian Travel', type: 'rss', url: 'https://www.theguardian.com/uk/travel/rss', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'matador-network', name: 'Matador Network', type: 'rss', url: 'https://matadornetwork.com/feed/', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'frommers', name: "Frommer's", type: 'rss', url: 'https://www.frommers.com/feed', category: 'travel', isCuratedPositive: false, enabled: true },
  // Off: Google News feeds (each article needed two round trips to resolve) and WorldNewsAPI (never built).
  { id: 'google-news-science', name: 'Google News - Science', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'science', isCuratedPositive: false, enabled: false },
  { id: 'google-news-tech', name: 'Google News - Technology', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pIUWlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'tech', isCuratedPositive: false, enabled: false },
  { id: 'google-news-entertainment', name: 'Google News - Entertainment', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'entertainment', isCuratedPositive: false, enabled: false },
  { id: 'google-news-health', name: 'Google News - Health', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en', category: 'health', isCuratedPositive: false, enabled: false },
  { id: 'google-news-sports', name: 'Google News - Sports', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'sports', isCuratedPositive: false, enabled: false },
  { id: 'world-news-api', name: 'WorldNewsAPI', type: 'news_api', url: 'https://api.worldnewsapi.com/search-news', category: 'all', isCuratedPositive: false, enabled: false },
];
