/* ═══════════════════════════════════════════════════════
   functions/fixtures.js — Cloudflare Pages Function
   Copa.pi — Football Data Proxy
   PRIMARY:  football-data.org (live, reliable)
   FALLBACK: TheSportsDB (extended leagues)
   Cache: 60s live · 5min upcoming · 30min results
═══════════════════════════════════════════════════════ */

const FD_BASE  = 'https://api.football-data.org/v4';
const TSDB     = 'https://www.thesportsdb.com/api/v1/json/3';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

/* Cache TTL in seconds */
const TTL = {
  today:    60,    /* 1 minute — live scores */
  upcoming: 300,   /* 5 minutes */
  results:  1800,  /* 30 minutes */
  scorers:  3600,  /* 1 hour */
  tsdb:     300    /* 5 minutes */
};

function pad(n){ return String(n).padStart(2,'0'); }

function todayStr(){
  var d = new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

function dateStr(daysFromNow){
  var d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

function jsonResponse(data, ttl){
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: Object.assign({}, CORS, {
      'Cache-Control': 'public, max-age='+ttl+', stale-while-revalidate='+(ttl*2)
    })
  });
}

function errorResponse(msg){
  return new Response(JSON.stringify({
    matches:[], scorers:[], error: msg
  }), { status: 200, headers: CORS });
}

/* ── Main handler ── */
export async function onRequest(context) {
  const request = context.request;
  const env     = context.env;

  /* Preflight */
  if(request.method === 'OPTIONS'){
    return new Response('', { status: 200, headers: CORS });
  }

  const url    = new URL(request.url);
  const params = url.searchParams;
  const type   = params.get('type')   || 'today';
  const from   = params.get('from')   || todayStr();
  const to     = params.get('to')     || dateStr(7);
  const status = params.get('status') || '';
  const comp   = params.get('comp')   || '';

  /* API key from environment */
  const FD_KEY = env.FD_API_KEY;

  console.log('[Copa fixtures] type:', type, 'from:', from, 'to:', to);

  /* ── SCORERS ── */
  if(type === 'scorers' && comp){
    if(!FD_KEY) return errorResponse('FD_API_KEY not set');
    try {
      const res  = await fetch(FD_BASE+'/competitions/'+comp+'/scorers?limit=10', {
        headers: { 'X-Auth-Token': FD_KEY }
      });
      const data = await res.json();
      console.log('[Copa fixtures] scorers:', (data.scorers||[]).length);
      return jsonResponse(data, TTL.scorers);
    } catch(e){
      console.error('[Copa fixtures] scorers error:', e.message);
      return errorResponse(e.message);
    }
  }

  /* ── FOOTBALL-DATA.ORG MATCHES ── */
  if(FD_KEY){
    try {
      let fdUrl = FD_BASE+'/matches?dateFrom='+from+'&dateTo='+to;
      if(status) fdUrl += '&status='+status;

      console.log('[Copa fixtures] FD URL:', fdUrl);

      const res = await fetch(fdUrl, {
        headers: {
          'X-Auth-Token': FD_KEY,
          'Accept': 'application/json'
        }
      });

      /* Track rate limit */
      const remaining = res.headers.get('X-Requests-Available-Minute') || '10';
      console.log('[Copa fixtures] FD rate limit remaining:', remaining);

      if(!res.ok){
        const err = await res.json().catch(() => ({}));
        console.error('[Copa fixtures] FD error:', res.status, err.message||'');
        /* Fall through to TheSportsDB */
      } else {
        const data = await res.json();
        const count = (data.matches||[]).length;
        console.log('[Copa fixtures] FD matches:', count);

        if(count > 0){
          /* Determine cache TTL based on type */
          const cacheTTL = status==='FINISHED' ? TTL.results :
                           from===todayStr()   ? TTL.today   : TTL.upcoming;
          return jsonResponse(data, cacheTTL);
        }
        /* No matches — fall through to TheSportsDB for extended leagues */
      }
    } catch(e){
      console.error('[Copa fixtures] FD fetch failed:', e.message);
      /* Fall through to TheSportsDB */
    }
  }

  /* ── THESPORTSDB FALLBACK ── */
  console.log('[Copa fixtures] Using TheSportsDB fallback');

  const TSDB_LEAGUES = [
    {id:'4328', name:'Premier League',    comp:'EPL',  flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿'},
    {id:'4335', name:'La Liga',           comp:'LIGA', flag:'🇪🇸'},
    {id:'4331', name:'Bundesliga',        comp:'BUN',  flag:'🇩🇪'},
    {id:'4332', name:'Serie A',           comp:'SA',   flag:'🇮🇹'},
    {id:'4334', name:'Ligue 1',           comp:'L1',   flag:'🇫🇷'},
    {id:'4480', name:'Champions League',  comp:'UCL',  flag:'⭐'},
    {id:'4346', name:'Copa America',      comp:'COPA', flag:'🌎'},
    {id:'4347', name:'FIFA World Cup',    comp:'WC',   flag:'🏆'},
    {id:'4424', name:'MLS',              comp:'MLS',  flag:'🇺🇸'},
    {id:'4406', name:'Saudi Pro League', comp:'SPL',  flag:'🇸🇦'},
    {id:'4429', name:'AFCON',            comp:'AFCON',flag:'🌍'},
    {id:'4399', name:'AFC Asian Cup',    comp:'AFC',  flag:'🌏'},
  ];

  try {
    /* Fetch next events for top 4 leagues in parallel */
    const top4 = TSDB_LEAGUES.slice(0,4);
    const fetches = top4.map(lg =>
      fetch(TSDB+'/eventsnext.php?id='+lg.id)
        .then(r => r.ok ? r.json() : {events:[]})
        .then(d => (d.events||[]).slice(0,5).map(e => ({
          id:           e.idEvent,
          homeTeam:     { name: e.strHomeTeam, shortName: e.strHomeTeam },
          awayTeam:     { name: e.strAwayTeam, shortName: e.strAwayTeam },
          utcDate:      e.dateEvent+'T'+(e.strTime||'12:00:00')+'Z',
          status:       e.strStatus==='Match Finished' ? 'FINISHED' : 'SCHEDULED',
          score:        {
            fullTime: {
              home: e.intHomeScore ? parseInt(e.intHomeScore) : null,
              away: e.intAwayScore ? parseInt(e.intAwayScore) : null
            }
          },
          competition:  { name: lg.name, code: lg.comp },
          _flag:        lg.flag
        })))
        .catch(() => [])
    );

    const results = await Promise.all(fetches);
    const matches = results.flat();

    console.log('[Copa fixtures] TSDB fallback matches:', matches.length);

    return jsonResponse({ matches, source: 'tsdb' }, TTL.tsdb);

  } catch(e){
    console.error('[Copa fixtures] TSDB fallback failed:', e.message);
    return errorResponse('All data sources failed: '+e.message);
  }
}
