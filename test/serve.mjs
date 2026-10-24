// TEST ONLY — local stand-in for Cloudflare Pages: serves /public and runs the real
// /api router with fetch() mocked to the fake upstream. Usage:
//   MOCK=fd node test/serve.mjs 8787     (football-data.org shapes)
//   MOCK=af node test/serve.mjs 8788     (API-Football shapes)
//   MOCK=none node test/serve.mjs 8789   (no key configured)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/router.js';
import { fdRoute, afRoute, guardianRoute, mockFinish } from './mock-upstream.js';
import * as approve from '../functions/approve.js';
import * as complete from '../functions/complete.js';
import * as cancel from '../functions/cancel-payment.js';
import * as verify from '../functions/verify-user.js';
import * as predict from '../functions/predict.js';
const PI_FNS = { '/approve': approve, '/complete': complete, '/cancel-payment': cancel, '/verify-user': verify, '/predict': predict };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = process.env.MOCK || 'fd';
const port = Number(process.argv[2] || 8787);
let upstreamCalls = 0, afCalls = [];

globalThis.fetch = async (url, init = {}) => {
  upstreamCalls++;
  const u = new URL(url);
  if (u.host === 'api.minepi.com') {
    // TEST ONLY fake Pi API
    const auth = (init.headers || {}).Authorization || '';
    let body = {};
    if (u.pathname === '/v2/me') body = auth === 'Bearer good-token-123' ? { uid: 'u-1', username: 'testpioneer' } : auth === 'Bearer good-token-456' ? { uid: 'u-2', username: 'goalmachine' } : { error: 'unauthorized' };
    else if (/\/v2\/payments\/[^/]+$/.test(u.pathname)) body = { identifier: u.pathname.split('/').pop(), amount: u.pathname.includes('bad') ? 99 : 1, metadata: { app: 'copa' }, user_uid: 'u-1' };
    else body = { identifier: u.pathname.split('/')[3], amount: 1, user_uid: 'u-1', status: { ok: true } };
    const ok = !(u.pathname === '/v2/me' && !/^Bearer good-token-(123|456)$/.test(auth));
    return new Response(JSON.stringify(body), { status: ok ? 200 : 401 });
  }
  if (u.host === 'content.guardianapis.com') { const b = guardianRoute(u.pathname + u.search); return new Response(JSON.stringify(b), { status: b.__status || 200 }); }
  if (u.host.includes('api-sports')) afCalls.push(u.pathname + u.search);
  const body = u.host.includes('football-data') ? fdRoute(u.pathname + u.search) : afRoute(u.pathname + u.search);
  const status = body.__status || 200;
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Requests-Available-Minute': '9' } });
};

const env0 = MOCK === 'fd' ? { FOOTBALL_DATA_KEY: 'test' } : MOCK === 'af' ? { API_FOOTBALL_KEY: 'test', AF_LEAGUES: '12,13' } : MOCK === 'hy' ? { FOOTBALL_DATA_KEY: 'test', API_FOOTBALL_KEY: 'test', AF_LEAGUES: '12,13', ...(process.env.AF_DAILY_LIMIT ? { AF_DAILY_LIMIT: process.env.AF_DAILY_LIMIT } : {}) } : {};
const env = { ...env0, PI_API_KEY: 'test-pi-key' };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/__calls') { res.end(String(upstreamCalls)); return; }
  if (url.pathname === '/__finish') { res.end(String(mockFinish(+url.searchParams.get('id'), +url.searchParams.get('h'), +url.searchParams.get('a')))); return; }
  if (url.pathname === '/__afcalls') { res.end(JSON.stringify(afCalls, null, 1)); return; }
  if (PI_FNS[url.pathname]) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const ctx = { request: new Request(url, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined, headers: { 'Content-Type': 'application/json' } }), env };
    const m = PI_FNS[url.pathname];
    const fn = req.method === 'POST' ? m.onRequestPost : req.method === 'OPTIONS' ? m.onRequestOptions : m.onRequestGet;
    const r = await fn(ctx);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text()); return;
  }
  if (url.pathname.startsWith('/api/')) {
    const r = await handle({ request: new Request(url, { method: req.method }), env, waitUntil() {} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
    return;
  }
  let f = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Copa.PI test server (${MOCK}) on ${port}`));
