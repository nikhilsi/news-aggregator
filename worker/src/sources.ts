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
}

/** Every source is refreshed when its last check is this old (sources.yaml had 15 for all). */
export const TTL_MINUTES = 15;

export const CATEGORIES: readonly Category[] = [
  { id: 'all', name: 'All' },
  { id: 'general', name: 'General' },
  { id: 'local', name: 'Local' },
  { id: 'feel_good', name: 'Feel Good' },
  { id: 'science', name: 'Science' },
  { id: 'tech', name: 'Technology' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'finance', name: 'Finance' },
  { id: 'health', name: 'Health' },
  { id: 'sports', name: 'Sports' },
  { id: 'offbeat', name: 'Offbeat' },
  { id: 'travel', name: 'Travel' },
  { id: 'india', name: 'India' },
];

export const SOURCES: readonly Source[] = [
  // Feel Good / Positive News
  { id: 'good-news-network', name: 'Good News Network', type: 'rss', url: 'https://www.goodnewsnetwork.org/feed/', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'positive-news', name: 'Positive News', type: 'rss', url: 'https://positive.news/feed', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'sunny-skyz', name: 'Sunny Skyz', type: 'rss', url: 'https://www.sunnyskyz.com/rss_tebow.php', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'bbc-uplifting', name: 'BBC Uplifting', type: 'rss', url: 'https://feeds.bbci.co.uk/news/topics/cx2pk70323et/rss.xml', category: 'feel_good', isCuratedPositive: true, enabled: true },
  { id: 'dailygood', name: 'DailyGood', type: 'rss', url: 'https://www.dailygood.org/feed/', category: 'feel_good', isCuratedPositive: true, enabled: true },
  // Science & Discovery
  { id: 'ars-technica-science', name: 'Ars Technica - Science', type: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/science', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'nasa-breaking-news', name: 'NASA Breaking News', type: 'rss', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'new-scientist', name: 'New Scientist', type: 'rss', url: 'https://www.newscientist.com/feed/home/', category: 'science', isCuratedPositive: false, enabled: true },
  { id: 'scientific-american', name: 'Scientific American', type: 'rss', url: 'https://www.scientificamerican.com/platform/syndication/rss/', category: 'science', isCuratedPositive: false, enabled: true },
  // Technology
  { id: 'the-verge', name: 'The Verge', type: 'rss', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', isCuratedPositive: false, enabled: true },
  { id: 'wired', name: 'Wired', type: 'rss', url: 'https://www.wired.com/feed/rss', category: 'tech', isCuratedPositive: false, enabled: true },
  { id: 'ars-technica-tech', name: 'Ars Technica - Tech', type: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'tech', isCuratedPositive: false, enabled: true },
  { id: 'engadget', name: 'Engadget', type: 'rss', url: 'https://www.engadget.com/rss.xml', category: 'tech', isCuratedPositive: false, enabled: true },
  // General News
  { id: 'ap-news', name: 'AP News', type: 'rss', url: 'https://feedx.net/rss/ap.xml', category: 'general', isCuratedPositive: false, enabled: true },
  { id: 'fox-news', name: 'Fox News', type: 'rss', url: 'https://feeds.foxnews.com/foxnews/latest', category: 'general', isCuratedPositive: false, enabled: true },
  // Health
  { id: 'npr-health', name: 'NPR Health', type: 'rss', url: 'https://feeds.npr.org/103537970/rss.xml', category: 'health', isCuratedPositive: false, enabled: true },
  { id: 'bbc-health', name: 'BBC Health', type: 'rss', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'health', isCuratedPositive: false, enabled: true },
  // Sports
  { id: 'cbs-sports', name: 'CBS Sports', type: 'rss', url: 'https://www.cbssports.com/rss/headlines/', category: 'sports', isCuratedPositive: false, enabled: true },
  // Offbeat / Weird / Fun
  { id: 'atlas-obscura', name: 'Atlas Obscura', type: 'rss', url: 'https://www.atlasobscura.com/feeds/latest', category: 'offbeat', isCuratedPositive: false, enabled: true },
  { id: 'mental-floss', name: 'Mental Floss', type: 'rss', url: 'https://www.mentalfloss.com/feed', category: 'offbeat', isCuratedPositive: false, enabled: true },
  { id: 'upi-odd', name: 'UPI Odd News', type: 'rss', url: 'https://rss.upi.com/news/odd_news.rss', category: 'offbeat', isCuratedPositive: false, enabled: true },
  // Entertainment
  { id: 'av-club', name: 'A.V. Club', type: 'rss', url: 'https://www.avclub.com/rss', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'polygon', name: 'Polygon', type: 'rss', url: 'https://www.polygon.com/rss/index.xml', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'variety', name: 'Variety', type: 'rss', url: 'https://variety.com/feed/', category: 'entertainment', isCuratedPositive: false, enabled: true },
  { id: 'kotaku', name: 'Kotaku', type: 'rss', url: 'https://kotaku.com/rss', category: 'entertainment', isCuratedPositive: false, enabled: true },
  // Local (Seattle)
  { id: 'geekwire', name: 'GeekWire', type: 'rss', url: 'https://www.geekwire.com/feed/', category: 'local', isCuratedPositive: false, enabled: true },
  { id: 'seattle-eater', name: 'Seattle Eater', type: 'rss', url: 'https://seattle.eater.com/rss/index.xml', category: 'local', isCuratedPositive: false, enabled: true },
  // Off since Nov 1, 2026: answers 403 to every fetch from Cloudflare. The Seattle Times replaces it.
  { id: 'mynorthwest', name: 'MyNorthwest', type: 'rss', url: 'https://mynorthwest.com/feed/', category: 'local', isCuratedPositive: false, enabled: false },
  { id: 'crosscut', name: 'Crosscut', type: 'rss', url: 'https://crosscut.com/feed', category: 'local', isCuratedPositive: false, enabled: true },
  // Off since Nov 1, 2026: redirects every fetch from Cloudflare to its YouTube channel.
  { id: 'king5-local', name: 'KING 5', type: 'rss', url: 'https://www.king5.com/feeds/syndication/rss/news/local', category: 'local', isCuratedPositive: false, enabled: false },
  { id: 'seattle-times-local', name: 'The Seattle Times', type: 'rss', url: 'https://www.seattletimes.com/seattle-news/feed/', category: 'local', isCuratedPositive: false, enabled: true },
  { id: 'smithsonian', name: 'Smithsonian Magazine', type: 'rss', url: 'https://www.smithsonianmag.com/rss/latest_articles/', category: 'science', isCuratedPositive: false, enabled: false },
  // Google News (RSS)
  { id: 'google-news-science', name: 'Google News - Science', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'science', isCuratedPositive: false, enabled: false },
  { id: 'google-news-tech', name: 'Google News - Technology', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pIUWlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'tech', isCuratedPositive: false, enabled: false },
  { id: 'google-news-entertainment', name: 'Google News - Entertainment', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'entertainment', isCuratedPositive: false, enabled: false },
  { id: 'google-news-health', name: 'Google News - Health', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en', category: 'health', isCuratedPositive: false, enabled: false },
  { id: 'google-news-sports', name: 'Google News - Sports', type: 'rss', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'sports', isCuratedPositive: false, enabled: false },
  // News APIs
  { id: 'world-news-api', name: 'WorldNewsAPI', type: 'news_api', url: 'https://api.worldnewsapi.com/search-news', category: 'all', isCuratedPositive: false, enabled: false },
  // Finance: replaces FMP (approved by Nikhil, Nov 1, 2026).
  { id: 'cnbc-top-news', name: 'CNBC', type: 'rss', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', category: 'finance', isCuratedPositive: false, enabled: true },
  { id: 'bbc-business', name: 'BBC Business', type: 'rss', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'finance', isCuratedPositive: false, enabled: true },
  { id: 'guardian-business', name: 'The Guardian Business', type: 'rss', url: 'https://www.theguardian.com/uk/business/rss', category: 'finance', isCuratedPositive: false, enabled: true },
  // Travel
  { id: 'conde-nast-traveler', name: 'Condé Nast Traveler', type: 'rss', url: 'https://www.cntraveler.com/feed/rss', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'guardian-travel', name: 'The Guardian Travel', type: 'rss', url: 'https://www.theguardian.com/uk/travel/rss', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'matador-network', name: 'Matador Network', type: 'rss', url: 'https://matadornetwork.com/feed/', category: 'travel', isCuratedPositive: false, enabled: true },
  { id: 'frommers', name: "Frommer's", type: 'rss', url: 'https://www.frommers.com/feed', category: 'travel', isCuratedPositive: false, enabled: true },
  // India
  { id: 'bbc-india', name: 'BBC News India', type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'ndtv', name: 'NDTV', type: 'rss', url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'times-of-india', name: 'Times of India', type: 'rss', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'india-today', name: 'India Today', type: 'rss', url: 'https://www.indiatoday.in/rss/home', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'scroll-in', name: 'Scroll.in', type: 'rss', url: 'http://feeds.feedburner.com/ScrollinArticles.rss', category: 'india', isCuratedPositive: false, enabled: true },
  { id: 'the-hindu', name: 'The Hindu', type: 'rss', url: 'https://www.thehindu.com/feeder/default.rss', category: 'india', isCuratedPositive: false, enabled: true },
];
