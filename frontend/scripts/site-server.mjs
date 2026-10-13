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

const template = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const { renderSite, SSR_PATHS } = await import(pathToFileURL(path.join(root, 'dist-site-ssr', 'prerender-site.js')).href);
const cache = new Map();

// A theme's CSS (its fonts), from the build manifest, linked in the first HTML so text doesn't
// change font (and move) when the app loads the theme.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', '.vite', 'manifest.json'), 'utf8'));
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
          if (res.statusCode !== 200) return resolve(null);
          try {
            resolve(JSON.parse(body).data);
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

async function page(host, pathname) {
  const key = `${host}${pathname}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;

  const site = await get(host, '/site');
  // Unknown business, unpublished site: the app shows the right screen itself.
  if (!site || !site.is_live) return null;
  const [menu, gallery, hotel] = await Promise.all([
    site.has_menu ? get(host, '/site/menu') : null,
    site.has_gallery ? get(host, '/site/gallery') : null,
    site.hotel?.has_rooms ? get(host, '/site/hotel') : null,
  ]);
  const data = { site, menu, gallery, hotel };
  const { html, head } = await renderSite(pathname, data);

  let doc = template;
  if (head) {
    doc = doc.replace(/<title>[\s\S]*?<\/title>/, head.title || `<title>${esc(site.name)}</title>`);
    // The page's own description replaces the generic one.
    if (/name="description"/.test(head.tags)) doc = doc.replace(/<meta name="description" content="[^"]*" \/>\s*/, '');
    doc = doc.replace('</head>', `    ${head.tags}\n  </head>`);
  }
  const links = themeCss(site.theme?.key).map((href) => `<link rel="stylesheet" href="${esc(href)}" />`);
  doc = doc
    // data-ssr: content shows at once (no fade-in waiting for the app).
    .replace(/<html([^>]*)>/, '<html$1 data-ssr>')
    .replace('</head>', `    ${links.join('\n    ')}\n  </head>`)
    .replace('<head>', `<head>\n    <script>window.__ddSsr=${json(data)}</script>`)
    .replace('<div id="root"></div>', `<div id="prerender">${html}</div><div id="root"></div>`);

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), body: doc });
  return doc;
}

http
  .createServer(async (req, res) => {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    let body = null;
    if ((req.method === 'GET' || req.method === 'HEAD') && SSR_PATHS.includes(pathname) && host) {
      try {
        body = await page(host, pathname);
      } catch (e) {
        console.warn(`ssr: ${host}${pathname} → plain page (${e.message})`);
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-SSR': body ? 'hit' : 'off' });
    res.end(req.method === 'HEAD' ? undefined : (body ?? template));
  })
  .listen(PORT, '127.0.0.1', () => console.log(`site SSR on 127.0.0.1:${PORT} (API ${API})`));
