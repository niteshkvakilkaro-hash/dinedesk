// Pre-renders DineDesk's own marketing pages after `vite build`.
//
//   npm run build         (runs this at the end)
//
// Writes dist/_marketing/<page>/index.html: the normal index.html with the page's HTML in a
// #prerender block and its title, description, canonical, Open Graph and JSON-LD in <head>.
// The web server serves these files on the platform domain only (docs/DEPLOYMENT.md);
// business websites keep using dist/index.html.
//
// Plans are filled in when PRERENDER_API_URL (e.g. https://api.example.in/api/v1) answers;
// otherwise the pricing cards load in the browser as usual.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const { render, MARKETING_PAGES } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'prerender.js')).href);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON inside <script>: stop "</script>" from closing the tag early.
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

let plans;
if (process.env.PRERENDER_API_URL) {
  try {
    const res = await fetch(`${process.env.PRERENDER_API_URL.replace(/\/$/, '')}/plans`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    plans = { plans: body.data, trial: body.meta.trial };
  } catch (e) {
    console.warn(`prerender: plans not loaded (${e.message}); the pricing cards will load in the browser.`);
  }
}

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const out = path.join(dist, '_marketing');
fs.rmSync(out, { recursive: true, force: true });

for (const page of MARKETING_PAGES) {
  const { html, head, tags } = await render(page, plans);
  const headHtml = [
    ...tags.meta.filter(([, key]) => key !== 'description').map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}" />`),
    `<link rel="canonical" href="${esc(tags.canonical)}" />`,
    `<script type="application/ld+json" data-page="marketing">${ld(head.jsonLd)}</script>`,
  ].join('\n    ');
  const doc = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(head.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(head.description)}" />`)
    .replace('</head>', `    ${headHtml}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="prerender">${html}</div><div id="root"></div>`);
  if (!doc.includes('id="prerender"')) throw new Error('prerender: <div id="root"></div> not found in dist/index.html');
  const file = path.join(out, page === '/' ? '' : page, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc);
  console.log(`prerender: ${page} → ${path.relative(root, file)} (${Math.round(doc.length / 1024)} KB)`);
}
fs.rmSync(path.join(root, 'dist-ssr'), { recursive: true, force: true });
