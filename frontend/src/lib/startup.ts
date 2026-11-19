import markup from '@/boot/splash.html?raw';
import { resolveSurface } from '@/lib/host';

/*
 * Loading splash guard. The splash (src/boot/splash.html, put into index.html at build) must show on
 * every start of the software. If it was deleted, edited or hidden with CSS, it is put back from the
 * copy inside the app bundle; if that copy was edited too, a built-in one is drawn instead. While
 * it shows, removing it or changing its style puts it straight back.
 */

const ID = 'dd-splash';
const MIN_MS = 2200;
// The text the splash must carry (built from codes so it never appears as one word in the bundle).
const SIG = String.fromCharCode(78, 105, 116, 101, 115, 104, 100, 101, 118);
const LOCK: Record<string, string> = {
  display: 'flex',
  visibility: 'visible',
  opacity: '1',
  position: 'fixed',
  inset: '0',
  'z-index': '2147483647',
  transform: 'none',
  'clip-path': 'none',
  filter: 'none',
};

function isAppHost(): boolean {
  // The software itself (platform host, IP), never a business website (subdomain, own domain or /s/<slug>).
  return resolveSurface().kind === 'platform';
}

function carriesSig(el: Element): boolean {
  return (el.textContent ?? '').replace(/\s+/g, '').includes(SIG);
}

function visible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.95) return false;
  const r = el.getBoundingClientRect();
  return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
}

function fromBundle(): HTMLElement | null {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.replace(/<script[\s\S]*?<\/script>/gi, '');
  const el = tpl.content.querySelector<HTMLElement>(`#${ID}`);
  if (!el || !carriesSig(el)) return null;
  tpl.content.querySelectorAll('style').forEach((s) => document.head.appendChild(s));
  return el;
}

function builtIn(): HTMLElement {
  const el = document.createElement('div');
  el.id = ID;
  el.style.cssText =
    'align-items:center;justify-content:center;flex-direction:column;background:#14110F;color:#fff;font:800 clamp(38px,9vw,64px)/1 system-ui,sans-serif';
  const name = document.createElement('div');
  name.textContent = `${SIG.slice(0, 6)} ${SIG.slice(6)}`;
  name.style.cssText =
    'background:linear-gradient(135deg,#ffd166,#ff8a3d 50%,#ff3d7f);-webkit-background-clip:text;background-clip:text;color:transparent';
  el.appendChild(name);
  return el;
}

function addSparks(el: HTMLElement) {
  if (el.querySelector('.dd-dot')) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.className = 'dd-dot';
    p.style.cssText = `left:${Math.random() * 100}%;bottom:${Math.random() * 20 - 5}%;animation-delay:${Math.random() * 6}s;animation-duration:${4 + Math.random() * 4}s;background:${['#ff8a3d', '#ff3d7f', '#ffd166'][i % 3]}`;
    el.appendChild(p);
  }
}

function lock(el: HTMLElement) {
  for (const [k, v] of Object.entries(LOCK)) {
    if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') el.style.setProperty(k, v, 'important');
  }
  if (el.hidden) el.hidden = false;
  el.classList.remove('dd-out');
}

export function startup() {
  if (!isAppHost() || document.getElementById('prerender') || window.__ddSsr) {
    document.getElementById(ID)?.remove();
    return;
  }
  const started = (window as { __ddSplashAt?: number }).__ddSplashAt ?? Date.now();

  let el = document.getElementById(ID);
  if (!el || !carriesSig(el)) {
    el?.remove();
    el = fromBundle() ?? builtIn();
  }
  const splash = el;
  const mount = () => {
    if (!splash.isConnected || splash.parentNode !== document.body) document.body.appendChild(splash);
    lock(splash);
  };
  mount();
  addSparks(splash);
  // Hidden by an outside style sheet even with the inline lock: draw the built-in one.
  if (!visible(splash) || !carriesSig(splash)) {
    splash.replaceChildren(...builtIn().childNodes);
    splash.removeAttribute('class');
    mount();
  }

  let done = false;
  const watch = new MutationObserver(() => {
    if (done) return;
    if (!splash.isConnected || !carriesSig(splash)) {
      if (!carriesSig(splash)) splash.replaceChildren(...builtIn().childNodes);
      mount();
    } else lock(splash);
  });
  watch.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['style', 'class', 'hidden', 'id'] });

  setTimeout(() => {
    done = true;
    watch.disconnect();
    splash.style.setProperty('transition', 'opacity .6s ease, visibility .6s ease', 'important');
    splash.style.setProperty('opacity', '0', 'important');
    splash.style.setProperty('visibility', 'hidden', 'important');
    splash.classList.add('dd-out');
    setTimeout(() => splash.remove(), 700);
  }, Math.max(0, MIN_MS - (Date.now() - started)));
}
