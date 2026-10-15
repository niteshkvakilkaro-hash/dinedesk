// Server-side rendering for business websites.
//
//   SITE_SSR_API=http://127.0.0.1:8081/api/v1 node scripts/site-server.mjs     (after `npm run build`)
//
// Nginx sends page requests on business hosts here (docs/DEPLOYMENT.md). For the public pages in
// SSR_PATHS it loads the site's data from the API, renders the page with the same components the
// app uses, and returns dist/index.html with that HTML (in #prerender), its <head> tags and the
// data (window.__ddSsr, so the app starts without fetching again). Anything else — or any
// problem — gets the plain index.html, so the site always works.
//
// Each host + page is kept for SITE_SSR_TTL seconds (default 60), so an edit shows within a minute.
//
// For search engines every answer carries the right status: personal pages (checkout, order
// tracking, QR landings …) and unpublished or demo sites say noindex (meta tag + X-Robots-Tag),
// addresses the site doesn't have answer 404, and "/menu/" redirects to "/menu".
//
// SITE_SSR_ROOT (default: this frontend folder) is where dist/ and dist-site-ssr/ are read from.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const API = (process.env.SITE_SSR_API ?? '').replace(/\/$/, '');
const PORT = Number(process.env.SITE_SSR_PORT ?? 3005);
const TTL = Number(process.env.SITE_SSR_TTL ?? 60) * 1000;
const MAX_CACHE = 500;
if (!API) throw new Error('Set SITE_SSR_API, e.g. http://127.0.0.1:8081/api/v1');

const base = path.resolve(process.env.SITE_SSR_ROOT ?? root);
const template = fs.readFileSync(path.join(base, 'dist', 'index.html'), 'utf8');
const { renderSite, pageKind } = await import(pathToFileURL(path.join(base, 'dist-site-ssr', 'prerender-site.js')).href);
const cache = new Map();

// A theme's CSS (its fonts), from the build manifest, linked in the first HTML so text doesn't
// change font (and move) when the app loads the theme.
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'dist', '.vite', 'manifest.json'), 'utf8'));
function themeCss(key) {
  const seen = new Set();
  const css = new Set();
  const walk = (id) => {
    // The app's own CSS is already in index.html.
    if (seen.has(id) || !manifest[id] || manifest[id].isEntry) return;
    seen.add(id);
    (manifest[id].css ?? []).forEach((c) => css.add(`/${c}`));
    (manifest[id].imports ?? []).forEach(walk);
  };
  Object.keys(manifest)
    .filter((id) => id.startsWith(`src/themes/${key}/`))
    .forEach(walk);
  return [...css];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON inside <script>: stop "</script>" from closing the tag early.
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// The API is asked as the business's own host (Host and X-Tenant-Host): in production Nginx sets
// the tenant header from Host, so both must name the business. fetch() can't set Host; http can.
const api = new URL(API);
const client = api.protocol === 'https:' ? https : http;
function get(host, endpoint) {
  return new Promise((resolve, reject) => {
    const req = client.request(
      { hostname: api.hostname, port: api.port || undefined, path: `${api.pathname}${endpoint}`, headers: { Accept: 'application/json', Host: host, 'X-Tenant-Host': host }, timeout: 4000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve({ status: res.statusCode, data: null });
          try {
            resolve({ status: 200, data: JSON.parse(body).data });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('API timeout')));
    req.on('error', reject);
    req.end();
  });
}

// ?lang=ta (the address search engines list for each language): the page is rendered in that language.
const LANGS = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml', 'pa'];

// The business behind a host (404: no such business, or suspended). Kept like pages.
const sites = new Map();
async function siteFor(host) {
  const hit = sites.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.res;
  const res = await get(host, '/site');
  // Anything but "found" or "not found" (API down, 500 …) is an error: the caller serves the plain app.
  if (res.status !== 200 && res.status !== 404) throw new Error(`API answered ${res.status}`);
  if (sites.size >= MAX_CACHE) sites.delete(sites.keys().next().value);
  sites.set(host, { at: Date.now(), res });
  return res;
}

const data = async (host, endpoint) => (await get(host, endpoint)).data;

async function page(host, site, pathname, lang) {
  const key = `${host}${pathname}?${lang}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;

  const [menu, gallery, hotel, offers, tiffin] = await Promise.all([
    site.has_menu ? data(host, '/site/menu') : null,
    site.has_gallery ? data(host, '/site/gallery') : null,
    site.hotel?.has_rooms ? data(host, '/site/hotel') : null,
    pathname === '/offers' ? data(host, '/site/offers') : null,
    pathname === '/tiffin' ? data(host, '/site/tiffin/plans') : null,
  ]);
  const { html, head } = await renderSite(pathname, { site, menu, gallery, hotel, offers, tiffin }, lang);

  let doc = template;
  if (head) {
    doc = doc.replace(/<title>[\s\S]*?<\/title>/, head.title || `<title>${esc(site.name)}</title>`);
    // The page's own description, colour and icon replace DineDesk's generic ones.
    if (/name="description"/.test(head.tags)) doc = doc.replace(/<meta name="description" content="[^"]*" \/>\s*/, '');
    if (/name="theme-color"/.test(head.tags)) doc = doc.replace(/<meta name="theme-color" content="[^"]*" \/>\s*/, '');
    if (/rel="icon"/.test(head.tags)) doc = doc.replace(/<link rel="icon"[^>]*\/>\s*/, '');
    doc = doc.replace('</head>', `    ${head.tags}\n  </head>`);
    if (head.lang) doc = doc.replace(/<html([^>]*?)\s+lang="[^"]*"([^>]*)>/, `<html$1 lang="${esc(head.lang)}" dir="${esc(head.dir)}"$2>`);
  }
  const links = themeCss(site.theme?.key).map((href) => `<link rel="stylesheet" href="${esc(href)}" />`);
  doc = doc
    // data-ssr: content shows at once (no fade-in waiting for the app).
    .replace(/<html([^>]*)>/, '<html$1 data-ssr>')
    .replace('</head>', `    ${links.join('\n    ')}\n  </head>`)
    .replace('<head>', `<head>\n    <script>window.__ddSsr=${json({ site, menu, gallery, hotel })}</script>`)
    .replace('<div id="root"></div>', `<div id="prerender">${html}</div><div id="root"></div>`);

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), body: doc });
  return doc;
}

/** The plain app for a page that isn't server-rendered: the business's name as title, and noindex. */
function plain(name) {
  let doc = template.replace(/<meta name="description" content="[^"]*" \/>\s*/, '').replace('</head>', '    <meta name="robots" content="noindex, nofollow" />\n  </head>');
  if (name) doc = doc.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(name)}</title>`);
  return doc;
}

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow' };

/** → [status, extra headers, body, server-rendered?]. Throws when the API can't be asked (the caller serves the app). */
async function respond(host, pathname, lang) {
  const { status, data: site } = await siteFor(host);
  // No business at this address (or suspended): the app shows "not found".
  if (status === 404 || !site) return [404, NOINDEX, plain(null), false];
  // Not published yet: the app shows "coming soon".
  if (!site.is_live) return [200, NOINDEX, plain(site.name), false];
  const kind = pageKind(pathname, site);
  if (kind === 'missing') return [404, NOINDEX, plain(site.name), false];
  if (kind === 'private') return [200, NOINDEX, plain(site.name), false];
  return [200, site.seo?.indexable ? {} : NOINDEX, await page(host, site, pathname, lang), true];
}

http
  .createServer(async (req, res) => {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
    const { pathname, searchParams, search } = new URL(req.url ?? '/', 'http://x');
    const lang = LANGS.includes(searchParams.get('lang')) ? searchParams.get('lang') : 'en';
    const read = req.method === 'GET' || req.method === 'HEAD';
    // One address per page: "/menu/" → "/menu".
    if (read && pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname.replace(/\/+$/, '') || '/'}${search}`, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }
    let out = null;
    if (read && host) {
      try {
        out = await respond(host, pathname, lang);
      } catch (e) {
        console.warn(`ssr: ${host}${pathname} → plain page (${e.message})`);
      }
    }
    const [status, headers, body, rendered] = out ?? [200, {}, template, false];
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-SSR': rendered ? 'hit' : 'off', ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`site SSR on 127.0.0.1:${PORT} (API ${API})`));
