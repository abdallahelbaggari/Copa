/**
 * COPA.pi — /images v3.0
 * Fast football images — Wikimedia only (always works, no key)
 * Other sources blocked from Cloudflare Workers egress
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=300',
};

const CATEGORY_QUERIES = {
  all:       ['FIFA World Cup 2026', 'football match', 'soccer stadium', 'football player', 'football fans'],
  matches:   ['football match', 'soccer game', 'football stadium match'],
  players:   ['football player', 'soccer player', 'footballer'],
  stadiums:  ['football stadium', 'soccer arena', 'football ground'],
  fans:      ['football fans', 'soccer supporters', 'football crowd'],
  trophies:  ['FIFA World Cup trophy', 'football trophy', 'Champions League trophy'],
};

async function fetchWikimedia(query, page, limit) {
  const offset = (page - 1) * limit;
  const url = 'https://commons.wikimedia.org/w/api.php'
    + '?action=query'
    + '&generator=search'
    + '&gsrnamespace=6'
    + '&gsrsearch=' + encodeURIComponent(query)
    + '&gsrlimit=' + limit
    + '&gsroffset=' + offset
    + '&prop=imageinfo'
    + '&iiprop=url|size|mime|extmetadata'
    + '&iiurlwidth=1200'
    + '&format=json'
    + '&origin=*';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data.query?.pages || {};

    return Object.values(pages)
      .map(p => {
        const info = p.imageinfo?.[0];
        if (!info) return null;
        const mime = info.mime || '';
        if (!mime.startsWith('image/') || mime.includes('svg')) return null;
        const meta  = info.extmetadata || {};
        const caption = (meta.ImageDescription?.value || meta.ObjectName?.value || p.title || '')
          .replace(/<[^>]+>/g, '').slice(0, 120);
        const author  = (meta.Artist?.value || '').replace(/<[^>]+>/g, '').slice(0, 50);
        const license = (meta.LicenseShortName?.value || 'CC Licensed').slice(0, 30);
        return {
          id:       'wm_' + p.pageid,
          url:      info.url,
          thumb:    info.thumburl || info.url,
          fullUrl:  info.url,
          caption,
          author,
          license,
          source:   'Wikimedia Commons',
          width:    info.width,
          height:   info.height,
        };
      })
      .filter(Boolean);
  } catch(e) { return []; }
}

/* Hardcoded WC 2026 image fallbacks from Wikimedia direct URLs */
function fallbackImages() {
  return [
    { id:'fb1', url:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/FIFA_World_Cup_2026_logo.svg/800px-FIFA_World_Cup_2026_logo.svg.png', thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/FIFA_World_Cup_2026_logo.svg/400px-FIFA_World_Cup_2026_logo.svg.png', fullUrl:'https://upload.wikimedia.org/wikipedia/commons/6/66/FIFA_World_Cup_2026_logo.svg', caption:'FIFA World Cup 2026 Official Logo', source:'Wikimedia', license:'Public Domain' },
    { id:'fb2', url:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Football_Pallo_valmiina-cropped.jpg/800px-Football_Pallo_valmiina-cropped.jpg', thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Football_Pallo_valmiina-cropped.jpg/400px-Football_Pallo_valmiina-cropped.jpg', fullUrl:'https://upload.wikimedia.org/wikipedia/commons/9/91/Football_Pallo_valmiina-cropped.jpg', caption:'Football', source:'Wikimedia', license:'CC BY-SA' },
    { id:'fb3', url:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/SoccerBall.svg/800px-SoccerBall.svg.png', thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/SoccerBall.svg/400px-SoccerBall.svg.png', fullUrl:'https://upload.wikimedia.org/wikipedia/commons/3/3e/SoccerBall.svg', caption:'Soccer Ball', source:'Wikimedia', license:'Public Domain' },
  ];
}

export async function onRequestGet(context) {
  const url      = new URL(context.request.url);
  const category = url.searchParams.get('category') || 'all';
  const page     = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage  = 12;

  const queries  = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.all;
  /* Pick a query based on page to get variety */
  const query    = queries[(page - 1) % queries.length];

  console.log(`[Copa/images] category=${category} page=${page} query="${query}"`);

  const images = await fetchWikimedia(query, page, perPage);

  /* Filter: only real images, min size */
  const filtered = images.filter(img =>
    img.url &&
    !img.url.endsWith('.svg') &&
    img.url.includes('wikimedia') &&
    (img.width === undefined || img.width >= 400)
  );

  const result = filtered.length ? filtered : fallbackImages();

  return new Response(JSON.stringify({
    success:  true,
    category,
    page,
    query,
    total:    result.length,
    hasMore:  filtered.length >= perPage - 2, /* more pages available */
    images:   result,
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
