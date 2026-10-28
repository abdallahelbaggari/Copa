// /predict — Copa Predictor (free points, no Pi stakes).
//   POST { accessToken, action: 'save', matchId, home, away }
//   POST { accessToken, action: 'mine' }
//   GET  ?board=week|season   (public leaderboard)
import { reply, options, readBody, log } from '../server/pi.js';
import { verifyPiUser, savePick, myPicks, leaderboard } from '../server/predict.js';

// Predictions must live in shared storage. Without the COPA_CACHE binding, say so instead of losing picks.
const ready = (env) => !!(env.COPA_CACHE || env.PREDICT_MEMORY === '1');
const SOON = 'The Predictor is opening soon. Please check back shortly.';

export async function onRequestPost(context) {
  if (!ready(context.env)) return reply({ ok: false, error: SOON, soon: true });
  const body = await readBody(context.request);
  const user = await verifyPiUser(body.accessToken);
  if (!user) return reply({ ok: false, error: 'Please sign in with Pi again', auth: false });
  const ctx = { request: context.request, env: context.env, waitUntil: context.waitUntil ? context.waitUntil.bind(context) : undefined };
  try {
    if (body.action === 'save') { const r = await savePick(ctx, user, body); log(r.ok ? 'predict:save' : 'predict:refused', { user: user.uid, match: body.matchId, error: r.error }); return reply(r); }
    if (body.action === 'mine') return reply(await myPicks(ctx, user));
    return reply({ ok: false, error: 'Unknown action' });
  } catch (e) {
    log('predict:error', { message: String(e && e.message) });
    return reply({ ok: false, error: 'Predictions are unavailable right now' });
  }
}

export async function onRequestGet(context) {
  if (!ready(context.env)) return reply({ ok: false, error: SOON, soon: true });
  const board = new URL(context.request.url).searchParams.get('board');
  // Public leaderboard: hide Pi uids, mark nothing personal.
  const r = await leaderboard(context.env, board);
  r.rows = r.rows.map(({ me, ...rest }) => rest);
  return reply(r);
}
export const onRequestOptions = () => options();
