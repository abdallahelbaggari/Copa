/**
 * COPA.pi — /data v4.0
 * Smart fixture loading with current date awareness
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* Season map - current active seasons */
const SEASON = {
  WC:  2026, CL:  2024, EL:  2024,
  PL:  2025, PD:  2024, SA:  2024,
  BL1: 2024, FL1: 2024, MLS: 2025,
  PPL: 2024, DED: 2024,
};

const LEAGUES_ESPN = {
  PL:'eng.1', PD:'esp.1', SA:'ita.1', BL1:'ger.1',
  FL1:'fra.1', CL:'uefa.champions', EL:'uefa.europa', MLS:'usa.1',
};

function today()    { return new Date().toISOString().slice(0,10); }
function dateAdd(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

async function fdFetch(path, key) {
  if (!key) return null;
  try {
    const r = await fetch('https://api.football-data.org/v4/' + path, {
      headers: { 'X-Auth-Token': key },
      signal:  AbortSignal.timeout(9000),
    });
    if (!r.ok) { console.warn('[FD]', r.status, path.slice(0,60)); return null; }
    return await r.json();
  } catch(e) { console.warn('[FD] err:', e.message); return null; }
}

async function espnFetch(path) {
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/' + path, {
      signal: AbortSignal.timeout(7000),
    });
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
}

async function sofaFetch(path) {
  try {
    const r = await fetch('https://api.sofascore.com/api/v1/' + path, {
      headers: {'User-Agent':'Mozilla/5.0'},
      signal:  AbortSignal.timeout(8000),
    });
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
}

/* Map FD match to standard format */
function mapFDMatch(m) {
  return {
    id:        m.id,
    homeTeam:  m.homeTeam?.shortName || m.homeTeam?.name || '',
    awayTeam:  m.awayTeam?.shortName || m.awayTeam?.name || '',
    homeFull:  m.homeTeam?.name || '',
    awayFull:  m.awayTeam?.name || '',
    homeCrest: m.homeTeam?.crest || '',
    awayCrest: m.awayTeam?.crest || '',
    status:    m.status,
    homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
    utcDate:   m.utcDate,
    matchday:  m.matchday,
    stage:     m.stage,
    group:     m.group,
    minute:    m.minute || null,
  };
}

/* Group matches into sections */
function groupMatches(matches) {
  const now   = new Date();
  const todayStr = now.toISOString().slice(0,10);

  const live     = [];
  const todayM   = [];
  const upcoming = [];
  const recent   = [];

  matches.forEach(function(m) {
    const s = m.status;
    if (s === 'IN_PLAY' || s === 'PAUSED' || s === 'LIVE') {
      live.push(m);
    } else if (s === 'FINISHED' || s === 'FT') {
      if (m.utcDate && m.utcDate.slice(0,10) >= dateAdd(-3)) {
        recent.push(m);
      }
    } else {
      const matchDate = m.utcDate ? m.utcDate.slice(0,10) : '';
      if (matchDate === todayStr) {
        todayM.push(m);
      } else if (matchDate > todayStr) {
        upcoming.push(m);
      } else {
        recent.push(m);
      }
    }
  });

  return { live, today: todayM, upcoming, recent };
}

/* ── FIXTURES ── */
async function getFixtures(league, FD_KEY) {
  const leagueMap = {
    PL:'PL', PD:'PD', SA:'SA', BL1:'BL1', FL1:'FL1',
    CL:'CL', WC:'WC', EC:'EC', EL:'EL', PPL:'PPL', DED:'DED',
  };
  const fdCode = leagueMap[league] || 'WC';

  /* Wide date range: past 3 days + next 30 days */
  const from = dateAdd(-3);
  const to   = dateAdd(30);

  console.log('[Copa] fixtures', league, 'from', from, 'to', to);

  const fd = await fdFetch(
    `competitions/${fdCode}/matches?dateFrom=${from}&dateTo=${to}`,
    FD_KEY
  );

  if (fd?.matches?.length) {
    const matches = fd.matches.map(mapFDMatch);
    const groups  = groupMatches(matches);
    return {
      source:    'football-data.org',
      league,
      competition: fd.competition?.name || league,
      dateFrom:  from,
      dateTo:    to,
      total:     matches.length,
      groups,
      matches,   /* full list for predict/other screens */
    };
  }

  /* ESPN fallback */
  const espnCode = LEAGUES_ESPN[league];
  if (espnCode) {
    const espn = await espnFetch(`${espnCode}/scoreboard`);
    if (espn?.events?.length) {
      const matches = espn.events.map(function(e) {
        const comp = e.competitions?.[0];
        const teams = comp?.competitors || [];
        const h = teams.find(t=>t.homeAway==='home') || teams[0] || {};
        const a = teams.find(t=>t.homeAway==='away') || teams[1] || {};
        const st = comp?.status?.type?.name || '';
        return {
          id:        e.id,
          homeTeam:  h.team?.shortDisplayName || h.team?.displayName || '',
          awayTeam:  a.team?.shortDisplayName || a.team?.displayName || '',
          homeFull:  h.team?.displayName || '',
          awayFull:  a.team?.displayName || '',
          homeCrest: h.team?.logo || '',
          awayCrest: a.team?.logo || '',
          status:    st,
          homeScore: h.score !== undefined ? parseInt(h.score) : null,
          awayScore: a.score !== undefined ? parseInt(a.score) : null,
          utcDate:   e.date,
          minute:    comp?.status?.displayClock || null,
        };
      });
      const groups = groupMatches(matches);
      return { source:'ESPN', league, groups, matches, total: matches.length };
    }
  }

  return { source:'none', league, groups:{ live:[], today:[], upcoming:[], recent:[] }, matches:[], total:0 };
}

/* ── STANDINGS ── */
async function getStandings(league, FD_KEY) {
  const leagueMap = {
    PL:'PL', PD:'PD', SA:'SA', BL1:'BL1', FL1:'FL1',
    CL:'CL', WC:'WC', EL:'EL', PPL:'PPL', DED:'DED',
  };
  const fdCode = leagueMap[league] || 'WC';
  const fd = await fdFetch(`competitions/${fdCode}/standings`, FD_KEY);

  if (fd?.standings?.length) {
    const table = fd.standings[0]?.table || [];
    return {
      source:      'football-data.org',
      competition: fd.competition?.name || league,
      standings: table.map(row => ({
        position:     row.position,
        team:         row.team?.shortName || row.team?.name || '',
        fullName:     row.team?.name || '',
        crest:        row.team?.crest || '',
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

  const espnCode = LEAGUES_ESPN[league];
  if (espnCode) {
    const espn = await espnFetch(`${espnCode}/standings`);
    if (espn?.standings?.length) {
      return {
        source: 'ESPN',
        standings: (espn.standings[0]?.entries || []).map((e,i) => ({
          position:     i+1,
          team:         e.team?.shortDisplayName || e.team?.displayName || '',
          fullName:     e.team?.displayName || '',
          crest:        e.team?.logos?.[0]?.href || '',
          played:       e.stats?.find(s=>s.name==='gamesPlayed')?.value    || 0,
          won:          e.stats?.find(s=>s.name==='wins')?.value            || 0,
          draw:         e.stats?.find(s=>s.name==='ties')?.value            || 0,
          lost:         e.stats?.find(s=>s.name==='losses')?.value          || 0,
          goalsFor:     e.stats?.find(s=>s.name==='pointsFor')?.value       || 0,
          goalsAgainst: e.stats?.find(s=>s.name==='pointsAgainst')?.value   || 0,
          goalDiff:     e.stats?.find(s=>s.name==='pointDifferential')?.value || 0,
          points:       e.stats?.find(s=>s.name==='points')?.value          || 0,
          form: '',
        })),
      };
    }
  }

  return { source:'none', standings:[] };
}

/* ── SCORERS ── */
async function getScorers(league, FD_KEY) {
  const leagueMap = { PL:'PL', PD:'PD', SA:'SA', BL1:'BL1', FL1:'FL1', CL:'CL', WC:'WC' };
  const fdCode = leagueMap[league] || 'WC';
  const fd = await fdFetch(`competitions/${fdCode}/scorers?limit=20`, FD_KEY);
  if (fd?.scorers?.length) {
    return {
      source: 'football-data.org',
      scorers: fd.scorers.map(s => ({
        name:    s.player?.name || '',
        team:    s.team?.shortName || s.team?.name || '',
        crest:   s.team?.crest || '',
        goals:   s.goals     || 0,
        assists: s.assists    || 0,
        played:  s.playedMatches || 0,
      })),
    };
  }
  return { source:'none', scorers:[] };
}

/* ── LINEUP ── */
async function getLineup(matchId) {
  const sofa = await sofaFetch(`event/${matchId}/lineups`);
  if (sofa?.home) {
    const mp = arr => (arr||[]).map(p => ({
      name:     p.player?.name || p.player?.shortName || '',
      number:   p.jerseyNumber || '',
      position: p.position || '',
      rating:   p.statistics?.rating || null,
    }));
    return {
      source: 'Sofascore',
      home: { team: sofa.home.teamColors, formation: sofa.home.formation, players: mp(sofa.home.players) },
      away: { team: sofa.away.teamColors, formation: sofa.away.formation, players: mp(sofa.away.players) },
    };
  }
  return { source:'none', home:{players:[]}, away:{players:[]} };
}

/* ── LIVE ── */
async function getLive(FD_KEY) {
  const fd = await fdFetch('matches?status=LIVE,IN_PLAY,PAUSED', FD_KEY);
  if (fd?.matches?.length) {
    return {
      source: 'football-data.org',
      live:   true,
      count:  fd.matches.length,
      matches: fd.matches.map(mapFDMatch),
    };
  }
  return { source:'none', live:false, matches:[] };
}

/* ── LEAGUES ── */
function getLeagues() {
  return { source:'static', leagues:[
    { code:'WC',  name:'World Cup 2026',   flag:'🌍', country:'World', active:true },
    { code:'PL',  name:'Premier League',   flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', country:'England' },
    { code:'PD',  name:'La Liga',           flag:'🇪🇸', country:'Spain' },
    { code:'SA',  name:'Serie A',           flag:'🇮🇹', country:'Italy' },
    { code:'BL1', name:'Bundesliga',        flag:'🇩🇪', country:'Germany' },
    { code:'FL1', name:'Ligue 1',           flag:'🇫🇷', country:'France' },
    { code:'CL',  name:'Champions League',  flag:'🇪🇺', country:'Europe' },
    { code:'EL',  name:'Europa League',     flag:'🇪🇺', country:'Europe' },
    { code:'MLS', name:'MLS',               flag:'🇺🇸', country:'USA' },
  ]};
}

/* ── MAIN ── */
export async function onRequestGet(context) {
  const url   = new URL(context.request.url);
  const type  = url.searchParams.get('type')   || 'health';
  const league= url.searchParams.get('league') || 'WC';
  const match = url.searchParams.get('match')  || '';
  const home  = url.searchParams.get('home')   || '';
  const away  = url.searchParams.get('away')   || '';

  const FD_KEY = context.env.FD_API_KEY || null;
  const AF_KEY = context.env.AF_API_KEY  || null;

  console.log(`[Copa] type=${type} league=${league}`);

  let data;
  switch(type) {
    case 'fixtures':  data = await getFixtures(league, FD_KEY); break;
    case 'standings': data = await getStandings(league, FD_KEY); break;
    case 'scorers':   data = await getScorers(league, FD_KEY); break;
    case 'lineup':    data = await getLineup(match); break;
    case 'live':      data = await getLive(FD_KEY); break;
    case 'leagues':   data = getLeagues(); break;
    default:
      data = {
        status:'ok', app:'Copa.pi', version:'4.0',
        now: new Date().toISOString(),
        fd_key: !!FD_KEY,
        default_league: 'WC (World Cup 2026 - active)',
      };
  }

  return new Response(JSON.stringify({ success:true, type, ...data }), {
    headers: { ...CORS, 'Content-Type':'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
