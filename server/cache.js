// Layered cache: per-isolate memory (always) + optional Cloudflare KV (binding COPA_CACHE)
// for slow-changing data. Concurrent requests for the same key share one upstream call.
// If the upstream fails or is rate-limited, the last good copy is served and flagged stale —
// the app never invents data to fill a gap.

const mem = new Map();
const inflight = new Map();
const MEM_MAX = 400;
const KV_MIN_TTL = 600; // KV free tier has a small daily write budget; only persist slow data

function remember(key, entry) {
  mem.set(key, entry);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
}

// ttlSec may be a number or a function of the loaded data (e.g. finished matches cache longer).
// opts.persist: always store in KV (used for quota-limited sources so every Cloudflare instance shares one copy).
export async function cached(ctx, key, ttlSec, loader, staleMaxSec = 3 * 86400, opts = {}) {
  const env = ctx.env || {};
  const now = Date.now();
  let entry = mem.get(key);

  if (!entry && env.COPA_CACHE) {
    try {
      const v = await env.COPA_CACHE.get('c:' + key, 'json');
      if (v) { entry = v; remember(key, v); }
    } catch { /* KV optional */ }
  }

  const ttlOf = (d) => (typeof ttlSec === 'function' ? ttlSec(d) : ttlSec);
  if (entry && now - entry.t < ttlOf(entry.d) * 1000) {
    return { data: entry.d, fetchedAt: entry.t, stale: false, cache: 'hit' };
  }

  if (!inflight.has(key)) {
    const p = (async () => {
      const d = await loader();
      const e = { t: Date.now(), d };
      remember(key, e);
      if (env.COPA_CACHE && (opts.persist || ttlOf(d) >= KV_MIN_TTL)) {
        const put = env.COPA_CACHE.put('c:' + key, JSON.stringify(e), { expirationTtl: Math.max(staleMaxSec, 3600) }).catch(() => {});
        if (ctx.waitUntil) ctx.waitUntil(put);
      }
      return e;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }

  try {
    const e = await inflight.get(key) || mem.get(key);
    return { data: e.d, fetchedAt: e.t, stale: false, cache: 'miss' };
  } catch (err) {
    if (entry && now - entry.t < staleMaxSec * 1000 && err.code !== 'NOT_FOUND') {
      return { data: entry.d, fetchedAt: entry.t, stale: true, cache: 'stale', warning: err.message };
    }
    throw err;
  }
}

// Simple per-isolate cooldown after a 429 so we stop hammering the provider.
let cooldownUntil = 0;
export const inCooldown = () => Date.now() < cooldownUntil;
export const startCooldown = (sec) => { cooldownUntil = Date.now() + Math.min(Math.max(sec, 10), 120) * 1000; };
