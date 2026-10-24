// GET /validation-key.txt — Pi Developer Portal domain check.
// Easiest setup: paste the key from develop.pi into Cloudflare as the variable PI_VALIDATION_KEY.
// If that variable is not set, a validation-key.txt file in the repo is served instead.
export async function onRequestGet(context) {
  const key = (context.env.PI_VALIDATION_KEY || '').trim();
  if (!key) return context.next();
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
