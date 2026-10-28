# Copa — Football. Live. Connected.

App name: **Copa** · Domain: **copa.pi** · Cloudflare Pages: **copa-pi.pages.dev** · Support: support.copa.pi@gmail.com

Cup-football Pi Network PWA on Cloudflare Pages: live scores, knockout brackets, tables,
match centre, the free **Copa Predictor** (points only, no Pi staked), football news, Pi sign-in and Pi support payments.

## Repo layout (Cloudflare build output directory: `.`)

```
index.html, sw.js, manifest.webmanifest, icons/     the app
privacy.html, terms.html                            redirect to the in-app pages
_routes.json   which paths run Functions            _headers / _redirects  security + hide source
functions/api/[[path]].js   every /api/* request (scores, brackets, news)
functions/predict.js        Copa Predictor (save, my picks, leaderboard)
functions/approve.js, complete.js, cancel-payment.js, verify-user.js   Pi endpoints
functions/launch-check.js   /launch-check readiness page
functions/validation-key.txt.js   serves PI_VALIDATION_KEY at /validation-key.txt
server/        data layer, brackets, news, predictor, Pi helpers (never served)
test/          local mock server (not used in production)
```

## Cloudflare settings (Settings → Variables and Secrets, Production)

| Name | What |
|---|---|
| `PI_API_KEY` (secret) | From develop.pi (mainnet app) |
| `PI_VALIDATION_KEY` | Domain validation key from develop.pi |
| `FD_API_KEY` (secret) | football-data.org free key |
| `API_FOOTBALL_KEY` (secret) | API-Football free key (mainnet only) |
| `AF_LEAGUES` (optional) | API-Football cups to use, default `12,13,20,6` (CAF CL, Libertadores, CAF Confed. Cup, AFCON) |
| `GUARDIAN_KEY` (secret) | Free key from open-platform.theguardian.com |

**Bindings → KV namespace:** variable name `COPA_CACHE` (create a KV namespace first). It is
required for the Predictor and shares the API-Football daily budget across Cloudflare instances.

After deploying, open **`/launch-check`**: every row should be green.

## Predictor rules (server/predict.js)
Exact score 3 pts, correct result 1 pt; score after extra time, shoot-outs don't count; picks lock
1 minute before kick-off; settled when the user next opens Predict. Weekly and season leaderboards.

## Local test
`MOCK=hy node test/serve.mjs 8789` then open http://localhost:8789 (mock data, fake Pi).
