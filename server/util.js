// Shared helpers for the Copa data layer (runs on Cloudflare Pages Functions).

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

// Upstream fetch with timeout. Never logs or returns the API key.
export async function fetchJson(url, headers = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(504, 'UPSTREAM_UNREACHABLE', 'The football data provider did not respond in time.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') || res.headers.get('X-RequestCounter-Reset') || 60);
    throw new ApiError(503, 'RATE_LIMITED', 'Data provider rate limit reached. Showing the latest saved data.', { retryAfter: retry });
  }
  if (res.status === 404) throw new ApiError(404, 'NOT_FOUND', 'Not found at the data provider.');
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(502, 'UPSTREAM_DENIED', 'The data provider refused this request (plan or key does not allow it).');
  }
  if (!res.ok) throw new ApiError(502, 'UPSTREAM_ERROR', `Data provider error (${res.status}).`);
  try {
    return { json: await res.json(), headers: res.headers };
  } catch {
    throw new ApiError(502, 'UPSTREAM_BAD_JSON', 'The data provider sent an unreadable response.');
  }
}

export const isId = (s) => /^a?\d{1,10}$/.test(String(s)); // 'a' prefix = API-Football id in hybrid mode
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s + 'T00:00:00Z'));

export function validTz(tz) {
  if (!tz || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const utcToday = () => new Date().toISOString().slice(0, 10);

const fmtCache = new Map();
export function localDate(iso, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f.format(new Date(iso));
}

// Integer or null — keeps "unavailable" (null) distinct from a genuine 0.
export const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
