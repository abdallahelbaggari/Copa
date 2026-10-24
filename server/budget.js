// Daily request budget for quota-limited providers (API-Football free plan = 100 requests/day,
// resetting at 00:00 UTC). Shared across Cloudflare instances through KV (binding COPA_CACHE);
// without KV it falls back to a per-instance counter, which is less exact — bind KV in production.
//
// Each call declares a priority. Essential data keeps working until the hard limit;
// nice-to-have extras (line-ups, squads, head-to-head) stop earlier so live scores never run dry.
const mem = { day: '', used: 0 };

export const PRIORITY = { essential: 1, normal: 2, extra: 3 };

function limits(env) {
  const hard = Math.max(10, Math.min(Number(env.AF_DAILY_LIMIT) || 95, 100)); // keep a small safety margin under 100
  return { [PRIORITY.essential]: hard, [PRIORITY.normal]: Math.round(hard * 0.8), [PRIORITY.extra]: Math.round(hard * 0.6) };
}

const today = () => new Date().toISOString().slice(0, 10);

export async function budgetUsed(ctx) {
  const env = ctx.env || {}, day = today();
  if (env.COPA_CACHE) {
    try { return Number(await env.COPA_CACHE.get('budget:af:' + day)) || 0; } catch { /* fall through */ }
  }
  if (mem.day !== day) { mem.day = day; mem.used = 0; }
  return mem.used;
}

// Returns true and records the call if the budget allows it.
export async function take(ctx, priority = PRIORITY.normal) {
  const env = ctx.env || {}, day = today();
  const used = await budgetUsed(ctx);
  if (used >= limits(env)[priority]) return false;
  if (mem.day !== day) { mem.day = day; mem.used = 0; }
  mem.used = Math.max(mem.used, used) + 1;
  if (env.COPA_CACHE) {
    const p = env.COPA_CACHE.put('budget:af:' + day, String(used + 1), { expirationTtl: 2 * 86400 }).catch(() => {});
    if (ctx.waitUntil) ctx.waitUntil(p);
  }
  return true;
}

export async function budgetInfo(ctx) {
  const used = await budgetUsed(ctx);
  return { used, limit: limits(ctx.env || {})[PRIORITY.essential], shared: !!(ctx.env && ctx.env.COPA_CACHE) };
}
