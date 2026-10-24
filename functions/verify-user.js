// POST /verify-user  { accessToken }  — confirms a Pi login with Pi's servers (GET /v2/me).
// The browser's username alone can be faked; this proves the sign-in is real.
import { log, reply, options, readBody, health } from '../server/pi.js';

export async function onRequestPost(context) {
  const { accessToken } = await readBody(context.request);
  if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 2000) {
    log('login:bad-token');
    return reply({ ok: false, error: 'Missing access token' });
  }
  let res, me = {};
  try {
    res = await fetch('https://api.minepi.com/v2/me', { headers: { Authorization: `Bearer ${accessToken}` } });
    me = await res.json().catch(() => ({}));
  } catch {
    log('login:pi-unreachable');
    return reply({ ok: false, error: 'Could not reach Pi' });
  }
  if (!res.ok || !me.uid) { log('login:rejected', { status: res.status }); return reply({ ok: false, error: 'Pi did not confirm this login' }); }
  log('login:ok', { user: me.uid, username: me.username || null });
  return reply({ ok: true, uid: me.uid, username: me.username || null });
}

export const onRequestGet = (context) => health('verify-user', context.env);
export const onRequestOptions = () => options();
