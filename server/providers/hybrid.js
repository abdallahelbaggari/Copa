// HYBRID provider — both completely free sources together:
//   • football-data.org (free forever): the 12 big competitions (PL, UCL, La Liga, …)
//   • API-Football free plan (100 requests/day): CAF Champions League, Libertadores, CAF Confederation Cup, AFCON (AF_LEAGUES)
//
// API-Football ids are prefixed with "a" (match a1234, team a2932, competition a307) so they
// can never clash with football-data.org ids.
//
// How the 100/day budget is protected (see server/budget.js):
//   • Whole-season fixture list per league: 1 request, cached 6 h → every date view, team page,
//     competition matches and head-to-head are built from it for free.
//   • Live/results feed: ONE batched request (/fixtures?ids=…) for every match currently in
//     progress across both leagues, only while matches are in their time window. Refresh every
//     5–15 min depending on how much budget is left today. Final scores are kept in an "overlay".
//   • Standings 6 h, top scorers 24 h, team info/squads 7 days, match details only on demand.
//   • Everything is shared across Cloudflare instances through KV (bind COPA_CACHE).
//   • When the budget runs out the app keeps showing the last saved data marked "Delayed".
import { createFootballData } from './footballData.js';
import { afGetter, afMatch, afDetail, afTeam } from './apiFootball.js';
import { cached } from '../cache.js';
import { take, PRIORITY, budgetUsed, budgetInfo } from '../budget.js';
import { ApiError, localDate, utcToday, addDays, num } from '../util.js';
import { CATALOGUE, catalogueFor } from '../competitions.js';

const isAf = (id) => /^a\d+$/.test(String(id));
const raw = (id) => Number(String(id).replace(/^a/, ''));
const nsId = (id) => (id === null || id === undefined ? null : 'a' + id);
const WINDOW_BEFORE = 10 * 60e3;   // start watching 10 min before kick-off
const WINDOW_AFTER = 150 * 60e3;   // stop watching 150 min after kick-off

function ns(m) {
  return {
    ...m,
    id: nsId(m.id),
    comp: { ...m.comp, id: nsId(m.comp.id) },
    home: { ...m.home, id: nsId(m.home.id) },
    away: { ...m.away, id: nsId(m.away.id) },
  };
}

// Small KV helpers (memory fallback) for the results overlay.
const memKV = new Map();
async function kvGet(ctx, key) {
  if (ctx.env.COPA_CACHE) { try { return await ctx.env.COPA_CACHE.get(key, 'json'); } catch { /* ignore */ } }
  return memKV.get(key) || null;
}
async function kvPut(ctx, key, val, ttl) {
  memKV.set(key, val);
  if (ctx.env.COPA_CACHE) {
    const p = ctx.env.COPA_CACHE.put(key, JSON.stringify(val), { expirationTtl: ttl }).catch(() => {});
    if (ctx.waitUntil) ctx.waitUntil(p);
  }
}

export function createHybrid(ctx) {
  const env = ctx.env;
  const fd = createFootballData(ctx);
  const get = afGetter(env);
  const LEAGUES = String(env.AF_LEAGUES || '12,13,20,6').split(',').map((x) => Number(x.trim())).filter(Boolean);
  const warnings = [];

  const c = (key, ttl, loader, staleMax = 7 * 86400) => cached(ctx, key, ttl, loader, staleMax, { persist: true });

  async function afCall(path, priority) {
    if (!(await take(ctx, priority))) {
      throw new ApiError(503, 'BUDGET', 'Today’s free data allowance for this league is used up. Showing the latest saved data.');
    }
    return get(path);
  }

  /* ---------- per-league state ---------- */
  async function isDenied(L) {
    const v = await kvGet(ctx, 'h:deny:' + L);
    return !!(v && v.denied);
  }
  async function markDenied(L, msg) {
    await kvPut(ctx, 'h:deny:' + L, { denied: true, msg, at: Date.now() }, 12 * 3600);
  }
  async function guard(L, fn) {
    try { return await fn(); }
    catch (e) {
      if (e.code === 'UPSTREAM_DENIED') await markDenied(L, e.message);
      throw e;
    }
  }

  async function leagueInfo(L) {
    const r = await guard(L, () => c(`h:league:${L}`, 3 * 86400, async () => {
      const res = await afCall(`/leagues?id=${L}&current=true`, PRIORITY.essential);
      const l = res[0];
      if (!l) throw new ApiError(404, 'NOT_FOUND', 'Competition not found.');
      const s = (l.seasons || []).find((x) => x.current) || (l.seasons || []).slice(-1)[0] || {};
      return { id: l.league.id, name: l.league.name, logo: l.league.logo, country: l.country?.name || '', season: s.year ?? null, start: s.start || null, end: s.end || null };
    }));
    return r.data;
  }

  async function season(L) {
    const li = await leagueInfo(L);
    const r = await guard(L, () => c(`h:season:${L}:${li.season}`, 6 * 3600, async () =>
      (await afCall(`/fixtures?league=${L}&season=${li.season}`, PRIORITY.essential)).map(afMatch)));
    return { ...r, li };
  }

  async function overlay() { return (await kvGet(ctx, 'h:overlay')) || {}; }
  const applyOverlay = (list, ov) => list.map((m) => ov[m.id] || m);

  // Collect every match in the live window across leagues and refresh them in one batched request.
  async function refreshFeed(seasons) {
    const ov = await overlay();
    const now = Date.now();
    const ids = [];
    for (const s of seasons) {
      for (const m of applyOverlay(s.data, ov)) {
        const k = Date.parse(m.kickoff);
        if (m.state !== 'post' && m.state !== 'off' && now >= k - WINDOW_BEFORE && now <= k + WINDOW_AFTER) ids.push(m.id);
      }
    }
    if (!ids.length) return { ov, fetchedAt: null, stale: false };
    const batch = ids.slice(0, 20).sort((a, b) => a - b);
    let r;
    try {
      r = await c('h:feed:' + batch.join('-'), (d) => (d && d.ttl) || 300, async () => {
        const used = await budgetUsed(ctx);
        const ttl = used < 45 ? 300 : used < 70 ? 480 : 900;
        const list = (await afCall(`/fixtures?ids=${batch.join('-')}`, PRIORITY.essential)).map(afMatch);
        // keep results after their window closes
        const cur = await overlay();
        const cutoff = now - 4 * 86400e3;
        for (const m of list) cur[m.id] = m;
        for (const k of Object.keys(cur)) if (Date.parse(cur[k].kickoff) < cutoff) delete cur[k];
        await kvPut(ctx, 'h:overlay', cur, 5 * 86400);
        return { ttl, list };
      }, 3600);
    } catch (e) {
      warnings.push(e.message);
      return { ov, fetchedAt: null, stale: true };
    }
    const merged = { ...ov };
    for (const m of r.data.list) merged[m.id] = m;
    return { ov: merged, fetchedAt: r.fetchedAt, stale: r.stale };
  }

  async function enabledLeagues() {
    const out = [];
    for (const L of LEAGUES) if (!(await isDenied(L))) out.push(L);
    return out;
  }

  // All seasons for enabled leagues (skips leagues that fail), plus the live overlay.
  async function afAll({ live = true } = {}) {
    const seasons = [];
    let stale = false, oldest = Date.now();
    for (const L of await enabledLeagues()) {
      try {
        const s = await season(L);
        seasons.push(s);
        stale = stale || s.stale;
        oldest = Math.min(oldest, s.fetchedAt);
      } catch (e) { if (e.code !== 'UPSTREAM_DENIED') { warnings.push(e.message); stale = true; } }
    }
    const feed = live ? await refreshFeed(seasons) : { ov: await overlay(), stale: false };
    const all = seasons.flatMap((s) => applyOverlay(s.data, feed.ov));
    return { all, seasons, stale: stale || feed.stale, fetchedAt: feed.fetchedAt || oldest };
  }

  function merge(fdRes, afRes, data) {
    const parts = [fdRes, afRes].filter(Boolean);
    return {
      data,
      fetchedAt: Math.min(...parts.map((p) => p.fetchedAt || Date.now())),
      stale: parts.some((p) => p.stale),
      warning: warnings[0] || parts.find((p) => p.warning)?.warning || null,
    };
  }

  async function settle(fdPromise, afPromise) {
    const [a, b] = await Promise.allSettled([fdPromise, afPromise]);
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
    if (a.status === 'rejected') warnings.push(a.reason.message);
    if (b.status === 'rejected') warnings.push(b.reason.message);
    return [a.status === 'fulfilled' ? a.value : null, b.status === 'fulfilled' ? b.value : null];
  }


  /* ---------- standings / scorers (league endpoints) ---------- */
  async function standings(L) {
    const li = await leagueInfo(L);
    return c(`h:stand:${L}:${li.season}`, 6 * 3600, async () => {
      const res = await afCall(`/standings?league=${L}&season=${li.season}`, PRIORITY.normal);
      const st = res[0]?.league?.standings || [];
      const groups = st.map((g) => ({
        name: g.length && g[0].group && st.length > 1 ? g[0].group : null,
        rows: g.map((r) => ({
          rank: r.rank, team: { ...afTeam(r.team), id: nsId(r.team?.id) }, played: r.all?.played, won: r.all?.win, drawn: r.all?.draw, lost: r.all?.lose,
          gf: r.all?.goals?.for, ga: r.all?.goals?.against, gd: r.goalsDiff, points: r.points,
          form: r.form ? r.form.split('') : null, zone: r.description || null,
        })),
      }));
      return {
        id: nsId(li.id), name: li.name, country: li.country, logo: li.logo,
        season: li.start && li.end && li.start.slice(0, 4) !== li.end.slice(0, 4) ? `${li.start.slice(0, 4)}/${li.end.slice(2, 4)}` : String(li.season ?? ''),
        currentRound: null, standings: groups, zonesAvailable: true,
      };
    });
  }

  return {
    name: 'hybrid',
    label: 'football-data.org + API-Football',
    attribution: 'Football data provided by the Football-Data.org API and API-Football (api-sports.io)',
    capabilities: { liveDelayed: true, events: 'partial', lineups: 'partial', stats: 'partial', search: 'teams' },

    async status() { return { budget: await budgetInfo(ctx), leagues: LEAGUES, denied: (await Promise.all(LEAGUES.map(isDenied))).map((d, i) => d ? LEAGUES[i] : null).filter(Boolean) }; },

    async matchesByDate(date, tz) {
      const nearToday = Math.abs(Date.parse(date) - Date.parse(utcToday())) <= 86400e3;
      const [f, a] = await settle(fd.matchesByDate(date, tz), afAll({ live: nearToday }));
      const afList = a ? a.all.filter((m) => localDate(m.kickoff, tz) === date).map(ns) : [];
      return merge(f, a, [...(f ? f.data : []), ...afList]);
    },

    async live() {
      const [f, a] = await settle(fd.live(), afAll({ live: true }));
      const afList = a ? a.all.filter((m) => m.state === 'live').map(ns) : [];
      return merge(f, a, [...(f ? f.data : []), ...afList]);
    },

    async match(id) {
      if (!isAf(id)) return fd.match(id);
      const rid = raw(id);
      const a = await afAll({ live: true });
      let base = a.all.find((m) => m.id === rid);
      if (!base) {
        const r = await c(`h:fx:${rid}`, 86400, async () => {
          const res = await afCall(`/fixtures?id=${rid}`, PRIORITY.normal);
          if (!res[0]) throw new ApiError(404, 'NOT_FOUND', 'Match not found.');
          return afDetail(res[0]);
        });
        return { ...r, data: ns(r.data) };
      }
      // Decide whether today's budget can pay for events / line-ups / stats.
      const k = Date.parse(base.kickoff), now = Date.now();
      let prio = null, ttl = 600;
      if (base.state === 'live') { prio = PRIORITY.normal; ttl = 600; }
      else if (base.state === 'post') { prio = PRIORITY.normal; ttl = 30 * 86400; }
      else if (base.state === 'pre' && k - now < 70 * 60e3) { prio = PRIORITY.extra; ttl = 1200; }
      let det = null, detMeta = {};
      if (prio) {
        try {
          const r = await c(`h:det:${rid}:${base.state}`, ttl, async () => {
            const res = await afCall(`/fixtures?id=${rid}`, prio);
            return res[0] ? afDetail(res[0]) : null;
          });
          det = r.data; detMeta = r;
        } catch (e) { warnings.push(e.message); }
      }
      const out = det
        ? { ...base, ...det, state: base.state === 'post' ? 'post' : det.state, score: det.score || base.score }
        : { ...base, events: null, lineups: null, stats: null, capabilities: { events: false, lineups: base.state === 'pre', stats: false, h2h: true },
            notes: base.state === 'pre' ? [] : ['Match details for this league are limited on the free data plan right now. The score and status still update.'] };
      return { data: ns(out), fetchedAt: detMeta.fetchedAt || a.fetchedAt, stale: a.stale || !!detMeta.stale, warning: warnings[0] || null };
    },

    async h2h(id) {
      if (!isAf(id)) return fd.h2h(id);
      const rid = raw(id);
      const a = await afAll({ live: false });
      const m = a.all.find((x) => x.id === rid);
      if (!m) return { data: { summary: null, matches: [] }, fetchedAt: Date.now(), stale: false };
      const H = m.home.id, A = m.away.id;
      let list = a.all.filter((x) => x.state === 'post' && x.score && ((x.home.id === H && x.away.id === A) || (x.home.id === A && x.away.id === H)));
      try {
        const r = await c(`h:h2h:${Math.min(H, A)}-${Math.max(H, A)}`, 7 * 86400, async () =>
          (await afCall(`/fixtures/headtohead?h2h=${H}-${A}&last=10`, PRIORITY.extra)).map(afMatch));
        const seen = new Set(list.map((x) => x.id));
        list = list.concat(r.data.filter((x) => x.state === 'post' && !seen.has(x.id)));
      } catch { /* season-only head-to-head is fine */ }
      list.sort((x, y) => y.kickoff.localeCompare(x.kickoff));
      list = list.slice(0, 10);
      const s = { played: list.length, home: { id: nsId(H), name: m.home.name, wins: 0 }, away: { id: nsId(A), name: m.away.name, wins: 0 }, draws: 0 };
      for (const x of list) {
        const w = x.winner === 'home' ? x.home.id : x.winner === 'away' ? x.away.id : null;
        if (w === H) s.home.wins++; else if (w === A) s.away.wins++; else s.draws++;
      }
      return { data: { summary: list.length ? s : null, matches: list.map(ns) }, fetchedAt: a.fetchedAt, stale: a.stale };
    },

    async competitions() {
      const base = catalogueFor('football-data');
      const out = [];
      for (const [i, cat] of CATALOGUE.entries()) {
        const fdEntry = base[i];
        if (fdEntry.covered) { out.push(fdEntry); continue; }
        if (cat.af && LEAGUES.includes(cat.af) && env.API_FOOTBALL_KEY) {
          const denied = await isDenied(cat.af);
          out.push({ ...fdEntry, id: denied ? null : nsId(cat.af), covered: !denied, logo: `https://media.api-sports.io/football/leagues/${cat.af}.png` });
        } else out.push(fdEntry);
      }
      return { data: out, fetchedAt: Date.now(), stale: false, cache: 'static' };
    },

    async competition(id) {
      if (!isAf(id)) return fd.competition(id);
      return standings(raw(id));
    },

    async competitionMatches(id) {
      if (!isAf(id)) return fd.competitionMatches(id);
      const L = raw(id);
      const a = await afAll({ live: true });
      const from = Date.now() - 10 * 86400e3, to = Date.now() + 14 * 86400e3;
      const list = a.all.filter((m) => m.comp.id === L && Date.parse(m.kickoff) >= from && Date.parse(m.kickoff) <= to)
        .sort((x, y) => x.kickoff.localeCompare(y.kickoff)).map(ns);
      return { data: list, fetchedAt: a.fetchedAt, stale: a.stale, warning: warnings[0] || null };
    },

    async bracket(id) {
      if (!isAf(id)) return fd.bracket(id);
      const L = raw(id);
      const a = await afAll({ live: true });
      return { data: a.all.filter((m) => m.comp.id === L).map(ns), fetchedAt: a.fetchedAt, stale: a.stale };
    },

    async scorers(id) {
      if (!isAf(id)) return fd.scorers(id);
      const L = raw(id);
      const li = await leagueInfo(L);
      return c(`h:scor:${L}:${li.season}`, 24 * 3600, async () =>
        (await afCall(`/players/topscorers?league=${L}&season=${li.season}`, PRIORITY.extra)).slice(0, 20).map((p, i) => {
          const s = (p.statistics || [])[0] || {};
          return {
            rank: i + 1,
            player: { id: p.player?.id, name: p.player?.name, nationality: p.player?.nationality || null, photo: null },
            team: { ...afTeam(s.team), id: nsId(s.team?.id) }, goals: num(s.goals?.total), assists: num(s.goals?.assists), penalties: num(s.penalty?.scored), played: num(s.games?.appearences),
          };
        }));
    },

    async team(id) {
      if (!isAf(id)) return fd.team(id);
      const rid = raw(id);
      const a = await afAll({ live: false });
      const games = a.all.filter((m) => m.home.id === rid || m.away.id === rid).sort((x, y) => x.kickoff.localeCompare(y.kickoff));
      const any = games[0];
      const fromGames = any ? (any.home.id === rid ? any.home : any.away) : null;
      let info = null, squad = [];
      try {
        info = (await c(`h:team:${rid}`, 7 * 86400, async () => {
          const t = (await afCall(`/teams?id=${rid}`, PRIORITY.extra))[0];
          if (!t) throw new ApiError(404, 'NOT_FOUND', 'Team not found.');
          return { name: t.team.name, short: t.team.code || t.team.name, logo: t.team.logo, country: t.team.country || null, founded: t.team.founded || null, venue: t.venue?.name ? t.venue.name + (t.venue.city ? ', ' + t.venue.city : '') : null };
        })).data;
      } catch { /* fall back to what the fixtures tell us */ }
      try {
        squad = (await c(`h:squad:${rid}`, 7 * 86400, async () =>
          (((await afCall(`/players/squads?team=${rid}`, PRIORITY.extra))[0] || {}).players || [])
            .map((p) => ({ id: p.id, name: p.name, pos: p.position || null, number: p.number ?? null, age: p.age ?? null, nationality: null })))).data;
      } catch { /* squad optional */ }
      if (!info && !fromGames) throw new ApiError(404, 'NOT_FOUND', 'Team not found.');
      const t = info || { name: fromGames.name, short: fromGames.short, logo: fromGames.logo, country: null, founded: null, venue: null };
      const comp = any ? { id: nsId(any.comp.id), name: any.comp.name, logo: any.comp.logo } : null;
      return {
        data: {
          id: nsId(rid), ...t, coach: null, website: null, competitions: comp ? [comp] : [], squad,
          recent: games.filter((m) => m.state === 'post').slice(-6).reverse().map(ns),
          upcoming: games.filter((m) => m.state !== 'post').slice(0, 6).map(ns),
        },
        fetchedAt: a.fetchedAt, stale: a.stale,
      };
    },

    async search(q) {
      const ql = q.toLowerCase();
      const [f, a] = await settle(fd.search(q), afAll({ live: false }));
      const comps = (await this.competitions()).data.filter((x) => x.covered && (x.name.toLowerCase().includes(ql) || x.country.toLowerCase().includes(ql)));
      const teams = new Map((f ? f.data.teams : []).map((t) => [String(t.id), t]));
      if (a) {
        for (const m of a.all) for (const t of [m.home, m.away]) {
          if (t.id && (t.name.toLowerCase().includes(ql))) teams.set('a' + t.id, { ...t, id: nsId(t.id), country: m.comp.country || null });
        }
      }
      return { data: { competitions: comps, teams: [...teams.values()].slice(0, 25), partial: !!(f && f.data.partial) }, fetchedAt: Date.now(), stale: false };
    },
  };
}
