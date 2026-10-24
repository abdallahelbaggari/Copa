// Pi Network server helpers (MAINNET). Shared by /approve, /complete, /cancel-payment, /verify-user.
// PI_API_KEY comes from Cloudflare Pages → Settings → Environment variables (Secret).
// Every step writes one JSON log line tagged "COPA-PI" → view in Cloudflare → Functions → Real-time Logs.
// The API key is never logged or returned.

const PI_API = 'https://api.minepi.com/v2';

// Amounts the app offers. Approve refuses anything else, so a tampered client can't create odd payments.
export const ALLOWED_AMOUNTS = [0.5, 1, 5];

export function log(step, data = {}) {
  try { console.log(JSON.stringify({ tag: 'COPA-PI', step, at: new Date().toISOString(), ...data })); } catch {}
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Always HTTP 200 for payment endpoints: a non-200 makes the Pi Browser show "Payment Expired".
export function reply(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
}
export const options = () => new Response(null, { status: 204, headers: CORS });

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export const validPaymentId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(id);

export async function piFetch(env, path, method = 'GET', body) {
  if (!env.PI_API_KEY) return { ok: false, status: 0, data: { error: 'PI_API_KEY is not set in Cloudflare' } };
  let res, data;
  try {
    res = await fetch(PI_API + path, {
      method,
      headers: { Authorization: `Key ${env.PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Could not reach Pi API' } };
  }
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

export function health(name, env) {
  return reply({ ok: true, endpoint: name, network: 'mainnet', keyConfigured: !!env.PI_API_KEY });
}
