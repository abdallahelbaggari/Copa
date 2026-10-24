// Copa API router. All football data reaches the browser through here, so provider
// keys stay server-side and the UI only ever sees the normalised Copa model.
import { ApiError, isId, isDate, validTz } from './util.js';
import { createFootballData } from './providers/footballData.js';
import { createApiFootball } from './providers/apiFootball.js';
import { createHybrid } from './providers/hybrid.js';
import { priorityOf } from './competitions.js';
import { buildBracket } from './bracket.js';
import { newsList, article, ATTRIBUTION as NEWS_ATTR } from './news.js';

export function getProvider(ctx) {
  if (ctx.env && !ctx.env.FOOTBALL_DATA_KEY && ctx.env.FD_API_KEY) ctx.env = Object.assign({}, ctx.env, { FOOTBALL_DATA_KEY: ctx.env.FD_API_KEY });
  return pickProvider(ctx);
}

function pickProvider(ctx) {
  const env = ctx.env || {};
  const want = (env.DATA_PROVIDER || '').toLowerCase();
  const fdKey = !!env.FOOTBALL_DATA_KEY, afKey = !!env.API_FOOTBALL_KEY;
  // Default when both free keys are set: hybrid (football-data for the big leagues, API-Football for Copa + NPFL).
  if ((want === 'hybrid' || !want) && fdKey && afKey) return createHybrid(ctx);
  if (want === 'api-football' && afKey) return createApiFootball(ctx);
  if ((want === 'football-data' || !want) && fdKey) return createFootballData(ctx);
  if (!want && afKey) return createApiFootball(ctx);
  return null;
}

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const sortMatches = (provider, list) =>
  [...list].sort((a, b) => priorityOf(provider, a.comp.id) - priorityOf(provider, b.comp.id) || a.kickoff.localeCompare(b.kickoff));

export async function handle(ctx) {
  const url = new URL(ctx.request.url);
  if (ctx.request.method !== 'GET') return json({ ok: false, error: { code: 'METHOD', message: 'GET only' } }, 405);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const q = url.searchParams;
  // Accept FD_API_KEY as another name for FOOTBALL_DATA_KEY.
  if (ctx.env && !ctx.env.FOOTBALL_DATA_KEY && ctx.env.FD_API_KEY) ctx.env = Object.assign({}, ctx.env, { FOOTBALL_DATA_KEY: ctx.env.FD_API_KEY });
  const p = pickProvider(ctx);

  if (parts[0] === 'status') {
    const extra = p && p.status ? await p.status().catch(() => null) : null;
    return json({ ok: true, data: p ? { configured: true, provider: p.name, label: p.label, attribution: p.attribution, capabilities: p.capabilities, ...(extra ? { freePlan: extra } : {}) } : { configured: false } }, 200, 60);
  }
  if (parts[0] === 'news' || parts[0] === 'article') {
    try {
      const r = parts[0] === 'news' ? await newsList(ctx) : await article(ctx, q.get('id'));
      return json({ ok: true, data: r.data, meta: { attribution: NEWS_ATTR, fetchedAt: r.fetchedAt, stale: !!r.stale } }, 200, r.stale ? 0 : 600);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      return json({ ok: false, error: { code: e.code || 'INTERNAL', message: e instanceof ApiError ? e.message : 'News is unavailable right now.' } }, status);
    }
  }
  if (!p) {
    return json({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'No football data provider key is set on the server yet.' } }, 503);
  }

  try {
    let r, maxAge = 15;
    const [a, b, c] = parts;
    if (a === 'matches') {
      const date = q.get('date');
      if (!isDate(date)) throw new ApiError(400, 'BAD_DATE', 'Use date=YYYY-MM-DD');
      r = await p.matchesByDate(date, validTz(q.get('tz')));
      r = { ...r, data: sortMatches(p.name, r.data) };
    } else if (a === 'live') {
      r = await p.live();
      r = { ...r, data: sortMatches(p.name, r.data) };
    } else if (a === 'match' && isId(b) && !c) {
      r = await p.match(b);
    } else if (a === 'match' && isId(b) && c === 'h2h') {
      r = await p.h2h(b); maxAge = 600;
    } else if (a === 'competitions' && !b) {
      r = await p.competitions(); maxAge = 3600;
    } else if (a === 'competition' && isId(b) && !c) {
      r = await p.competition(b); maxAge = 120;
    } else if (a === 'competition' && isId(b) && c === 'matches') {
      r = await p.competitionMatches(b); maxAge = 60;
    } else if (a === 'competition' && isId(b) && c === 'bracket') {
      const raw = await p.bracket(b); r = { ...raw, data: buildBracket(raw.data) }; maxAge = 120;
    } else if (a === 'competition' && isId(b) && c === 'scorers') {
      r = await p.scorers(b); maxAge = 600;
    } else if (a === 'team' && isId(b) && !c) {
      r = await p.team(b); maxAge = 120;
    } else if (a === 'search') {
      const term = (q.get('q') || '').trim().slice(0, 40);
      if (term.length < 2) throw new ApiError(400, 'SHORT_QUERY', 'Type at least 2 characters.');
      r = await p.search(term); maxAge = 300;
    } else {
      throw new ApiError(404, 'NO_ROUTE', 'Unknown endpoint.');
    }
    return json({
      ok: true,
      data: r.data,
      meta: { provider: p.name, attribution: p.attribution, fetchedAt: r.fetchedAt || Date.now(), stale: !!r.stale, warning: r.warning || null, delayed: !!p.capabilities.liveDelayed },
    }, 200, r.stale ? 0 : maxAge);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    const message = e instanceof ApiError ? e.message : 'Something went wrong on the server.';
    if (!(e instanceof ApiError)) console.error('Copa api error', e && e.stack);
    return json({ ok: false, error: { code, message } }, status);
  }
}
