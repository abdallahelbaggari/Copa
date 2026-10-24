// football-data.org v4 adapter → Copa normalised model.
// Free plan: 12 competitions, 10 requests/minute, scores may be delayed, and no
// lineups / bookings / substitutions / match statistics (those need the "Deep Data" add-on).
import { fetchJson, ApiError, num, addDays, utcToday, localDate } from '../util.js';
import { cached, inCooldown, startCooldown } from '../cache.js';
import { catalogueFor } from '../competitions.js';

const BASE = 'https://api.football-data.org/v4';

const STATUS = {
  SCHEDULED: ['pre', 'NS', 'Scheduled'],
  TIMED: ['pre', 'NS', 'Scheduled'],
  IN_PLAY: ['live', 'LIVE', 'Live'],
  LIVE: ['live', 'LIVE', 'Live'],
  PAUSED: ['live', 'HT', 'Half-time'],
  EXTRA_TIME: ['live', 'ET', 'Extra time'],
  PENALTY_SHOOTOUT: ['live', 'P', 'Penalties'],
  FINISHED: ['post', 'FT', 'Full-time'],
  AWARDED: ['post', 'AWD', 'Awarded'],
  POSTPONED: ['off', 'PST', 'Postponed'],
  SUSPENDED: ['off', 'SUSP', 'Suspended'],
  CANCELLED: ['off', 'CANC', 'Cancelled'],
};

export function createFootballData(ctx) {
  const env = ctx.env;
  const plan = (env.FD_PLAN || 'free').toLowerCase(); // 'free' | 'deep'
  const deep = plan === 'deep';

  async function get(path) {
    if (inCooldown()) throw new ApiError(503, 'RATE_LIMITED', 'Data provider rate limit reached. Showing the latest saved data.');
    try {
      const { json, headers } = await fetchJson(BASE + path, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY });
      const left = Number(headers.get('X-Requests-Available-Minute'));
      if (!isNaN(left) && left <= 0) startCooldown(Number(headers.get('X-RequestCounter-Reset')) || 60);
      return json;
    } catch (e) {
      if (e.code === 'RATE_LIMITED') startCooldown(e.retryAfter || 60);
      throw e;
    }
  }

  const team = (t = {}) => ({
    id: t.id ?? null,
    name: t.name || t.shortName || 'TBD',
    short: t.shortName || t.tla || t.name || 'TBD',
    logo: t.crest || null,
  });

  function match(m) {
    const [state, status, label] = STATUS[m.status] || ['pre', m.status || '?', m.status || 'Unknown'];
    const sc = m.score || {};
    let score = null;
    let pen = null;
    if (state !== 'pre' && sc.fullTime && sc.fullTime.home != null) {
      score = { home: sc.fullTime.home, away: sc.fullTime.away };
      if (sc.duration === 'PENALTY_SHOOTOUT' && sc.penalties && sc.penalties.home != null) {
        pen = { home: sc.penalties.home, away: sc.penalties.away };
        // v4 folds shoot-out goals into fullTime; show the match score separately.
        if (sc.regularTime && sc.regularTime.home != null) {
          score = {
            home: sc.regularTime.home + (sc.extraTime?.home || 0),
            away: sc.regularTime.away + (sc.extraTime?.away || 0),
          };
        }
      }
    }
    let st = status, lb = label;
    if (m.status === 'FINISHED' && sc.duration === 'EXTRA_TIME') { st = 'AET'; lb = 'After extra time'; }
    if (m.status === 'FINISHED' && sc.duration === 'PENALTY_SHOOTOUT') { st = 'PEN'; lb = 'After penalties'; }
    const ref = (m.referees || []).find((r) => !r.type || r.type === 'REFEREE');
    return {
      id: m.id,
      comp: {
        id: m.competition?.id ?? null,
        name: m.competition?.name || '',
        country: m.area?.name || '',
        logo: m.competition?.emblem || null,
        round: m.matchday ? `Matchday ${m.matchday}` : (m.stage || '').replace(/_/g, ' ').toLowerCase() || null,
      },
      kickoff: m.utcDate,
      state, status: st, statusLabel: lb,
      minute: num(m.minute),
      extra: num(m.injuryTime),
      home: team(m.homeTeam), away: team(m.awayTeam),
      score,
      ht: sc.halfTime && sc.halfTime.home != null ? { home: sc.halfTime.home, away: sc.halfTime.away } : null,
      pen,
      winner: sc.winner === 'HOME_TEAM' ? 'home' : sc.winner === 'AWAY_TEAM' ? 'away' : sc.winner === 'DRAW' ? 'draw' : null,
      venue: m.venue || null,
      referee: ref ? ref.name : null,
    };
  }

  function side(teamId, homeId) { return teamId === homeId ? 'home' : 'away'; }

  function detail(m) {
    const base = match(m);
    const homeId = m.homeTeam?.id;
    const ev = [];
    (m.goals || []).forEach((g) => ev.push({
      minute: num(g.minute), extra: num(g.injuryTime), side: side(g.team?.id, homeId),
      type: g.type === 'OWN' ? 'own_goal' : g.type === 'PENALTY' ? 'penalty' : 'goal',
      player: g.scorer?.name || null, assist: g.assist?.name || null,
      score: g.score ? { home: g.score.home, away: g.score.away } : null,
    }));
    (m.bookings || []).forEach((b) => ev.push({
      minute: num(b.minute), side: side(b.team?.id, homeId),
      type: b.card === 'RED' ? 'red' : b.card === 'YELLOW_RED' ? 'second_yellow' : 'yellow',
      player: b.player?.name || null,
    }));
    (m.substitutions || []).forEach((s) => ev.push({
      minute: num(s.minute), side: side(s.team?.id, homeId), type: 'sub',
      playerIn: s.playerIn?.name || null, playerOut: s.playerOut?.name || null,
    }));
    ev.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.extra ?? 0) - (b.extra ?? 0));

    const lu = (t) => t && t.lineup && t.lineup.length ? {
      formation: t.formation || null,
      coach: t.coach?.name || null,
      start: t.lineup.map((p) => ({ id: p.id, name: p.name, number: p.shirtNumber ?? null, pos: p.position || null, grid: null })),
      subs: (t.bench || []).map((p) => ({ id: p.id, name: p.name, number: p.shirtNumber ?? null, pos: p.position || null })),
    } : null;
    const luH = lu(m.homeTeam), luA = lu(m.awayTeam);

    let stats = null;
    const sh = m.homeTeam?.statistics, sa = m.awayTeam?.statistics;
    if (sh && sa) {
      const rows = [
        ['ball_possession', 'Possession', '%'], ['shots', 'Shots'], ['shots_on_goal', 'Shots on target'],
        ['corner_kicks', 'Corners'], ['fouls', 'Fouls'], ['offsides', 'Offsides'], ['saves', 'Saves'],
        ['yellow_cards', 'Yellow cards'], ['red_cards', 'Red cards'],
      ];
      stats = rows.map(([k, label, unit]) => ({ key: k, label, unit: unit || '', home: num(sh[k]), away: num(sa[k]) }));
    }

    return {
      ...base,
      events: ev.length || deep ? ev : null,
      lineups: luH || luA ? { home: luH, away: luA } : null,
      stats,
      capabilities: { events: deep, lineups: deep, stats: deep, h2h: true },
      notes: deep ? [] : ['Line-ups, cards, substitutions and match statistics are not included in the free football-data.org plan.'],
    };
  }

  // All matches in a UTC date window, shared between the date view and the live view.
  function range(from, to) {
    const today = utcToday();
    const ttl = to >= today && from <= today ? 60 : to < today ? 6 * 3600 : 1800;
    return cached(ctx, `fd:range:${from}:${to}`, ttl, async () => {
      const j = await get(`/matches?dateFrom=${from}&dateTo=${to}`);
      return (j.matches || []).map(match);
    });
  }

  return {
    name: 'football-data',
    label: 'football-data.org',
    attribution: 'Football data provided by the Football-Data.org API',
    capabilities: { liveDelayed: !deep, events: deep, lineups: deep, stats: deep, search: 'teams-in-covered-competitions' },

    async matchesByDate(date, tz) {
      const r = await range(addDays(date, -1), addDays(date, 1));
      return { ...r, data: r.data.filter((m) => localDate(m.kickoff, tz) === date) };
    },

    async live() {
      const t = utcToday();
      const r = await range(addDays(t, -1), addDays(t, 1));
      return { ...r, data: r.data.filter((m) => m.state === 'live') };
    },

    async match(id) {
      return cached(ctx, `fd:match:${id}`, matchTtl, async () => detail(await get(`/matches/${id}`)));
    },

    async h2h(id) {
      return cached(ctx, `fd:h2h:${id}`, 6 * 3600, async () => {
        const j = await get(`/matches/${id}/head2head?limit=10`);
        const a = j.aggregates || {};
        return {
          summary: a.numberOfMatches != null ? {
            played: a.numberOfMatches,
            home: { id: a.homeTeam?.id, name: a.homeTeam?.name, wins: a.homeTeam?.wins, draws: a.homeTeam?.draws },
            away: { id: a.awayTeam?.id, name: a.awayTeam?.name, wins: a.awayTeam?.wins, draws: a.awayTeam?.draws },
            goals: a.totalGoals ?? null,
          } : null,
          matches: (j.matches || []).map(match),
        };
      });
    },

    async competitions() {
      return { data: catalogueFor('football-data'), fetchedAt: Date.now(), stale: false, cache: 'static' };
    },

    async competition(id) {
      return cached(ctx, `fd:comp:${id}`, 600, async () => {
        const j = await get(`/competitions/${id}/standings`);
        const groups = (j.standings || []).filter((s) => s.type === 'TOTAL').map((s) => ({
          name: s.group ? s.group.replace(/_/g, ' ').replace(/GROUP/i, 'Group') : null,
          rows: (s.table || []).map((r) => ({
            rank: r.position, team: team(r.team), played: r.playedGames, won: r.won, drawn: r.draw, lost: r.lost,
            gf: r.goalsFor, ga: r.goalsAgainst, gd: r.goalDifference, points: r.points,
            form: r.form ? r.form.replace(/,/g, '').split('') : null, zone: null,
          })),
        }));
        return {
          id: j.competition?.id ?? Number(id),
          name: j.competition?.name || '',
          country: j.area?.name || '',
          logo: j.competition?.emblem || null,
          season: j.season ? `${j.season.startDate?.slice(0, 4)}/${j.season.endDate?.slice(2, 4)}` : null,
          currentRound: j.season?.currentMatchday ? `Matchday ${j.season.currentMatchday}` : null,
          standings: groups,
          zonesAvailable: false,
        };
      });
    },

    async competitionMatches(id) {
      const t = utcToday();
      const from = addDays(t, -10), to = addDays(t, 14);
      return cached(ctx, `fd:compm:${id}:${t}`, 300, async () => {
        const j = await get(`/competitions/${id}/matches?dateFrom=${from}&dateTo=${to}`);
        return (j.matches || []).map(match);
      });
    },

    // Whole season, knockout stages only (1 request, cached 1 h) → Copa bracket.
    async bracket(id) {
      return cached(ctx, `fd:ko:${id}`, 3600, async () => {
        const j = await get(`/competitions/${id}/matches`);
        return (j.matches || []).filter((m) => m.stage && !/LEAGUE|GROUP|REGULAR/.test(m.stage))
          .map((m) => ({ ...match(m), stage: m.stage.replace(/_/g, ' ').toLowerCase() }));
      });
    },

    async scorers(id) {
      return cached(ctx, `fd:scorers:${id}`, 3600, async () => {
        const j = await get(`/competitions/${id}/scorers?limit=20`);
        return (j.scorers || []).map((s, i) => ({
          rank: i + 1,
          player: { id: s.player?.id, name: s.player?.name, nationality: s.player?.nationality || null, photo: null },
          team: team(s.team),
          goals: num(s.goals), assists: num(s.assists), penalties: num(s.penalties), played: num(s.playedMatches),
        }));
      });
    },

    async team(id) {
      const info = await cached(ctx, `fd:team:${id}`, 6 * 3600, async () => {
        const t = await get(`/teams/${id}`);
        return {
          id: t.id, name: t.name, short: t.shortName || t.tla, logo: t.crest || null,
          country: t.area?.name || null, founded: t.founded || null,
          venue: t.venue || null, website: t.website || null,
          coach: t.coach?.name || null,
          competitions: (t.runningCompetitions || []).map((c) => ({ id: c.id, name: c.name, logo: c.emblem || null })),
          squad: (t.squad || []).map((p) => ({ id: p.id, name: p.name, pos: p.position || null, nationality: p.nationality || null, number: p.shirtNumber ?? null, age: p.dateOfBirth ? age(p.dateOfBirth) : null })),
        };
      });
      const fx = await cached(ctx, `fd:teamm:${id}`, 600, async () => {
        const t = utcToday();
        const j = await get(`/teams/${id}/matches?dateFrom=${addDays(t, -60)}&dateTo=${addDays(t, 60)}`);
        const all = (j.matches || []).map(match);
        return {
          recent: all.filter((m) => m.state === 'post').slice(-6).reverse(),
          upcoming: all.filter((m) => m.state !== 'post').slice(0, 6),
        };
      }).catch(() => ({ data: { recent: [], upcoming: [] }, stale: true }));
      return { ...info, data: { ...info.data, ...fx.data }, stale: info.stale || fx.stale };
    },

    async search(q) {
      const ql = q.toLowerCase();
      const comps = catalogueFor('football-data').filter((c) => c.covered && (c.name.toLowerCase().includes(ql) || c.country.toLowerCase().includes(ql)));
      const teams = new Map();
      let partial = false;
      let fetchedNow = 0;
      for (const c of catalogueFor('football-data').filter((c) => c.covered)) {
        let r;
        try {
          // Team lists change rarely; fetch at most 3 uncached lists per search to respect 10 req/min.
          r = await cached(ctx, `fd:teams:${c.id}`, 86400, async () => {
            if (fetchedNow >= 3) throw new ApiError(503, 'DEFERRED', 'deferred');
            fetchedNow++;
            const j = await get(`/competitions/${c.id}/teams`);
            return (j.teams || []).map((t) => ({ ...team(t), country: t.area?.name || null }));
          });
        } catch { partial = true; continue; }
        for (const t of r.data) {
          if (t.name.toLowerCase().includes(ql) || (t.short || '').toLowerCase().includes(ql)) teams.set(t.id, t);
        }
      }
      return { data: { competitions: comps, teams: [...teams.values()].slice(0, 25), partial }, fetchedAt: Date.now(), stale: false };
    },
  };
}

function age(dob) {
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const n = new Date();
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

// Live: 30s. Today/pre-match: 2 min. Finished or called off: 1 day.
export function matchTtl(m) {
  if (!m) return 30;
  if (m.state === 'live') return 30;
  if (m.state === 'post' || m.state === 'off') return 86400;
  return Date.parse(m.kickoff) - Date.now() < 3 * 3600e3 ? 60 : 1800;
}
