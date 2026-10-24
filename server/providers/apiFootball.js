// API-Football (api-sports.io v3) adapter → Copa normalised model.
// Covers 1,000+ competitions incl. Saudi Pro League, NPFL and CAF competitions, with
// events, line-ups and statistics. Free plan: 100 requests/day and limited seasons —
// production needs a paid plan. Cache TTLs below are tuned to stay within quotas.
import { fetchJson, ApiError, num, utcToday, addDays } from '../util.js';
import { cached } from '../cache.js';
import { catalogueFor } from '../competitions.js';

const BASE = 'https://v3.football.api-sports.io';

const STATUS = {
  TBD: ['pre', 'TBD', 'Time to be confirmed'], NS: ['pre', 'NS', 'Scheduled'],
  '1H': ['live', '1H', 'First half'], HT: ['live', 'HT', 'Half-time'], '2H': ['live', '2H', 'Second half'],
  ET: ['live', 'ET', 'Extra time'], BT: ['live', 'BT', 'Break'], P: ['live', 'P', 'Penalties'],
  LIVE: ['live', 'LIVE', 'Live'], INT: ['live', 'INT', 'Interrupted'], SUSP: ['off', 'SUSP', 'Suspended'],
  FT: ['post', 'FT', 'Full-time'], AET: ['post', 'AET', 'After extra time'], PEN: ['post', 'PEN', 'After penalties'],
  PST: ['off', 'PST', 'Postponed'], CANC: ['off', 'CANC', 'Cancelled'], ABD: ['off', 'ABD', 'Abandoned'],
  AWD: ['post', 'AWD', 'Awarded'], WO: ['post', 'WO', 'Walkover'],
};

const STAT_ROWS = [
  ['Ball Possession', 'Possession', '%'], ['expected_goals', 'Expected goals (xG)', ''],
  ['Total Shots', 'Shots', ''], ['Shots on Goal', 'Shots on target', ''], ['Shots off Goal', 'Shots off target', ''],
  ['Corner Kicks', 'Corners', ''], ['Fouls', 'Fouls', ''], ['Offsides', 'Offsides', ''],
  ['Goalkeeper Saves', 'Saves', ''], ['Passes %', 'Pass accuracy', '%'],
  ['Yellow Cards', 'Yellow cards', ''], ['Red Cards', 'Red cards', ''],
];

export function afGetter(env) {
  return async function get(path) {
  const { json } = await fetchJson(BASE + path, { 'x-apisports-key': env.API_FOOTBALL_KEY });
  const errs = json.errors && (Array.isArray(json.errors) ? json.errors : Object.values(json.errors));
  if (errs && errs.length) {
    const msg = String(errs[0]);
    if (/limit|requests/i.test(msg)) throw new ApiError(503, 'RATE_LIMITED', 'Daily data quota reached. Showing the latest saved data.');
    if (/plan|season/i.test(msg)) throw new ApiError(502, 'UPSTREAM_DENIED', 'This season or competition is not included in the current data plan.');
    throw new ApiError(502, 'UPSTREAM_ERROR', 'Data provider error: ' + msg.slice(0, 120));
  }
  return json.response || [];
  };
}

export const afTeam = (t = {}) => ({ id: t.id ?? null, name: t.name || 'TBD', short: t.name || 'TBD', logo: t.logo || null });

export function afMatch(f) {
  const team = afTeam;
  const fx = f.fixture || {}, st = fx.status || {};
  const [state, status, label] = STATUS[st.short] || ['pre', st.short || '?', st.long || 'Unknown'];
  const s = f.score || {};
  const hasScore = state !== 'pre' && f.goals && f.goals.home != null;
  return {
    id: fx.id,
    comp: { id: f.league?.id ?? null, name: f.league?.name || '', country: f.league?.country || '', logo: f.league?.logo || null, round: f.league?.round || null },
    kickoff: fx.date,
    state, status, statusLabel: label,
    minute: state === 'live' ? num(st.elapsed) : null,
    extra: state === 'live' ? num(st.extra) : null,
    home: team(f.teams?.home), away: team(f.teams?.away),
    score: hasScore ? { home: f.goals.home, away: f.goals.away } : null,
    ht: s.halftime && s.halftime.home != null ? { home: s.halftime.home, away: s.halftime.away } : null,
    pen: s.penalty && s.penalty.home != null ? { home: s.penalty.home, away: s.penalty.away } : null,
    winner: f.teams?.home?.winner ? 'home' : f.teams?.away?.winner ? 'away' : state === 'post' && hasScore && f.goals.home === f.goals.away && !s.penalty?.home ? 'draw' : null,
    venue: fx.venue?.name ? fx.venue.name + (fx.venue.city ? ', ' + fx.venue.city : '') : null,
    referee: fx.referee || null,
  };
}

export function afDetail(f) {
  const base = afMatch(f);
  const homeId = f.teams?.home?.id;
  const sideOf = (id) => (id === homeId ? 'home' : 'away');

  let events = null;
  if (Array.isArray(f.events)) {
    events = f.events.map((e) => {
      const d = (e.detail || '').toLowerCase();
      const o = { minute: num(e.time?.elapsed), extra: num(e.time?.extra), side: sideOf(e.team?.id), player: e.player?.name || null };
      if (e.type === 'Goal') {
        if (d.includes('missed')) return { ...o, type: 'missed_penalty' };
        return { ...o, type: d.includes('own') ? 'own_goal' : d.includes('penalty') ? 'penalty' : 'goal', assist: e.assist?.name || null };
      }
      if (e.type === 'Card') return { ...o, type: d.includes('red') ? 'red' : d.includes('second') ? 'second_yellow' : 'yellow' };
      // API-Football's in/out order for substitutions is not documented consistently, so both
      // names are shown without labelling which one came on.
      if (e.type === 'subst') return { ...o, type: 'sub', pair: [e.player?.name || null, e.assist?.name || null] };
      if (e.type === 'Var') return { ...o, type: 'var', note: e.detail || 'VAR review' };
      return { ...o, type: 'other', note: e.detail || e.type };
    });
  }

  let lineups = null;
  if (Array.isArray(f.lineups) && f.lineups.length) {
    const lu = (l) => l && {
      formation: l.formation || null,
      coach: l.coach?.name || null,
      start: (l.startXI || []).map(({ player: p }) => ({ id: p.id, name: p.name, number: p.number ?? null, pos: p.pos || null, grid: p.grid || null })),
      subs: (l.substitutes || []).map(({ player: p }) => ({ id: p.id, name: p.name, number: p.number ?? null, pos: p.pos || null })),
    };
    lineups = { home: lu(f.lineups.find((l) => l.team?.id === homeId)), away: lu(f.lineups.find((l) => l.team?.id !== homeId)) };
  }

  let stats = null;
  if (Array.isArray(f.statistics) && f.statistics.length === 2) {
    const h = f.statistics.find((s) => s.team?.id === homeId) || f.statistics[0];
    const a = f.statistics.find((s) => s !== h);
    const val = (side, type) => {
      const v = (side.statistics || []).find((x) => x.type === type)?.value;
      if (v === null || v === undefined) return null;
      return typeof v === 'string' ? num(v.replace('%', '')) : num(v);
    };
    stats = STAT_ROWS.map(([type, label, unit]) => ({ key: type, label, unit, home: val(h, type), away: val(a, type) }))
      .filter((r) => r.home !== null || r.away !== null);
    if (!stats.length) stats = null;
  }

  return {
    ...base,
    events, lineups, stats,
    capabilities: { events: Array.isArray(f.events), lineups: lineups !== null, stats: stats !== null, h2h: true },
    notes: [],
  };
}


export function createApiFootball(ctx) {
  const env = ctx.env;

  const get = afGetter(env);
  const team = afTeam, match = afMatch, detail = afDetail;

  async function currentSeason(leagueId) {
    const r = await cached(ctx, `af:league:${leagueId}`, 86400, async () => {
      const res = await get(`/leagues?id=${leagueId}&current=true`);
      const l = res[0];
      if (!l) throw new ApiError(404, 'NOT_FOUND', 'Competition not found at the data provider.');
      const s = (l.seasons || []).find((x) => x.current) || (l.seasons || []).slice(-1)[0] || {};
      return {
        id: l.league.id, name: l.league.name, logo: l.league.logo, country: l.country?.name || '',
        season: s.year ?? null, start: s.start || null, end: s.end || null,
        coverage: s.coverage || {},
      };
    });
    return r.data;
  }

  const ttlFor = (m) => (!m ? 60 : m.state === 'live' ? 60 : m.state === 'post' || m.state === 'off' ? 86400 : Date.parse(m.kickoff) - Date.now() < 3 * 3600e3 ? 120 : 1800);

  return {
    name: 'api-football',
    label: 'API-Football',
    attribution: 'Football data provided by API-Football (api-sports.io)',
    capabilities: { liveDelayed: false, events: true, lineups: true, stats: true, search: 'teams' },

    async matchesByDate(date, tz) {
      const today = utcToday();
      const ttl = Math.abs(Date.parse(date) - Date.parse(today)) <= 86400e3 ? 120 : date < today ? 6 * 3600 : 1800;
      return cached(ctx, `af:date:${date}:${tz}`, ttl, async () => (await get(`/fixtures?date=${date}&timezone=${encodeURIComponent(tz)}`)).map(match));
    },

    async live() {
      return cached(ctx, 'af:live', 60, async () => (await get('/fixtures?live=all')).map(match));
    },

    async match(id) {
      return cached(ctx, `af:match:${id}`, ttlFor, async () => {
        const res = await get(`/fixtures?id=${id}`);
        if (!res[0]) throw new ApiError(404, 'NOT_FOUND', 'Match not found.');
        return detail(res[0]);
      });
    },

    async h2h(id) {
      const m = (await this.match(id)).data;
      return cached(ctx, `af:h2h:${m.home.id}-${m.away.id}`, 6 * 3600, async () => {
        const list = (await get(`/fixtures/headtohead?h2h=${m.home.id}-${m.away.id}&last=10`)).map(match).filter((x) => x.state === 'post');
        const s = { played: list.length, home: { id: m.home.id, name: m.home.name, wins: 0 }, away: { id: m.away.id, name: m.away.name, wins: 0 }, draws: 0 };
        for (const x of list) {
          if (!x.score) continue;
          const winnerId = x.winner === 'home' ? x.home.id : x.winner === 'away' ? x.away.id : null;
          if (winnerId === m.home.id) s.home.wins++; else if (winnerId === m.away.id) s.away.wins++; else s.draws++;
        }
        s.home.draws = s.away.draws = s.draws;
        return { summary: list.length ? s : null, matches: list.sort((a, b) => b.kickoff.localeCompare(a.kickoff)) };
      });
    },

    async competitions() {
      return { data: catalogueFor('api-football'), fetchedAt: Date.now(), stale: false, cache: 'static' };
    },

    async competition(id) {
      const lg = await currentSeason(id);
      return cached(ctx, `af:comp:${id}:${lg.season}`, 600, async () => {
        let groups = [];
        if (lg.coverage.standings !== false) {
          const res = await get(`/standings?league=${id}&season=${lg.season}`);
          const st = res[0]?.league?.standings || [];
          groups = st.map((g) => ({
            name: g.length && g[0].group && st.length > 1 ? g[0].group : null,
            rows: g.map((r) => ({
              rank: r.rank, team: team(r.team), played: r.all?.played, won: r.all?.win, drawn: r.all?.draw, lost: r.all?.lose,
              gf: r.all?.goals?.for, ga: r.all?.goals?.against, gd: r.goalsDiff, points: r.points,
              form: r.form ? r.form.split('') : null, zone: r.description || null,
            })),
          }));
        }
        return {
          id: lg.id, name: lg.name, country: lg.country, logo: lg.logo,
          season: lg.season ? (lg.start && lg.end && lg.start.slice(0, 4) !== lg.end.slice(0, 4) ? `${lg.start.slice(0, 4)}/${lg.end.slice(2, 4)}` : String(lg.season)) : null,
          currentRound: null,
          standings: groups,
          standingsAvailable: lg.coverage.standings !== false,
          zonesAvailable: true,
        };
      });
    },

    async competitionMatches(id) {
      const lg = await currentSeason(id);
      const t = utcToday();
      return cached(ctx, `af:compm:${id}:${t}`, 300, async () =>
        (await get(`/fixtures?league=${id}&season=${lg.season}&from=${addDays(t, -10)}&to=${addDays(t, 14)}`)).map(match));
    },

    async bracket(id) {
      const lg = await currentSeason(id);
      return cached(ctx, `af:season:${id}:${lg.season}`, 21600, async () =>
        (await get(`/fixtures?league=${id}&season=${lg.season}`)).map(match));
    },

    async scorers(id) {
      const lg = await currentSeason(id);
      return cached(ctx, `af:scorers:${id}:${lg.season}`, 3600, async () =>
        (await get(`/players/topscorers?league=${id}&season=${lg.season}`)).slice(0, 20).map((p, i) => {
          const s = (p.statistics || [])[0] || {};
          return {
            rank: i + 1,
            player: { id: p.player?.id, name: p.player?.name, nationality: p.player?.nationality || null, photo: p.player?.photo || null },
            team: team(s.team), goals: num(s.goals?.total), assists: num(s.goals?.assists), penalties: num(s.penalty?.scored), played: num(s.games?.appearences),
          };
        }));
    },

    async team(id) {
      const info = await cached(ctx, `af:team:${id}`, 12 * 3600, async () => {
        const [t, squad, coaches] = await Promise.all([
          get(`/teams?id=${id}`),
          get(`/players/squads?team=${id}`).catch(() => []),
          get(`/coachs?team=${id}`).catch(() => []),
        ]);
        const x = t[0];
        if (!x) throw new ApiError(404, 'NOT_FOUND', 'Team not found.');
        const coach = coaches.find((c) => (c.career || []).some((k) => k.team?.id === Number(id) && !k.end));
        return {
          id: x.team.id, name: x.team.name, short: x.team.code || x.team.name, logo: x.team.logo || null,
          country: x.team.country || null, founded: x.team.founded || null, national: !!x.team.national,
          venue: x.venue?.name ? x.venue.name + (x.venue.city ? ', ' + x.venue.city : '') : null,
          coach: coach ? coach.name : null, competitions: [],
          squad: ((squad[0] || {}).players || []).map((p) => ({ id: p.id, name: p.name, pos: p.position || null, number: p.number ?? null, age: p.age ?? null, nationality: null })),
        };
      });
      const fx = await cached(ctx, `af:teamm:${id}`, 600, async () => {
        const [next, last] = await Promise.all([get(`/fixtures?team=${id}&next=6`), get(`/fixtures?team=${id}&last=6`)]);
        return { upcoming: next.map(match), recent: last.map(match) };
      }).catch(() => ({ data: { recent: [], upcoming: [] }, stale: true }));
      return { ...info, data: { ...info.data, ...fx.data }, stale: info.stale || fx.stale };
    },

    async search(q) {
      const ql = q.toLowerCase();
      const comps = catalogueFor('api-football').filter((c) => c.name.toLowerCase().includes(ql) || c.country.toLowerCase().includes(ql));
      let teams = [];
      if (q.length >= 3) {
        const r = await cached(ctx, `af:search:${ql}`, 86400, async () =>
          (await get(`/teams?search=${encodeURIComponent(q)}`)).slice(0, 25).map((x) => ({ ...team(x.team), country: x.team.country || null })));
        teams = r.data;
      }
      return { data: { competitions: comps, teams, partial: q.length < 3 }, fetchedAt: Date.now(), stale: false };
    },
  };
}
