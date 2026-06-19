/**
 * COPA.pi — /news v3.0
 * Fast, reliable football news from JSON APIs only (no RSS)
 * RSS feeds are blocked from Cloudflare Workers — using JSON only
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=60',
};

/* ── ESPN JSON (no key, works from Workers) ── */
async function fetchESPN() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/scoreboard?limit=50',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const articles = [];
    (data.articles || []).slice(0, 20).forEach((a, i) => {
      if (!a.headline) return;
      articles.push({
        id:      'espn_' + i + '_' + Date.now(),
        title:   a.headline,
        summary: a.description || a.summary || '',
        image:   a.images?.[0]?.url || null,
        source:  'ESPN FC',
        url:     a.links?.web?.href || a.link || '',
        date:    a.published || new Date().toISOString(),
        category:'football',
      });
    });
    return articles;
  } catch(e) { return []; }
}

/* ── ESPN News API ── */
async function fetchESPNNews() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/news?limit=40',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).slice(0, 30).map((a, i) => ({
      id:      'espnn_' + i + '_' + Date.now(),
      title:   a.headline || a.title || '',
      summary: a.description || a.summary || '',
      image:   a.images?.[0]?.url || null,
      source:  'ESPN',
      url:     a.links?.web?.href || a.link || '',
      date:    a.published || a.lastModified || new Date().toISOString(),
      category:'football',
    })).filter(a => a.title);
  } catch(e) { return []; }
}

/* ── Guardian API (test key = 12 free/day, enough for news) ── */
async function fetchGuardian(key) {
  const apiKey = key || 'test';
  try {
    const res = await fetch(
      `https://content.guardianapis.com/search?section=football&show-fields=thumbnail,trailText&page-size=30&api-key=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.response?.results || []).map((a, i) => ({
      id:      'g_' + i + '_' + Date.now(),
      title:   a.webTitle || '',
      summary: (a.fields?.trailText || '').replace(/<[^>]+>/g, '').slice(0, 200),
      image:   a.fields?.thumbnail || null,
      source:  'The Guardian',
      url:     a.webUrl || '',
      date:    a.webPublicationDate || new Date().toISOString(),
      category:'football',
    })).filter(a => a.title);
  } catch(e) { return []; }
}

/* ── GNews API (free, 100/day) ── */
async function fetchGNews(key) {
  if (!key) return [];
  try {
    const res = await fetch(
      `https://gnews.io/api/v4/search?q=football+soccer&lang=en&max=20&apikey=${key}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map((a, i) => ({
      id:      'gn_' + i,
      title:   a.title || '',
      summary: (a.description || '').slice(0, 200),
      image:   a.image || null,
      source:  a.source?.name || 'GNews',
      url:     a.url || '',
      date:    a.publishedAt || new Date().toISOString(),
      category:'football',
    })).filter(a => a.title);
  } catch(e) { return []; }
}

/* ── Football-data.org match news (always works, use FD_API_KEY) ── */
async function fetchMatchReports(fdKey) {
  if (!fdKey) return [];
  try {
    const now  = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 3);
    const fmt  = d => d.toISOString().slice(0,10);
    const res  = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${fmt(from)}&dateTo=${fmt(now)}&status=FINISHED`,
      { headers: { 'X-Auth-Token': fdKey }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.matches || []).slice(0, 15).map((m, i) => {
      const score = m.score?.fullTime;
      const home  = m.homeTeam?.name || '';
      const away  = m.awayTeam?.name || '';
      const hg    = score?.home ?? '?';
      const ag    = score?.away ?? '?';
      const comp  = m.competition?.name || '';
      return {
        id:      'fd_' + m.id,
        title:   `${home} ${hg}–${ag} ${away} | ${comp}`,
        summary: `Full time: ${home} ${hg}, ${away} ${ag}. ${comp} match played on ${m.utcDate?.slice(0,10)||''}`,
        image:   m.homeTeam?.crest || null,
        source:  'football-data.org',
        url:     '',
        date:    m.utcDate || new Date().toISOString(),
        category:'results',
      };
    });
  } catch(e) { return []; }
}

/* ── WC 2026 hardcoded if all else fails ── */
function fallbackArticles() {
  const now = new Date().toISOString();
  return [
    { id:'f1', title:'FIFA World Cup 2026 — Live Updates & Scores', summary:'Follow all the action from the 2026 FIFA World Cup hosted across USA, Canada and Mexico. Live scores, lineups and match reports.', image:null, source:'Copa.pi', url:'', date:now, category:'wc' },
    { id:'f2', title:'World Cup 2026: Group Stage Results & Standings', summary:'Check all the latest results, standings and upcoming fixtures from the FIFA World Cup 2026 group stage.', image:null, source:'Copa.pi', url:'', date:now, category:'wc' },
    { id:'f3', title:'Top scorers at World Cup 2026', summary:'Who leads the golden boot race at the 2026 World Cup? Check the latest top scorers and statistics.', image:null, source:'Copa.pi', url:'', date:now, category:'wc' },
  ];
}

export async function onRequestGet(context) {
  const url      = new URL(context.request.url);
  const page     = parseInt(url.searchParams.get('page') || '1', 10);
  const filter   = url.searchParams.get('filter') || 'all';

  const FD_KEY       = context.env.FD_API_KEY    || null;
  const GUARDIAN_KEY = context.env.GUARDIAN_KEY  || 'test';
  const GNEWS_KEY    = context.env.GNEWS_KEY      || null;

  /* Run all sources in parallel — fast */
  const [espn, espnNews, guardian, gnews, matchReports] = await Promise.all([
    fetchESPN(),
    fetchESPNNews(),
    fetchGuardian(GUARDIAN_KEY),
    fetchGNews(GNEWS_KEY),
    fetchMatchReports(FD_KEY),
  ]);

  let articles = [...espn, ...espnNews, ...guardian, ...gnews, ...matchReports];

  /* Deduplicate */
  const seen = new Set();
  articles = articles.filter(a => {
    if (!a.title) return false;
    const key = a.title.toLowerCase().slice(0, 45);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  /* Sort newest first */
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  /* Filter by category */
  if (filter !== 'all') {
    const filterMap = {
      wc:        ['world cup', 'wc', 'fifa', 'copa mundial'],
      transfers:  ['transfer', 'sign', 'deal', 'fee', 'move', 'join'],
      results:    ['result', 'final', 'win', 'draw', 'lose', 'goal', 'score', '–', '-'],
      injuries:   ['injur', 'injured', 'return', 'fitness', 'sidelined'],
    };
    const words = filterMap[filter] || [];
    if (words.length) {
      articles = articles.filter(a => {
        const t = (a.title + ' ' + a.summary).toLowerCase();
        return words.some(w => t.includes(w));
      });
    }
  }

  /* Fallback if no articles at all */
  if (articles.length === 0) {
    articles = fallbackArticles();
  }

  /* Paginate */
  const perPage = 15;
  const start   = (page - 1) * perPage;
  const paged   = articles.slice(start, start + perPage);

  return new Response(JSON.stringify({
    success:  true,
    page,
    total:    articles.length,
    hasMore:  start + perPage < articles.length,
    sources:  [...new Set(articles.map(a => a.source))],
    articles: paged,
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
