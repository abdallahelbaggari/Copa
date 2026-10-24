// Football news from The Guardian Open Platform (free developer key, attribution required).
// Articles are shown inside Copa as clean text: no images, embeds, scripts or tracking.
import { cached } from './cache.js';
import { ApiError, fetchJson } from './util.js';

const API = 'https://content.guardianapis.com';
export const ATTRIBUTION = 'News from The Guardian (theguardian.com)';
const key = (env) => env.GUARDIAN_KEY || 'test';

export const validArticleId = (id) => typeof id === 'string' && id.length < 220 && /^football\/[a-z0-9\-\/]+$/.test(id) && !id.includes('..');

function clean(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|figure|aside|iframe|video|audio|figcaption|svg|noscript|form|button|gu-[a-z-]+)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(img|source|input|embed|hr)[^>]*>/gi, '');
  const ALLOW = new Set(['p', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'blockquote', 'ul', 'ol', 'li', 'br']);
  s = s.replace(/<\/?([a-z0-9-]+)[^>]*>/gi, (t, name) => {
    const n = name.toLowerCase();
    if (!ALLOW.has(n)) return '';
    return t.startsWith('</') ? `</${n}>` : n === 'br' ? '<br>' : `<${n}>`;
  });
  s = s.replace(/<p>\s*<\/p>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
const text = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export async function newsList(ctx) {
  return cached(ctx, 'news:list', 900, async () => {
    const { json } = await fetchJson(`${API}/search?section=football&order-by=newest&page-size=30&show-fields=trailText,byline,wordcount&api-key=${encodeURIComponent(key(ctx.env))}`);
    const res = json.response || {};
    if (res.status !== 'ok') throw new ApiError(502, 'NEWS_ERROR', 'The news source did not answer.');
    return (res.results || []).filter((r) => r.type === 'article' && validArticleId(r.id)).map((r) => ({
      id: r.id, title: r.webTitle, summary: text(r.fields?.trailText), byline: r.fields?.byline || null,
      minutes: r.fields?.wordcount ? Math.max(1, Math.round(Number(r.fields.wordcount) / 230)) : null,
      published: r.webPublicationDate, url: r.webUrl, section: r.sectionName,
    }));
  }, 2 * 86400, { persist: true });
}

export async function article(ctx, id) {
  if (!validArticleId(id)) throw new ApiError(400, 'BAD_ID', 'Unknown article.');
  return cached(ctx, 'news:a:' + id, 86400, async () => {
    const { json } = await fetchJson(`${API}/${id}?show-fields=body,byline,trailText,headline&api-key=${encodeURIComponent(key(ctx.env))}`);
    const c = json.response && json.response.content;
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'This article is no longer available.');
    return { id: c.id, title: c.fields?.headline || c.webTitle, summary: text(c.fields?.trailText), byline: c.fields?.byline || null,
      published: c.webPublicationDate, url: c.webUrl, body: clean(c.fields?.body) };
  }, 7 * 86400);
}
