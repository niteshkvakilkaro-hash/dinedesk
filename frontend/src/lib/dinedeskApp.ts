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

/**
 * What the Android app adds to its pages as window.DineDeskAndroid (only on the platform host, its
 * business subdomains and places opened from the app). A WebView can't print (window.print() does
 * nothing) or save blob: / data: downloads by itself, so those go through the app.
 */
export interface AndroidBridge {
  /** Prints a complete HTML document (thermal slips) from an off-screen page. */
  printHtml(html: string, title: string): void;
  /** Prints the page on screen (QR sheets). */
  printPage(title: string): void;
  /** A file in parts: begin → id, chunk (base64) …, end → saved to Downloads (and opened when asked). */
  saveBegin(filename: string, mime: string): string;
  saveChunk(id: string, base64: string): boolean;
  saveEnd(id: string, open: boolean): boolean;
  /** A business's own domain (confirmed by the server) may open inside the app from now on. */
  allowHost(host: string): void;
  /** App notifications (Firebase): this phone's token, '' when the build has no Firebase or it isn't known yet. Newer apps only. */
  pushToken?(): string;
  /** JSON of AppPushStatus. */
  pushStatus?(): string;
  /** Asks Android for the notification permission (13+), or opens the app's notification settings once refused. */
  requestPushPermission?(): void;
}

export function androidBridge(w: unknown = typeof window !== 'undefined' ? window : undefined): AndroidBridge | null {
  const b = (w as { DineDeskAndroid?: Partial<AndroidBridge> } | undefined)?.DineDeskAndroid;
  return b && typeof b.saveBegin === 'function' && typeof b.printHtml === 'function' ? (b as AndroidBridge) : null;
}

const CHUNK = 512 * 1024;

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sends a file to the app in 512 KB parts (big exports stay out of one huge string). */
export async function saveViaBridge(bridge: AndroidBridge, blob: Blob, filename: string, open = false): Promise<void> {
  const id = bridge.saveBegin(filename, blob.type || 'application/octet-stream');
  if (!id) throw new Error('Could not save the file.');
  for (let at = 0; at < blob.size; at += CHUNK) {
    const part = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
    if (!bridge.saveChunk(id, base64(part))) throw new Error('Could not save the file.');
  }
  if (!bridge.saveEnd(id, open)) throw new Error('Could not save the file.');
}

/** Saves a file: through the app when there is one, else the browser's download. */
export async function saveBlob(blob: Blob, filename: string, options: { open?: boolean } = {}): Promise<void> {
  const bridge = androidBridge();
  if (bridge) return saveViaBridge(bridge, blob, filename, options.open);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Inside the app, links like <a href="data:…" download="table-4.png"> (QR codes) are saved through
 * the app with their name. Installed once at start-up; does nothing in a browser.
 */
export function installAppDownloads(doc: Document = document) {
  const bridge = androidBridge(doc.defaultView);
  if (!bridge) return;
  doc.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
      if (!a || !/^(blob|data):/i.test(a.href)) return;
      e.preventDefault();
      const name = a.getAttribute('download') || 'download';
      void fetch(a.href)
        .then((r) => r.blob())
        .then((b) => saveViaBridge(bridge, b, name))
        .catch(() => undefined);
    },
    true,
  );
}

/** App notifications on this phone, as the app reports them. */
export interface AppPushStatus {
  /** The app was built with Firebase (else notifications can't work in this version). */
  enabled: boolean;
  permission: 'granted' | 'denied' | 'default';
  /** Firebase gave the phone its token. */
  token: boolean;
  version?: string;
  flavor?: 'dev' | 'prod';
}

/** Event the app fires when Firebase gives the phone a (new) token: detail = the token. */
export const PUSH_TOKEN_EVENT = 'dinedesk:push-token';
/** The token registered from this phone, so signing out can remove it. */
const PUSH_KEY = 'dd_push_device';

/** App notification status, or null outside the app / in an app without notifications. */
export function appPushStatus(bridge: AndroidBridge | null = androidBridge()): AppPushStatus | null {
  if (!bridge || typeof bridge.pushStatus !== 'function') return null;
  try {
    const s = JSON.parse(bridge.pushStatus() || '{}') as Partial<AppPushStatus>;
    const permission = s.permission === 'granted' || s.permission === 'denied' ? s.permission : 'default';
    return { enabled: !!s.enabled, permission, token: !!s.token, version: s.version, flavor: s.flavor === 'dev' || s.flavor === 'prod' ? s.flavor : undefined };
  } catch {
    return null;
  }
}

function pushTokenFrom(bridge: AndroidBridge | null): string {
  if (!bridge || typeof bridge.pushToken !== 'function') return '';
  try {
    const t = bridge.pushToken();
    return typeof t === 'string' ? t.trim() : '';
  } catch {
    return '';
  }
}

function storedPushToken(): string | null {
  try {
    return localStorage.getItem(PUSH_KEY);
  } catch {
    return null;
  }
}

function storePushToken(token: string | null) {
  try {
    if (token) localStorage.setItem(PUSH_KEY, token);
    else localStorage.removeItem(PUSH_KEY);
  } catch {
    /* storage blocked: signing out still removes it on the server (with the sign-in) */
  }
}

export interface AppPushDeps {
  /** The API token in use (null = signed out). */
  authToken: () => string | null;
  /** Calls back whenever the API token changes; returns the unsubscribe. */
  onAuthChange: (fn: () => void) => () => void;
  /** A super admin's support session in this tab: never registers the phone. */
  isSupport: () => boolean;
  post: (path: string, body: unknown) => Promise<unknown>;
  bridge?: () => AndroidBridge | null;
  win?: Window;
}

let pushDeps: AppPushDeps | null = null;
/** "<api token>|<push token>" last sent, so the same pair is sent once. */
let pushSent = '';

/**
 * Inside the DineDesk app: keeps this phone's notification token registered with the person signed
 * in (POST /devices) after sign-in, on start with a session, and when the app reports a new token.
 * Does nothing in a browser, in an app without notifications, signed out or in a support session.
 * Returns the uninstall (tests).
 */
export function installAppPush(deps: AppPushDeps): () => void {
  pushDeps = deps;
  pushSent = '';
  const win = deps.win ?? window;
  const bridge = deps.bridge ?? (() => androidBridge(win));
  const sync = (given?: string) => {
    const auth = deps.authToken();
    if (!auth) {
      pushSent = '';
      return;
    }
    if (deps.isSupport()) return;
    const b = bridge();
    const token = (given ?? pushTokenFrom(b)).trim();
    if (!token || `${auth}|${token}` === pushSent) return;
    pushSent = `${auth}|${token}`;
    const status = appPushStatus(b);
    void deps.post('/devices', { token, app_version: status?.version ?? null, flavor: status?.flavor ?? null }).then(
      () => storePushToken(token),
      () => {
        pushSent = '';
      },
    );
  };
  const onToken = (e: Event) => {
    const detail = (e as CustomEvent<unknown>).detail;
    if (typeof detail === 'string') sync(detail);
  };
  win.addEventListener(PUSH_TOKEN_EVENT, onToken);
  const stop = deps.onAuthChange(() => sync());
  sync();
  return () => {
    win.removeEventListener(PUSH_TOKEN_EVENT, onToken);
    stop();
    if (pushDeps === deps) pushDeps = null;
  };
}

/**
 * Signing out: removes this phone from the person's devices first (while the API token still
 * works). The server also removes it with the sign-in; this covers a phone registered earlier.
 */
export async function forgetAppPush(del: (path: string) => Promise<unknown>): Promise<void> {
  const token = storedPushToken();
  pushSent = '';
  if (!token || pushDeps?.isSupport()) return;
  storePushToken(null);
  await del(`/devices/${encodeURIComponent(token)}`).catch(() => undefined);
}

/** Tells the app a place may open inside it (needed for a business's own domain). */
export function allowInApp(url: string) {
  const bridge = androidBridge();
  if (!bridge) return;
  try {
    bridge.allowHost(new URL(url).hostname);
  } catch {
    /* not a URL */
  }
}
