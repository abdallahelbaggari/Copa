/* =================================================================
   COPA.pi · functions/news.js · Cloudflare Pages Function
   Route: /news
   Multi-source football news aggregator
   Sources: NewsAPI, Guardian, BBC RSS, ESPN, Sky Sports, Goal.com
================================================================= */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=120',
};

const WC_FILTER = ['football','soccer','premier league','la liga','serie a',
  'bundesliga','champions league','copa','transfer','goal','match','fixture',
  'standings','injury','manager','club','player','striker','midfielder','defender'];

async function fetchGuardian(key) {
  const url = `https://content.guardianapis.com/search?section=football&show-fields=thumbnail,bodyText,trailText&page-size=20&api-key=${key||'test'}`;
  try {
    const res = await fetch(url, { signal:AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.response?.results||[]).map(a => ({
      id:      'g_'+a.id.replace(/[^a-z0-9]/gi,'_'),
      title:   a.webTitle,
      summary: a.fields?.trailText?.replace(/<[^>]+>/g,'').slice(0,200)||'',
      image:   a.fields?.thumbnail||null,
      source:  'The Guardian',
      url:     a.webUrl,
      date:    a.webPublicationDate,
      category:'football',
    }));
  } catch(e) { return []; }
}

async function fetchNewsAPI(key) {
  if (!key) return [];
  const url = `https://newsapi.org/v2/everything?q=football+soccer&language=en&sortBy=publishedAt&pageSize=20&apiKey=${key}`;
  try {
    const res = await fetch(url, { signal:AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles||[])
      .filter(a => a.title && !a.title.includes('[Removed]'))
      .map(a => ({
        id:      'n_'+Buffer.from(a.url||'').toString('base64').slice(0,12),
        title:   a.title,
        summary: (a.description||'').slice(0,200),
        image:   a.urlToImage||null,
        source:  a.source?.name||'NewsAPI',
        url:     a.url,
        date:    a.publishedAt,
        category:'football',
      }));
  } catch(e) { return []; }
}

async function fetchRSS(feedUrl, sourceName) {
  try {
    const res = await fetch(feedUrl, { signal:AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const text = await res.text();
    const items = [];
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    for (const m of itemMatches) {
      const block = m[1];
      const get   = (tag) => {
        const match = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        return match ? (match[1]||match[2]||'').trim() : '';
      };
      const getAttr = (tag, attr) => {
        const match = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i'));
        return match ? match[1] : '';
      };
      const title = get('title');
      const desc  = get('description');
      if (!title) continue;
      const low = (title+desc).toLowerCase();
      const relevant = WC_FILTER.some(w => low.includes(w));
      if (!relevant) continue;
      items.push({
        id:      sourceName.slice(0,3).toLowerCase()+'_'+items.length+'_'+Date.now(),
        title,
        summary: desc.replace(/<[^>]+>/g,'').slice(0,200),
        image:   getAttr('enclosure','url') || getAttr('media:content','url') || null,
        source:  sourceName,
        url:     get('link'),
        date:    get('pubDate') || new Date().toISOString(),
        category:'football',
      });
      if (items.length >= 15) break;
    }
    return items;
  } catch(e) { return []; }
}

export async function onRequestGet(context) {
  const url      = new URL(context.request.url);
  const league   = url.searchParams.get('league') || 'all';
  const page     = parseInt(url.searchParams.get('page')||'1', 10);

  const NEWS_KEY    = context.env.NEWS_API_KEY    || null;
  const GUARDIAN_KEY = context.env.GUARDIAN_KEY   || 'test';

  const RSS_FEEDS = [
    ['https://www.goal.com/feeds/en/news',                    'Goal.com'],
    ['https://feeds.bbci.co.uk/sport/football/rss.xml',       'BBC Sport'],
    ['https://www.skysports.com/rss/12040',                    'Sky Sports'],
    ['https://www.espn.com/espn/rss/soccer/news',              'ESPN FC'],
    ['https://talksport.com/football/feed/',                   'talkSPORT'],
    ['https://www.fourfourtwo.com/rss',                        'FourFourTwo'],
  ];

  /* Fetch all sources in parallel */
  const fetches = [
    fetchGuardian(GUARDIAN_KEY),
    fetchNewsAPI(NEWS_KEY),
    ...RSS_FEEDS.map(([feed, name]) => fetchRSS(feed, name)),
  ];

  const results = await Promise.allSettled(fetches);
  let articles = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') articles = articles.concat(r.value);
  });

  /* Deduplicate by title similarity */
  const seen   = new Set();
  const unique = articles.filter(a => {
    const key = a.title.toLowerCase().slice(0,40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  /* Sort by date */
  unique.sort((a,b) => new Date(b.date)-new Date(a.date));

  /* Pagination */
  const perPage = 20;
  const start   = (page-1)*perPage;
  const paged   = unique.slice(start, start+perPage);

  return new Response(JSON.stringify({
    success:  true,
    league,
    page,
    total:    unique.length,
    hasMore:  start+perPage < unique.length,
    sources:  [...new Set(unique.map(a=>a.source))],
    articles: paged,
  }), { headers:{ ...CORS, 'Content-Type':'application/json' }});
}

export async function onRequestOptions() {
  return new Response(null, { headers:CORS });
}
