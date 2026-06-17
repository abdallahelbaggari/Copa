/**
 * ================================================================
 * COPA.pi — /data Cloudflare Worker v3.0
 *
 * FREE SOURCES:
 * 1. football-data.org  → FD_API_KEY (in Cloudflare)
 * 2. TheSportsDB        → No key needed
 * 3. API-Football       → AF_API_KEY (free 100/day, optional)
 * 4. ESPN API           → No key needed (unofficial)
 * 5. Sofascore          → No key needed (unofficial)
 *
 * ENDPOINTS:
 * /data?type=fixtures&league=PL
 * /data?type=standings&league=PL
 * /data?type=scorers&league=PL
 * /data?type=lineup&match=ID
 * /data?type=analysis&match=ID
 * /data?type=h2h&home=A&away=B
 * /data?type=live
 * /data?type=player&id=ID
 * /data?type=leagues
 * ================================================================
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LEAGUES_FD = {
  PL:'PL', PD:'PD', SA:'SA', BL1:'BL1', FL1:'FL1',
  CL:'CL', WC:'WC', EC:'EC', EL:'EL', PPL:'PPL', DED:'DED',
};

const LEAGUES_AF = {
  PL:39, PD:140, SA:135, BL1:78, FL1:61,
  CL:2, WC:1, EL:3, PPL:94, DED:88, MLS:253,
};

const LEAGUES_ESPN = {
  PL:'eng.1', PD:'esp.1', SA:'ita.1', BL1:'ger.1', FL1:'fra.1',
  CL:'uefa.champions', EL:'uefa.europa', MLS:'usa.1',
};

/* ── DATE HELPERS ── */
function getDateRange(daysAhead) {
  const now  = new Date();
  const to   = new Date(now);
  to.setDate(to.getDate() + daysAhead);
  const fmt = d => d.toISOString().slice(0,10);
  return { from: fmt(now), to: fmt(to) };
}

/* ── API CALLERS ── */
async function fdFetch(path, key) {
  if (!key) return null;
  try {
    const res = await fetch('https://api.football-data.org/v4/' + path, {
      headers: { 'X-Auth-Token': key },
      signal:  AbortSignal.timeout(9000),
    });
    if (!res.ok) { console.warn('[Copa/FD]', res.status, path); return null; }
    return await res.json();
  } catch(e) { console.warn('[Copa/FD] error:', e.message); return null; }
}

async function tsdbFetch(path) {
  try {
    const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/' + path, {
      signal: AbortSignal.timeout(7000),
    });
    return res.ok ? await res.json() : null;
  } catch(e) { return null; }
}

async function afFetch(path, key) {
  if (!key) return null;
  try {
    const res = await fetch('https://v3.football.api-sports.io/' + path, {
      headers: { 'x-apisports-key': key },
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok ? await res.json() : null;
  } catch(e) { return null; }
}

async function espnFetch(path) {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/' + path,
      { signal: AbortSignal.timeout(7000) }
    );
    return res.ok ? await res.json() : null;
  } catch(e) { return null; }
}

async function sofaFetch(path) {
  try {
    const res = await fetch('https://api.sofascore.com/api/v1/' + path, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36' },
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok ? await res.json() : null;
  } catch(e) { return null; }
}

/* ================================================================
   FIXTURES — with current date range
================================================================ */
async function getFixtures(league, FD_KEY, AF_KEY) {
  const fdLeague  = LEAGUES_FD[league]  || 'PL';
  const { from, to } = getDateRange(14); /* today → +14 days */

  /* Try football-data.org with date range */
  const path = `competitions/${fdLeague}/matches`
    + `?dateFrom=${from}&dateTo=${to}`
    + `&status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED`;

  console.log('[Copa/FD] fixtures path:', path);
  const fdData = await fdFetch(path, FD_KEY);

  if (fdData?.matches?.length) {
    return {
      source:  'football-data.org',
      league,
      dateFrom: from,
      dateTo:   to,
      matches: fdData.matches.map(m => ({
        id:        m.id,
        homeTeam:  m.homeTeam?.name  || '',
        awayTeam:  m.awayTeam?.name  || '',
        homeCrest: m.homeTeam?.crest || '',
        awayCrest: m.awayTeam?.crest || '',
        status:    m.status,
        score:     m.score,
        utcDate:   m.utcDate,
        matchday:  m.matchday,
        stage:     m.stage,
        group:     m.group,
      })),
    };
  }

  /* Fallback: ESPN with today's scoreboard */
  const espnSlug = LEAGUES_ESPN[league] || 'eng.1';
  const espnData = await espnFetch(`${espnSlug}/scoreboard`);

  if (espnData?.events?.length) {
    return {
      source: 'ESPN',
      league,
      matches: espnData.events.map(e => {
        const comp  = e.competitions?.[0];
        const teams = comp?.competitors || [];
        const home  = teams.find(t => t.homeAway === 'home') || teams[0] || {};
        const away  = teams.find(t => t.homeAway === 'away') || teams[1] || {};
        return {
          id:        e.id,
          homeTeam:  home.team?.displayName || '',
          awayTeam:  away.team?.displayName || '',
          homeCrest: home.team?.logo || '',
          awayCrest: away.team?.logo || '',
          status:    comp?.status?.type?.name || '',
          score: {
            fullTime: {
              home: home.score !== undefined ? parseInt(home.score) : null,
              away: away.score !== undefined ? parseInt(away.score) : null,
            },
          },
          utcDate: e.date,
        };
      }),
    };
  }

  return { source: 'none', matches: [], error: 'No data available' };
}

/* ================================================================
   STANDINGS
================================================================ */
async function getStandings(league, FD_KEY) {
  const fdLeague = LEAGUES_FD[league] || 'PL';
  const fdData   = await fdFetch(`competitions/${fdLeague}/standings`, FD_KEY);

  if (fdData?.standings?.length) {
    const table = fdData.standings[0]?.table || [];
    return {
      source:      'football-data.org',
      competition: fdData.competition?.name || league,
      season:      fdData.season?.startDate?.slice(0,4),
      standings: table.map(row => ({
        position:     row.position,
        team:         row.team?.name   || '',
        crest:        row.team?.crest  || '',
        played:       row.playedGames  || 0,
        won:          row.won          || 0,
        draw:         row.draw         || 0,
        lost:         row.lost         || 0,
        goalsFor:     row.goalsFor     || 0,
        goalsAgainst: row.goalsAgainst || 0,
        goalDiff:     row.goalDifference || 0,
        points:       row.points       || 0,
        form:         row.form         || '',
      })),
    };
  }

  /* ESPN fallback */
  const espnSlug = LEAGUES_ESPN[league] || 'eng.1';
  const espnData = await espnFetch(`${espnSlug}/standings`);
  if (espnData?.standings?.length) {
    return {
      source: 'ESPN',
      standings: (espnData.standings[0]?.entries || []).map((e, i) => ({
        position:     i + 1,
        team:         e.team?.displayName       || '',
        crest:        e.team?.logos?.[0]?.href  || '',
        played:       e.stats?.find(s=>s.name==='gamesPlayed')?.value   || 0,
        won:          e.stats?.find(s=>s.name==='wins')?.value           || 0,
        draw:         e.stats?.find(s=>s.name==='ties')?.value           || 0,
        lost:         e.stats?.find(s=>s.name==='losses')?.value         || 0,
        goalsFor:     e.stats?.find(s=>s.name==='pointsFor')?.value      || 0,
        goalsAgainst: e.stats?.find(s=>s.name==='pointsAgainst')?.value  || 0,
        goalDiff:     e.stats?.find(s=>s.name==='pointDifferential')?.value || 0,
        points:       e.stats?.find(s=>s.name==='points')?.value         || 0,
        form:         '',
      })),
    };
  }

  return { source: 'none', standings: [] };
}

/* ================================================================
   TOP SCORERS
================================================================ */
async function getScorers(league, FD_KEY) {
  const fdLeague = LEAGUES_FD[league] || 'PL';
  const fdData   = await fdFetch(`competitions/${fdLeague}/scorers?limit=20`, FD_KEY);
  if (fdData?.scorers?.length) {
    return {
      source:  'football-data.org',
      scorers: fdData.scorers.map(s => ({
        name:    s.player?.name || '',
        team:    s.team?.name   || '',
        crest:   s.team?.crest  || '',
        goals:   s.goals        || 0,
        assists: s.assists       || 0,
        played:  s.playedMatches || 0,
        penalty: s.penalties     || 0,
      })),
    };
  }
  return { source: 'none', scorers: [] };
}

/* ================================================================
   LINEUP — TheSportsDB → API-Football → Sofascore
================================================================ */
async function getLineup(matchId, AF_KEY) {
  /* TheSportsDB (free, unlimited) */
  const tsdb = await tsdbFetch(`lookuplineupsbyevent.php?id=${matchId}`);
  if (tsdb?.lineup?.length) {
    const home = tsdb.lineup.filter(p => p.strHome === 'Home');
    const away = tsdb.lineup.filter(p => p.strHome === 'Away');
    return {
      source: 'TheSportsDB',
      home: { formation: tsdb.lineup[0]?.strFormation || '',
        players: home.map(p => ({ name:p.strPlayer, number:p.intSquadNumber, position:p.strPosition })) },
      away: { formation: tsdb.lineup.find(p=>p.strHome==='Away')?.strFormation || '',
        players: away.map(p => ({ name:p.strPlayer, number:p.intSquadNumber, position:p.strPosition })) },
    };
  }
  /* API-Football */
  if (AF_KEY) {
    const af = await afFetch(`fixtures/lineups?fixture=${matchId}`, AF_KEY);
    if (af?.response?.length) {
      const [h, a] = af.response;
      const mp = p => ({ name:p.player?.name||'', number:p.player?.number||'', position:p.player?.pos||'' });
      return {
        source: 'API-Football',
        home: { team:h.team?.name, formation:h.formation, players:(h.startXI||[]).map(p=>mp(p)), subs:(h.substitutes||[]).map(p=>mp(p)) },
        away: { team:a.team?.name, formation:a.formation, players:(a.startXI||[]).map(p=>mp(p)), subs:(a.substitutes||[]).map(p=>mp(p)) },
      };
    }
  }
  /* Sofascore */
  const sofa = await sofaFetch(`event/${matchId}/lineups`);
  if (sofa?.home) {
    const ms = players => (players||[]).map(p => ({ name:p.player?.name||'', number:p.jerseyNumber||'', position:p.position||'' }));
    return {
      source: 'Sofascore',
      home: { formation:sofa.home.formation, players:ms(sofa.home.players) },
      away: { formation:sofa.away.formation, players:ms(sofa.away.players) },
    };
  }
  return { source: 'none', home:{ players:[] }, away:{ players:[] } };
}

/* ================================================================
   MATCH ANALYSIS
================================================================ */
async function getAnalysis(matchId, AF_KEY) {
  const results = {};
  if (AF_KEY) {
    const [statsData, eventsData] = await Promise.allSettled([
      afFetch(`fixtures/statistics?fixture=${matchId}`, AF_KEY),
      afFetch(`fixtures/events?fixture=${matchId}`, AF_KEY),
    ]);
    if (statsData.status==='fulfilled' && statsData.value?.response?.length) {
      results.stats = statsData.value.response.map(t => ({
        team:  t.team?.name,
        stats: (t.statistics||[]).map(s => ({ type:s.type, value:s.value })),
      }));
    }
    if (eventsData.status==='fulfilled' && eventsData.value?.response?.length) {
      results.events = eventsData.value.response.map(e => ({
        time:   e.time?.elapsed,
        team:   e.team?.name,
        player: e.player?.name,
        assist: e.assist?.name,
        type:   e.type,
        detail: e.detail,
      }));
    }
  }
  if (!results.events) {
    const sofa = await sofaFetch(`event/${matchId}/incidents`);
    if (sofa?.incidents) {
      results.events = sofa.incidents
        .filter(i => ['goal','card','substitution'].includes(i.incidentType))
        .map(i => ({ time:i.time, type:i.incidentType, player:i.player?.name||'', team:i.isHome?'home':'away', detail:i.incidentClass||'' }));
    }
  }
  return { source: 'API-Football + Sofascore', ...results };
}

/* ================================================================
   HEAD TO HEAD
================================================================ */
async function getH2H(home, away, AF_KEY) {
  if (AF_KEY) {
    const af = await afFetch(`fixtures/headtohead?h2h=${home}-${away}&last=10`, AF_KEY);
    if (af?.response?.length) {
      return {
        source: 'API-Football',
        matches: af.response.map(m => ({
          date:   m.fixture?.date,
          home:   m.teams?.home?.name,
          away:   m.teams?.away?.name,
          scoreH: m.goals?.home,
          scoreA: m.goals?.away,
          league: m.league?.name,
          result: m.goals?.home > m.goals?.away ? 'home' : m.goals?.away > m.goals?.home ? 'away' : 'draw',
        })),
      };
    }
  }
  return { source: 'none', matches: [] };
}

/* ================================================================
   LIVE
================================================================ */
async function getLive(FD_KEY) {
  const fdData = await fdFetch('matches?status=LIVE,IN_PLAY,PAUSED', FD_KEY);
  if (fdData?.matches?.length) {
    return {
      source: 'football-data.org',
      live:   true,
      count:  fdData.matches.length,
      matches: fdData.matches.map(m => ({
        id:        m.id,
        homeTeam:  m.homeTeam?.name  || '',
        awayTeam:  m.awayTeam?.name  || '',
        homeCrest: m.homeTeam?.crest || '',
        awayCrest: m.awayTeam?.crest || '',
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
        minute:    m.minute || null,
        status:    m.status,
        league:    m.competition?.name,
      })),
    };
  }
  return { source: 'none', live: false, matches: [] };
}

/* ================================================================
   LEAGUES LIST
================================================================ */
function getLeagues() {
  return {
    source: 'static',
    leagues: [
      { code:'PL',  name:'Premier League',   flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', country:'England' },
      { code:'PD',  name:'La Liga',           flag:'🇪🇸', country:'Spain' },
      { code:'SA',  name:'Serie A',           flag:'🇮🇹', country:'Italy' },
      { code:'BL1', name:'Bundesliga',        flag:'🇩🇪', country:'Germany' },
      { code:'FL1', name:'Ligue 1',           flag:'🇫🇷', country:'France' },
      { code:'CL',  name:'Champions League',  flag:'🇪🇺', country:'Europe' },
      { code:'EL',  name:'Europa League',     flag:'🇪🇺', country:'Europe' },
      { code:'WC',  name:'World Cup 2026',    flag:'🌍', country:'World' },
      { code:'PPL', name:'Primeira Liga',     flag:'🇵🇹', country:'Portugal' },
      { code:'DED', name:'Eredivisie',        flag:'🇳🇱', country:'Netherlands' },
      { code:'MLS', name:'MLS',               flag:'🇺🇸', country:'USA' },
    ],
  };
}

/* ================================================================
   MAIN HANDLER
================================================================ */
export async function onRequestGet(context) {
  const url      = new URL(context.request.url);
  const type     = url.searchParams.get('type')   || 'health';
  const league   = url.searchParams.get('league') || 'PL';
  const matchId  = url.searchParams.get('match')  || '';
  const home     = url.searchParams.get('home')   || '';
  const away     = url.searchParams.get('away')   || '';
  const playerId = url.searchParams.get('id')     || '';

  const FD_KEY = context.env.FD_API_KEY || null;
  const AF_KEY = context.env.AF_API_KEY  || null;

  console.log(`[Copa/data] type=${type} league=${league} match=${matchId}`);

  let data;
  switch(type) {
    case 'fixtures':  data = await getFixtures(league, FD_KEY, AF_KEY);     break;
    case 'standings': data = await getStandings(league, FD_KEY);            break;
    case 'scorers':   data = await getScorers(league, FD_KEY);              break;
    case 'lineup':    data = await getLineup(matchId, AF_KEY);              break;
    case 'analysis':  data = await getAnalysis(matchId, AF_KEY);            break;
    case 'h2h':       data = await getH2H(home, away, AF_KEY);              break;
    case 'live':      data = await getLive(FD_KEY);                         break;
    case 'leagues':   data = getLeagues();                                   break;
    default:
      data = {
        status:  'ok',
        app:     'Copa.pi',
        version: '3.0',
        date:    new Date().toISOString(),
        sources: { 'football-data.org':!!FD_KEY, 'api-football':!!AF_KEY, 'thesportsdb':true, 'espn':true, 'sofascore':true },
        endpoints: [
          '/data?type=fixtures&league=PL  ← current fixtures (today +14 days)',
          '/data?type=standings&league=PL',
          '/data?type=scorers&league=PL',
          '/data?type=lineup&match=ID',
          '/data?type=analysis&match=ID',
          '/data?type=h2h&home=A&away=B',
          '/data?type=live',
          '/data?type=leagues',
        ],
      };
  }

  return new Response(JSON.stringify({ success:true, type, ...data }), {
    headers: { ...CORS, 'Content-Type':'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
