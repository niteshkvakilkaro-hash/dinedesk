/**
 * The DineDesk Android app: one WebView app for guests and businesses. It opens the platform host at
 * /app and stays inside the platform domain and its business subdomains. It identifies itself with
 * the user-agent token "DineDeskApp/1"; in a desktop browser, ?app=1 (once per tab) does the same.
 *
 * Local development: on the PC, businesses are <slug>.localhost:5180; a phone on the same Wi-Fi
 * reaches the platform at <pc-ip>:5180 and a business at <slug>.<pc-ip>.nip.io:5180.
 */
import { PLATFORM_DOMAIN, platformUrl } from './host';

export const APP_UA_TOKEN = 'DineDeskApp';
const FLAG_KEY = 'dd_app';
const RECENT_KEY = 'dd_app_recent';
const RECENT_MAX = 8;

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const NIP = /^([a-z0-9-]+)\.(\d{1,3}(?:\.\d{1,3}){3})\.nip\.io$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set(['app', 'www', 'api', 'admin']);

/** True when the page runs inside the DineDesk app (or ?app=1 was opened once in this tab). */
export function isDineDeskApp(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  if (ua.includes(APP_UA_TOKEN)) return true;
  try {
    if (new URLSearchParams(search).get('app') === '1') {
      sessionStorage.setItem(FLAG_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** The real app sends its user agent everywhere; the ?app=1 test mode has to carry the flag across hosts. */
export function withAppFlag(url: string): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes(APP_UA_TOKEN)) return url;
  if (!isDineDeskApp()) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('app', '1');
    return u.toString();
  } catch {
    return url;
  }
}

interface Loc {
  protocol: string;
  hostname: string;
  port: string;
}

const here = (): Loc => (typeof window === 'undefined' ? { protocol: 'https:', hostname: PLATFORM_DOMAIN, port: '' } : window.location);

/** A business subdomain's address as seen from where the app is now (a phone in development uses nip.io). */
export function subdomainUrl(slug: string, path = '/', loc: Loc = here(), platformDomain = PLATFORM_DOMAIN): string {
  const port = loc.port ? `:${loc.port}` : '';
  const ip = IPV4.test(loc.hostname) ? loc.hostname : NIP.exec(loc.hostname)?.[2];
  const host = ip ? `${slug}.${ip}.nip.io` : `${slug}.${platformDomain}`;
  return `${loc.protocol}//${host}${port}${path}`;
}

/** The app's start screen (/app on the platform host), from a business website. */
export function appHomeUrl(loc: Loc = here()): string {
  const nip = NIP.exec(loc.hostname);
  const url = nip ? `${loc.protocol}//${nip[2]}${loc.port ? `:${loc.port}` : ''}/app` : platformUrl('/app');
  return withAppFlag(url);
}

export type QrTarget = {
  /** Where to go. */
  url: string;
  host: string;
  /** Subdomain of the platform (certain); false = a custom domain the server has to confirm. */
  verified: boolean;
};

/**
 * Reads a scanned QR code (or a typed address) and returns the business page to open, or null when
 * it isn't a DineDesk place. Accepts any page of a business website: its home, a table QR (/t/…),
 * a room QR (/r/…), the menu. Business hosts: <slug>.<platform domain>, and in development
 * <slug>.<ip>.nip.io; other domains may be a business's own domain (verified: false).
 */
export function parseQrTarget(text: string, options: { platformDomain?: string; dev?: boolean; loc?: Loc } = {}): QrTarget | null {
  const platformDomain = (options.platformDomain ?? PLATFORM_DOMAIN).toLowerCase();
  const dev = options.dev ?? platformDomain === 'localhost';
  const loc = options.loc ?? here();
  const raw = text.trim();
  if (!raw || raw.length > 2000 || /\s/.test(raw)) return null;

  let url: URL;
  try {
    // A typed address may come without https://.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const path = `${url.pathname}${url.search}${url.hash}`;

  // <slug>.<platform domain>
  const suffix = `.${platformDomain}`;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (!LABEL.test(slug) || RESERVED.has(slug)) return null;
    // In development the QR says <slug>.localhost, which a phone can't open: use the address the app is on.
    if (dev) return { url: subdomainUrl(slug, path, loc, platformDomain), host, verified: true };
    return { url: `https://${host}${path}`, host, verified: true };
  }

  // <slug>.<pc-ip>.nip.io (development only)
  const nip = NIP.exec(host);
  if (nip) {
    if (!dev || RESERVED.has(nip[1])) return null;
    return { url: `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${path}`, host, verified: true };
  }

  // The platform itself, bare IPs, localhost and single-label names are never places.
  if (host === platformDomain || IPV4.test(host) || host === 'localhost' || !host.includes('.') || host.startsWith('[')) return null;
  if (!host.split('.').every((l) => LABEL.test(l))) return null;
  // A business's own domain: the app asks the server before opening it.
  return { url: `https://${host}${path}`, host, verified: false };
}

export interface RecentPlace {
  host: string;
  url: string;
  name: string;
  logo?: string | null;
  business_type?: string | null;
  city?: string | null;
  at: number;
}

export function recentPlaces(): RecentPlace[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentPlace[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.host === 'string' && typeof p.url === 'string' && typeof p.name === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Remembers a place opened from the app (newest first, one entry per host, at most 8). */
export function rememberPlace(place: Omit<RecentPlace, 'at'>, now = Date.now()): RecentPlace[] {
  const list = [{ ...place, at: now }, ...recentPlaces().filter((p) => p.host !== place.host)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the list just isn't kept */
  }
  return list;
}

export function forgetPlaces() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
