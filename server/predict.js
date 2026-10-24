// Copa Predictor — free score predictions. No Pi is ever staked: points only.
// Users are identified by a Pi access token verified with Pi's servers (/v2/me).
// Storage: Cloudflare KV (binding COPA_CACHE). Keys:
//   u:<uid>              → { n: username, picks: { [matchId]: pick }, t: totals }
//   lb:w:<isoWeek>       → { [uid]: { n, p, e, c } }   weekly leaderboard
//   lb:s:<season>        → { [uid]: { n, p, e, c } }   season leaderboard
// Scoring: exact score 3 pts, correct result (win/draw/loss) 1 pt. Score after extra time; penalties don't count.
import { getProvider } from './router.js';

export const POINTS = { exact: 3, result: 1 };
const MAX_OPEN = 60;          // unsettled picks per user
const LOCK_MS = 60e3;         // picks lock 1 minute before kick-off
const SETTLE_PER_CALL = 12;
const memKV = new Map();      // dev / no-KV fallback (per instance only)

const kv = (env) => env.COPA_CACHE || null;
async function kget(env, k) {
  const s = kv(env);
  if (s) { try { return await s.get(k, 'json'); } catch { return null; } }
  return memKV.has(k) ? JSON.parse(memKV.get(k)) : null;
}
async function kput(env, k, v, ttl) {
  const s = kv(env), str = JSON.stringify(v);
  if (s) { await s.put(k, str, ttl ? { expirationTtl: ttl } : undefined); return; }
  memKV.set(k, str);
}

export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
export function seasonOf(d = new Date()) { const y = d.getUTCFullYear(); return d.getUTCMonth() >= 6 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; }

const tokenCache = new Map();
export async function verifyPiUser(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 2000) return null;
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  let res, me;
  try { res = await fetch('https://api.minepi.com/v2/me', { headers: { Authorization: `Bearer ${token}` } }); me = await res.json(); } catch { return null; }
  if (!res.ok || !me || !me.uid) return null;
  const user = { uid: String(me.uid), username: String(me.username || 'Pioneer').slice(0, 40) };
  tokenCache.set(token, { user, exp: Date.now() + 10 * 60e3 });
  if (tokenCache.size > 500) tokenCache.delete(tokenCache.keys().next().value);
  return user;
}

export function score(pick, final) {
  if (!final || final.home == null) return null;
  if (pick.h === final.home && pick.a === final.away) return { pts: POINTS.exact, exact: true };
  const sign = (x, y) => Math.sign(x - y);
  return sign(pick.h, pick.a) === sign(final.home, final.away) ? { pts: POINTS.result, exact: false } : { pts: 0, exact: false };
}

async function getMatch(ctx, id) {
  const p = getProvider(ctx);
  if (!p) throw new Error('NO_PROVIDER');
  return (await p.match(id)).data;
}

async function bump(env, key, user, pts, exact, ttl) {
  const board = (await kget(env, key)) || {};
  const r = board[user.uid] || { n: user.username, p: 0, e: 0, c: 0 };
  r.n = user.username; r.p += pts; r.e += exact ? 1 : 0; r.c += 1;
  board[user.uid] = r;
  await kput(env, key, board, ttl);
}

export async function savePick(ctx, user, body) {
  const matchId = String(body.matchId || '');
  const h = Number(body.home), a = Number(body.away);
  if (!/^a?\d{1,10}$/.test(matchId)) return { ok: false, error: 'Unknown match' };
  if (![h, a].every((x) => Number.isInteger(x) && x >= 0 && x <= 20)) return { ok: false, error: 'Scores must be whole numbers from 0 to 20' };
  let m;
  try { m = await getMatch(ctx, matchId); } catch { return { ok: false, error: 'Could not load this match right now' }; }
  if (!m || m.state !== 'pre' || Date.parse(m.kickoff) - Date.now() < LOCK_MS) return { ok: false, error: 'Predictions are closed for this match' };
  const u = (await kget(ctx.env, 'u:' + user.uid)) || { n: user.username, picks: {}, t: { p: 0, e: 0, c: 0 } };
  u.n = user.username;
  const open = Object.values(u.picks).filter((x) => !x.done).length;
  if (!u.picks[matchId] && open >= MAX_OPEN) return { ok: false, error: `You can have up to ${MAX_OPEN} open predictions` };
  u.picks[matchId] = { h, a, ko: m.kickoff, at: Date.now(), comp: m.comp?.name || '', home: m.home?.name || '', away: m.away?.name || '', done: false };
  prune(u);
  await kput(ctx.env, 'u:' + user.uid, u);
  return { ok: true, pick: { matchId, ...u.picks[matchId] } };
}

function prune(u) {
  const cutoff = Date.now() - 45 * 864e5;
  for (const [id, p] of Object.entries(u.picks)) if (p.done && Date.parse(p.ko) < cutoff) delete u.picks[id];
}

export async function myPicks(ctx, user) {
  const env = ctx.env;
  const u = (await kget(env, 'u:' + user.uid)) || { n: user.username, picks: {}, t: { p: 0, e: 0, c: 0 } };
  let changed = false, n = 0;
  const due = Object.entries(u.picks).filter(([, p]) => !p.done && Date.parse(p.ko) < Date.now() - 105 * 60e3).sort((x, y) => x[1].ko.localeCompare(y[1].ko));
  for (const [id, p] of due) {
    if (n++ >= SETTLE_PER_CALL) break;
    let m; try { m = await getMatch(ctx, id); } catch { continue; }
    if (!m) continue;
    const old = Date.now() - Date.parse(p.ko) > 14 * 864e5;
    if (m.state === 'off' && (/CANC|ABD|ABAN|AWD|WO/i.test(String(m.status)) || old)) { p.done = true; p.void = true; changed = true; continue; }
    if (m.state !== 'post') continue;
    const r = score(p, m.score);
    if (!r) continue;
    p.done = true; p.pts = r.pts; p.exact = r.exact; p.final = m.score; changed = true;
    u.t.p += r.pts; u.t.e += r.exact ? 1 : 0; u.t.c += 1;
    const ko = new Date(p.ko);
    await bump(env, 'lb:w:' + isoWeek(ko), user, r.pts, r.exact, 70 * 864e5);
    await bump(env, 'lb:s:' + seasonOf(ko), user, r.pts, r.exact, 400 * 864e5);
  }
  if (changed) { prune(u); await kput(env, 'u:' + user.uid, u); }
  const picks = Object.entries(u.picks).map(([matchId, p]) => ({ matchId, ...p })).sort((x, y) => y.ko.localeCompare(x.ko));
  return { ok: true, user: { username: user.username }, totals: u.t, picks };
}

export async function leaderboard(env, period) {
  const key = period === 'season' ? 'lb:s:' + seasonOf() : 'lb:w:' + isoWeek();
  const board = (await kget(env, key)) || {};
  const rows = Object.entries(board).map(([uid, r]) => ({ uid, name: r.n, points: r.p, exact: r.e, played: r.c }))
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.played - b.played || a.name.localeCompare(b.name))
    .slice(0, 100).map((r, i) => ({ rank: i + 1, name: r.name, points: r.points, exact: r.exact, played: r.played, me: r.uid }));

  return { ok: true, period: period === 'season' ? 'season' : 'week', label: period === 'season' ? 'Season ' + seasonOf() : 'Week ' + isoWeek().split('-W')[1], rows, shared: !!kv(env) };
}
