/**
 * ================================================================
 * COPA.pi — /data Cloudflare Worker v2.0
 *
 * COMPLETELY FREE SOURCES:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. football-data.org  → FD_API_KEY (already in Cloudflare) │
 * │    Fixtures, standings, scorers, competitions               │
 * │                                                             │
 * │ 2. TheSportsDB        → No key needed (free, unlimited)     │
 * │    Lineups, events, player info, team details               │
 * │                                                             │
 * │ 3. API-Football       → AF_API_KEY (free 100/day)           │
 * │    Lineups, stats, xG, H2H, injuries, predictions          │
 * │    Register free: api-football.com                          │
 * │                                                             │
 * │ 4. ESPN API           → No key needed (unofficial, free)    │
 * │    Scores, standings, basic match info                      │
 * │                                                             │
 * │ 5. Sofascore          → No key needed (unofficial, free)    │
 * │    Live events, player ratings, lineups                     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * ENDPOINTS:
 * GET /data?type=fixtures&league=PL
 * GET /data?type=standings&league=PL
 * GET /data?type=scorers&league=PL
 * GET /data?type=lineup&match=MATCH_ID&source=tsdb
 * GET /data?type=analysis&match=MATCH_ID
 * GET /data?type=h2h&home=TEAM_ID&away=TEAM_ID
 * GET /data?type=player&id=PLAYER_ID
 * GET /data?type=injuries&league=PL
 * GET /data?type=leagues
 * GET /data?type=live
 * ================================================================
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ── LEAGUE MAPPINGS ── */
const LEAGUES = {
  /* football-data.org codes */
  FD: {
    PL:  'PL',   /* Premier League */
    PD:  'PD',   /* La Liga */
    SA:  'SA',   /* Serie A */
    BL1: 'BL1',  /* Bundesliga */
    FL1: 'FL1',  /* Ligue 1 */
    CL:  'CL',   /* Champions League */
    WC:  'WC',   /* World Cup 2026 */
    EC:  'EC',   /* Euro */
    EL:  'EL',   /* Europa League */
    PPL: 'PPL',  /* Primeira Liga */
    DED: 'DED',  /* Eredivisie */
  },
  /* API-Football IDs */
  AF: {
    PL:  39,   /* Premier League */
    PD:  140,  /* La Liga */
    SA:  135,  /* Serie A */
    BL1: 78,   /* Bundesliga */
    FL1: 61,   /* Ligue 1 */
    CL:  2,    /* Champions League */
    WC:  1,    /* World Cup */
    EL:  3,    /* Europa League */
    PPL: 94,   /* Primeira Liga */
    DED: 88,   /* Eredivisie */
    MLS: 253,  /* MLS */
    SPL: 307,  /* Saudi Pro League */
  },
  /* ESPN slugs */
  ESPN: {
    PL:  'eng.1',
    PD:  'esp.1',
    SA:  'ita.1',
    BL1: 'ger.1',
    FL1: 'fra.1',
    CL:  'uefa.champions',
    EL:  'uefa.europa',
    MLS: 'usa.1',
  },
};

/* ── FOOTBALL-DATA.ORG ── */
async function fdFetch(path, key) {
  if (!key) return null;
  try {
    const res = await fetch('https://api.football-data.org/v4/' + path, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn('[Copa/FD] ' + res.status + ' ' + path);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[Copa/FD] error:', e.message);
    return null;
  }
}

/* ── THESPORTSDB ── */
async function tsdbFetch(path) {
  try {
    const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/' + path, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Copa/TSDB] error:', e.message);
    return null;
  }
}

/* ── API-FOOTBALL ── */
async function afFetch(path, key) {
  if (!key) return null;
  try {
    const res = await fetch('https://v3.football.api-sports.io/' + path, {
      headers: {
        'x-rapidapi-host': 'v3.football.api-sports.io',
        'x-apisports-key': key,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Copa/AF] error:', e.message);
    return null;
  }
}

/* ── ESPN (unofficial, no key) ── */
async function espnFetch(path) {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/' + path, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Copa/ESPN] error:', e.message);
    return null;
  }
}

/* ── SOFASCORE (unofficial, no key) ── */
async function sofaFetch(path) {
  try {
    const res = await fetch('https://api.sofascore.com/api/v1/' + path, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Copa/Sofa] error:', e.message);
    return null;
  }
}

/* ================================================================
   HANDLER FUNCTIONS
================================================================ */

/* ── FIXTURES ── */
async function getFixtures(league, FD_KEY, AF_KEY) {
  const fdLeague = LEAGUES.FD[league] || 'PL';
  const afLeague = LEAGUES.AF[league] || 39;

  /* Try FD first */
  const fdData = await fdFetch(`competitions/${fdLeague}/matches?status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED&limit=20`, FD_KEY);
  if (fdData?.matches?.length) {
    return {
      source: 'football-data.org',
      matches: fdData.matches.map(m => ({
        id:         m.id,
        homeTeam:   m.homeTeam.name,
        awayTeam:   m.awayTeam.name,
        homeCrest:  m.homeTeam.crest,
        awayCrest:  m.awayTeam.crest,
        status:     m.status,
        score:      m.score,
        utcDate:    m.utcDate,
        matchday:   m.matchday,
        stage:      m.stage,
        group:      m.group,
      })),
    };
  }

  /* Fallback: ESPN */
  const espnSlug = LEAGUES.ESPN[league] || 'eng.1';
  const espnData = await espnFetch(`${espnSlug}/scoreboard`);
  if (espnData?.events?.length) {
    return {
      source: 'ESPN',
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
            fullTime: { home: parseInt(home.score)||null, away: parseInt(away.score)||null }
          },
          utcDate:   e.date,
        };
      }),
    };
  }

  return { source: 'none', matches: [] };
}

/* ── STANDINGS / TABLES ── */
async function getStandings(league, FD_KEY, AF_KEY) {
  const fdLeague = LEAGUES.FD[league] || 'PL';
  const afLeague = LEAGUES.AF[league] || 39;

  /* Try FD */
  const fdData = await fdFetch(`competitions/${fdLeague}/standings`, FD_KEY);
  if (fdData?.standings?.length) {
    const table = fdData.standings[0]?.table || [];
    return {
      source:      'football-data.org',
      competition: fdData.competition?.name || league,
      season:      fdData.season?.startDate?.slice(0,4),
      standings: table.map(row => ({
        position:     row.position,
        team:         row.team.name,
        crest:        row.team.crest,
        played:       row.playedGames,
        won:          row.won,
        draw:         row.draw,
        lost:         row.lost,
        goalsFor:     row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff:     row.goalDifference,
        points:       row.points,
        form:         row.form,
      })),
    };
  }

  /* Fallback: ESPN */
  const espnSlug = LEAGUES.ESPN[league] || 'eng.1';
  const espnData = await espnFetch(`${espnSlug}/standings`);
  if (espnData?.standings?.length) {
    const entries = espnData.standings[0]?.entries || [];
    return {
      source: 'ESPN',
      standings: entries.map((e, i) => ({
        position:     i + 1,
        team:         e.team?.displayName || '',
        crest:        e.team?.logos?.[0]?.href || '',
        played:       e.stats?.find(s=>s.name==='gamesPlayed')?.value || 0,
        won:          e.stats?.find(s=>s.name==='wins')?.value || 0,
        draw:         e.stats?.find(s=>s.name==='ties')?.value || 0,
        lost:         e.stats?.find(s=>s.name==='losses')?.value || 0,
        goalsFor:     e.stats?.find(s=>s.name==='pointsFor')?.value || 0,
        goalsAgainst: e.stats?.find(s=>s.name==='pointsAgainst')?.value || 0,
        goalDiff:     e.stats?.find(s=>s.name==='pointDifferential')?.value || 0,
        points:       e.stats?.find(s=>s.name==='points')?.value || 0,
        form:         '',
      })),
    };
  }

  return { source: 'none', standings: [] };
}

/* ── TOP SCORERS ── */
async function getScorers(league, FD_KEY, AF_KEY) {
  const fdLeague = LEAGUES.FD[league] || 'PL';
  const fdData   = await fdFetch(`competitions/${fdLeague}/scorers?limit=20`, FD_KEY);
  if (fdData?.scorers?.length) {
    return {
      source:  'football-data.org',
      scorers: fdData.scorers.map(s => ({
        name:     s.player.name,
        team:     s.team.name,
        crest:    s.team.crest,
        goals:    s.goals,
        assists:  s.assists || 0,
        played:   s.playedMatches,
        penalty:  s.penalties || 0,
      })),
    };
  }
  return { source: 'none', scorers: [] };
}

/* ── LINEUP ── */
async function getLineup(matchId, source, AF_KEY) {
  /* Try TheSportsDB first (free, no limit) */
  if (!source || source === 'tsdb') {
    const data = await tsdbFetch(`lookuplineupsbyevent.php?id=${matchId}`);
    if (data?.lineup?.length) {
      const home = data.lineup.filter(p => p.strHome === 'Home');
      const away = data.lineup.filter(p => p.strHome === 'Away');
      return {
        source: 'TheSportsDB',
        home: {
          formation: data.lineup[0]?.strFormation || '',
          players: home.map(p => ({
            name:     p.strPlayer,
            number:   p.intSquadNumber,
            position: p.strPosition,
            sub:      p.strSubstitute === 'Yes',
          })),
        },
        away: {
          formation: data.lineup.find(p=>p.strHome==='Away')?.strFormation || '',
          players: away.map(p => ({
            name:     p.strPlayer,
            number:   p.intSquadNumber,
            position: p.strPosition,
            sub:      p.strSubstitute === 'Yes',
          })),
        },
      };
    }
  }

  /* Try API-Football */
  if (AF_KEY) {
    const data = await afFetch(`fixtures/lineups?fixture=${matchId}`, AF_KEY);
    if (data?.response?.length) {
      const teams = data.response;
      const homeTeam = teams[0] || {};
      const awayTeam = teams[1] || {};
      const mapPlayer = p => ({
        name:     p.player?.name || '',
        number:   p.player?.number || '',
        position: p.player?.pos || '',
        sub:      false,
      });
      return {
        source: 'API-Football',
        home: {
          team:      homeTeam.team?.name,
          formation: homeTeam.formation,
          players:   (homeTeam.startXI || []).map(p => mapPlayer(p)),
          subs:      (homeTeam.substitutes || []).map(p => ({...mapPlayer(p), sub:true})),
        },
        away: {
          team:      awayTeam.team?.name,
          formation: awayTeam.formation,
          players:   (awayTeam.startXI || []).map(p => mapPlayer(p)),
          subs:      (awayTeam.substitutes || []).map(p => ({...mapPlayer(p), sub:true})),
        },
      };
    }
  }

  /* Try Sofascore */
  const sofaData = await sofaFetch(`event/${matchId}/lineups`);
  if (sofaData?.home) {
    const mapSofa = (players) => (players || []).map(p => ({
      name:     p.player?.name || '',
      number:   p.jerseyNumber || '',
      position: p.position || '',
      rating:   p.statistics?.rating || null,
      sub:      false,
    }));
    return {
      source: 'Sofascore',
      home: {
        formation: sofaData.home.formation,
        players:   mapSofa(sofaData.home.players),
      },
      away: {
        formation: sofaData.away.formation,
        players:   mapSofa(sofaData.away.players),
      },
    };
  }

  return { source: 'none', home: { players: [] }, away: { players: [] } };
}

/* ── MATCH ANALYSIS ── */
async function getAnalysis(matchId, AF_KEY) {
  const results = {};

  /* Statistics from API-Football */
  if (AF_KEY) {
    const [statsData, eventsData, h2hData] = await Promise.allSettled([
      afFetch(`fixtures/statistics?fixture=${matchId}`, AF_KEY),
      afFetch(`fixtures/events?fixture=${matchId}`, AF_KEY),
      afFetch(`fixtures/headtohead?h2h=${matchId}`, AF_KEY),
    ]);

    /* Match stats */
    if (statsData.status === 'fulfilled' && statsData.value?.response?.length) {
      const teams = statsData.value.response;
      results.stats = teams.map(team => ({
        team:  team.team?.name,
        stats: (team.statistics || []).map(s => ({
          type:  s.type,
          value: s.value,
        })),
      }));
    }

    /* Match events (goals, cards, subs) */
    if (eventsData.status === 'fulfilled' && eventsData.value?.response?.length) {
      results.events = eventsData.value.response.map(e => ({
        time:    e.time?.elapsed,
        team:    e.team?.name,
        player:  e.player?.name,
        assist:  e.assist?.name,
        type:    e.type,
        detail:  e.detail,
        comment: e.comments,
      }));
    }
  }

  /* Events from Sofascore if no AF key */
  if (!results.events) {
    const sofaEvents = await sofaFetch(`event/${matchId}/incidents`);
    if (sofaEvents?.incidents) {
      results.events = sofaEvents.incidents
        .filter(i => ['goal','card','substitution'].includes(i.incidentType))
        .map(i => ({
          time:   i.time,
          type:   i.incidentType,
          player: i.player?.name || '',
          team:   i.isHome ? 'home' : 'away',
          detail: i.incidentClass || '',
        }));
    }
  }

  return { source: 'API-Football + Sofascore', ...results };
}

/* ── HEAD TO HEAD ── */
async function getH2H(home, away, AF_KEY) {
  if (AF_KEY) {
    const data = await afFetch(`fixtures/headtohead?h2h=${home}-${away}&last=10`, AF_KEY);
    if (data?.response?.length) {
      return {
        source:  'API-Football',
        matches: data.response.map(m => ({
          date:     m.fixture?.date,
          home:     m.teams?.home?.name,
          away:     m.teams?.away?.name,
          scoreH:   m.goals?.home,
          scoreA:   m.goals?.away,
          league:   m.league?.name,
          result:   m.goals?.home > m.goals?.away ? 'home' : m.goals?.away > m.goals?.home ? 'away' : 'draw',
        })),
      };
    }
  }

  /* TSDB fallback */
  const data = await tsdbFetch(`searchevents.php?e=${encodeURIComponent(home+'+vs+'+away)}&s=Soccer`);
  if (data?.event?.length) {
    return {
      source: 'TheSportsDB',
      matches: data.event.slice(0,10).map(e => ({
        date:   e.dateEvent,
        home:   e.strHomeTeam,
        away:   e.strAwayTeam,
        scoreH: e.intHomeScore,
        scoreA: e.intAwayScore,
        league: e.strLeague,
        result: e.intHomeScore > e.intAwayScore ? 'home' : e.intAwayScore > e.intHomeScore ? 'away' : 'draw',
      })),
    };
  }

  return { source: 'none', matches: [] };
}

/* ── LIVE SCORES ── */
async function getLive(FD_KEY) {
  /* FD live */
  const fdData = await fdFetch('matches?status=LIVE,IN_PLAY,PAUSED', FD_KEY);
  if (fdData?.matches?.length) {
    return {
      source:  'football-data.org',
      live:    true,
      count:   fdData.matches.length,
      matches: fdData.matches.map(m => ({
        id:        m.id,
        homeTeam:  m.homeTeam.name,
        awayTeam:  m.awayTeam.name,
        homeCrest: m.homeTeam.crest,
        awayCrest: m.awayTeam.crest,
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away,
        minute:    m.minute || null,
        status:    m.status,
        league:    m.competition?.name,
      })),
    };
  }

  return { source: 'none', live: false, matches: [] };
}

/* ── PLAYER INFO ── */
async function getPlayer(playerId, AF_KEY) {
  if (AF_KEY) {
    const data = await afFetch(`players?id=${playerId}&season=2024`, AF_KEY);
    if (data?.response?.[0]) {
      const p   = data.response[0];
      const pl  = p.player;
      const st  = p.statistics?.[0] || {};
      return {
        source:      'API-Football',
        name:        pl.name,
        photo:       pl.photo,
        age:         pl.age,
        nationality: pl.nationality,
        position:    pl.position,
        team:        st.team?.name,
        stats: {
          appearances: st.games?.appearences,
          goals:       st.goals?.total,
          assists:     st.goals?.assists,
          yellowCards: st.cards?.yellow,
          redCards:    st.cards?.red,
          rating:      st.games?.rating,
          minutesPlayed: st.games?.minutes,
        },
      };
    }
  }
  return { source: 'none' };
}

/* ── INJURIES ── */
async function getInjuries(league, AF_KEY) {
  if (!AF_KEY) return { source: 'no AF_KEY', injuries: [] };
  const afId = LEAGUES.AF[league] || 39;
  const data = await afFetch(`injuries?league=${afId}&season=2024`, AF_KEY);
  if (data?.response?.length) {
    return {
      source:   'API-Football',
      injuries: data.response.slice(0,20).map(i => ({
        player:    i.player?.name,
        team:      i.team?.name,
        type:      i.player?.type,
        reason:    i.player?.reason,
        fixture:   i.fixture?.date,
      })),
    };
  }
  return { source: 'API-Football', injuries: [] };
}

/* ── LEAGUES LIST ── */
async function getLeagues() {
  return {
    source: 'static',
    leagues: [
      { code:'PL',  name:'Premier League',     flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', country:'England' },
      { code:'PD',  name:'La Liga',             flag:'🇪🇸', country:'Spain' },
      { code:'SA',  name:'Serie A',             flag:'🇮🇹', country:'Italy' },
      { code:'BL1', name:'Bundesliga',          flag:'🇩🇪', country:'Germany' },
      { code:'FL1', name:'Ligue 1',             flag:'🇫🇷', country:'France' },
      { code:'CL',  name:'Champions League',    flag:'🇪🇺', country:'Europe' },
      { code:'EL',  name:'Europa League',       flag:'🇪🇺', country:'Europe' },
      { code:'WC',  name:'World Cup 2026',      flag:'🌍', country:'World' },
      { code:'PPL', name:'Primeira Liga',       flag:'🇵🇹', country:'Portugal' },
      { code:'DED', name:'Eredivisie',          flag:'🇳🇱', country:'Netherlands' },
      { code:'MLS', name:'MLS',                 flag:'🇺🇸', country:'USA' },
    ],
  };
}

/* ── MAIN HANDLER ── */
export async function onRequestGet(context) {
  const url    = new URL(context.request.url);
  const type   = url.searchParams.get('type') || 'health';
  const league = url.searchParams.get('league') || 'PL';
  const matchId = url.searchParams.get('match') || '';
  const source  = url.searchParams.get('source') || '';
  const home    = url.searchParams.get('home') || '';
  const away    = url.searchParams.get('away') || '';
  const playerId = url.searchParams.get('id') || '';

  const FD_KEY = context.env.FD_API_KEY || null;
  const AF_KEY = context.env.AF_API_KEY  || null;

  console.log(`[Copa/data] type=${type} league=${league} match=${matchId}`);

  let data;

  switch (type) {
    case 'fixtures':  data = await getFixtures(league, FD_KEY, AF_KEY);          break;
    case 'standings': data = await getStandings(league, FD_KEY, AF_KEY);         break;
    case 'scorers':   data = await getScorers(league, FD_KEY, AF_KEY);           break;
    case 'lineup':    data = await getLineup(matchId, source, AF_KEY);           break;
    case 'analysis':  data = await getAnalysis(matchId, AF_KEY);                 break;
    case 'h2h':       data = await getH2H(home, away, AF_KEY);                   break;
    case 'live':      data = await getLive(FD_KEY);                              break;
    case 'player':    data = await getPlayer(playerId, AF_KEY);                  break;
    case 'injuries':  data = await getInjuries(league, AF_KEY);                  break;
    case 'leagues':   data = await getLeagues();                                 break;
    case 'health':
    default:
      data = {
        status:  'ok',
        app:     'Copa.pi',
        version: '2.0',
        sources: {
          'football-data.org': !!FD_KEY,
          'api-football':      !!AF_KEY,
          'thesportsdb':       true,
          'espn':              true,
          'sofascore':         true,
        },
        endpoints: [
          '/data?type=fixtures&league=PL',
          '/data?type=standings&league=PL',
          '/data?type=scorers&league=PL',
          '/data?type=lineup&match=ID',
          '/data?type=analysis&match=ID',
          '/data?type=h2h&home=TEAM_A&away=TEAM_B',
          '/data?type=live',
          '/data?type=player&id=ID',
          '/data?type=injuries&league=PL',
          '/data?type=leagues',
        ],
      };
  }

  return new Response(JSON.stringify({ success: true, type, ...data }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
