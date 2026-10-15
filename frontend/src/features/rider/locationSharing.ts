/**
 * A delivery rider's location, sent while they are on duty (every dinedesk.riders.location_interval
 * seconds, 300 by default, plus once at duty start and on each order status change).
 *
 * Two ways, picked by feature detection:
 *
 * - native: inside the DineDesk Android app (window.DineDeskAndroid has startLocationSharing and
 *   stopLocationSharing). A WebView stops running JavaScript when the app goes to the background, so
 *   the app's own foreground service takes the positions and uploads them straight to the API.
 *   Contract (the app side):
 *
 *     startLocationSharing(json: string): boolean   // false = could not start (permission refused)
 *       json = NativeSharingConfig: { uploadUrl, token, intervalSec, tenantHost, locale, expiresAt }
 *     stopLocationSharing(): void                    // send what is queued once, then stop
 *     locationSharingStatus?(): string               // JSON { running, lastSentAt, lastError, queued? }
 *     sendLocationNow?(): void                       // take and send one position now (status changes)
 *
 *   Upload: POST uploadUrl with headers Authorization: Bearer <token>, Accept: application/json,
 *   Content-Type: application/json, X-Tenant-Host: <tenantHost>, X-Locale: <locale>; body
 *   { "points": [ { lat, lng, accuracy_m, speed, heading, battery, recorded_at } ] } (1–50 points,
 *   recorded_at ISO 8601). 200 → data { accepted, on_duty, interval_sec }: drop the sent points, stop
 *   when on_duty is false, follow interval_sec. 401/403 → stop (token ended). 409 not_on_duty → drop
 *   the queue and stop. 422 → drop that batch. 429 / 5xx / offline → keep the queue, retry next time.
 *
 * - web: anywhere else, while the rider screen is open (navigator.geolocation; needs https or
 *   localhost). Positions that could not be sent (offline) wait in a small queue.
 */

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  recorded_at: string;
}

export interface NativeSharingConfig {
  /** Absolute URL of POST /api/v1/tenant/rider/locations. */
  uploadUrl: string;
  /** Upload-only token from POST /tenant/rider/duty (it can't call anything else). */
  token: string;
  intervalSec: number;
  /** Sent as X-Tenant-Host (the host the app shows, e.g. dinedesk.in). */
  tenantHost: string;
  /** Sent as X-Locale. */
  locale: string;
  /** When the token stops working (the service should stop by then). */
  expiresAt: string | null;
}

export interface NativeLocationBridge {
  startLocationSharing(json: string): boolean | void;
  stopLocationSharing(): void;
  locationSharingStatus?(): string;
  sendLocationNow?(): void;
}

export type SharingMode = 'native' | 'web' | 'unavailable';

/** Why sharing isn't working: shown to the rider in plain words. */
export type SharingError = 'denied' | 'insecure' | 'unsupported' | 'position' | 'offline' | 'off_duty' | 'start_failed' | 'unauthorized';

export interface SharingStatus {
  running: boolean;
  lastSentAt: string | null;
  lastError: SharingError | string | null;
}

export const DEFAULT_INTERVAL_SEC = 300;
const MAX_QUEUE = 50;

/** The app's location methods, when this page runs inside the DineDesk app (both start and stop present). */
export function nativeLocationBridge(w: unknown = typeof window !== 'undefined' ? window : undefined): NativeLocationBridge | null {
  const b = (w as { DineDeskAndroid?: Partial<NativeLocationBridge> } | undefined)?.DineDeskAndroid;
  return b && typeof b.startLocationSharing === 'function' && typeof b.stopLocationSharing === 'function' ? (b as NativeLocationBridge) : null;
}

export function pickMode(env: { bridge: NativeLocationBridge | null; geolocation?: Geolocation | null; secure?: boolean }): SharingMode {
  if (env.bridge) return 'native';
  if (env.geolocation && env.secure !== false) return 'web';
  return 'unavailable';
}

/** Why the browser can't share (no bridge): not https, or no geolocation at all. */
export function unavailableReason(env: { geolocation?: Geolocation | null; secure?: boolean }): SharingError {
  return env.geolocation && env.secure === false ? 'insecure' : 'unsupported';
}

/** The interval, kept sane (at least a minute; 5 minutes when unknown). */
export function intervalMs(sec: number | null | undefined): number {
  const s = Number(sec);
  return (Number.isFinite(s) && s > 0 ? Math.max(60, s) : DEFAULT_INTERVAL_SEC) * 1000;
}

/** The absolute upload address for the app (the API may be on a relative path behind a proxy). */
export function uploadUrl(apiBase: string, pageHref: string): string {
  return new URL(`${apiBase.replace(/\/$/, '')}/tenant/rider/locations`, pageHref).toString();
}

/** The app's status JSON, or null when it gave nothing usable. */
export function parseNativeStatus(raw: unknown): SharingStatus | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SharingStatus>;
    if (!s || typeof s !== 'object') return null;
    return { running: !!s.running, lastSentAt: typeof s.lastSentAt === 'string' ? s.lastSentAt : null, lastError: typeof s.lastError === 'string' ? s.lastError : null };
  } catch {
    return null;
  }
}

export function pointFrom(p: GeolocationPosition, battery: number | null = null): LocationPoint {
  const c = p.coords;
  const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy_m: num(c.accuracy) !== null ? Math.round(c.accuracy) : null,
    speed: num(c.speed),
    heading: num(c.heading),
    battery,
    recorded_at: new Date(p.timestamp || Date.now()).toISOString(),
  };
}

/** What the upload says back; `status` on failure (0 = offline). */
export type Sender = (points: LocationPoint[]) => Promise<{ on_duty: boolean }>;
export class SendError extends Error {
  constructor(public status: number) {
    super(`upload failed (${status})`);
  }
}

export interface LocationSharing {
  readonly mode: SharingMode;
  /** Starts sharing; false when it could not start (see status().lastError). */
  start(native?: { token: string; expiresAt: string | null }): boolean;
  stop(): void;
  /** One position now (duty start, order status change). */
  sendNow(): Promise<void>;
  status(): SharingStatus;
}

interface Options {
  bridge: NativeLocationBridge | null;
  geolocation?: Geolocation | null;
  secure?: boolean;
  send: Sender;
  intervalSec: number;
  /** For the app: where and how to upload. */
  native?: { uploadUrl: string; tenantHost: string; locale: string };
  battery?: () => Promise<number | null>;
  onChange?: (s: SharingStatus) => void;
}

/** Native when the app offers it, else the browser, else nothing (with the reason). */
export function createLocationSharing(o: Options): LocationSharing {
  const mode = pickMode(o);
  if (mode === 'native') return new NativeSharing(o.bridge!, o);
  if (mode === 'web') return new WebSharing(o.geolocation!, o);
  return new NoSharing(unavailableReason(o));
}

class NoSharing implements LocationSharing {
  readonly mode = 'unavailable' as const;
  constructor(private reason: SharingError) {}
  start() {
    return false;
  }
  stop() {}
  async sendNow() {}
  status(): SharingStatus {
    return { running: false, lastSentAt: null, lastError: this.reason };
  }
}

class NativeSharing implements LocationSharing {
  readonly mode = 'native' as const;
  private error: string | null = null;
  constructor(
    private bridge: NativeLocationBridge,
    private o: Options,
  ) {}

  start(native?: { token: string; expiresAt: string | null }) {
    if (!native?.token || !this.o.native) {
      this.error = 'start_failed';
      return false;
    }
    const config: NativeSharingConfig = {
      uploadUrl: this.o.native.uploadUrl,
      token: native.token,
      intervalSec: intervalMs(this.o.intervalSec) / 1000,
      tenantHost: this.o.native.tenantHost,
      locale: this.o.native.locale,
      expiresAt: native.expiresAt,
    };
    let ok: boolean | void;
    try {
      ok = this.bridge.startLocationSharing(JSON.stringify(config));
    } catch {
      ok = false;
    }
    this.error = ok === false ? 'start_failed' : null;
    this.o.onChange?.(this.status());
    return ok !== false;
  }

  stop() {
    try {
      this.bridge.stopLocationSharing();
    } catch {
      /* the app is closing */
    }
    this.o.onChange?.(this.status());
  }

  async sendNow() {
    try {
      this.bridge.sendLocationNow?.();
    } catch {
      /* older app: the next interval sends it */
    }
  }

  status(): SharingStatus {
    let s: SharingStatus | null = null;
    try {
      s = parseNativeStatus(this.bridge.locationSharingStatus?.());
    } catch {
      s = null;
    }
    return s ?? { running: this.error === null, lastSentAt: null, lastError: this.error };
  }
}

class WebSharing implements LocationSharing {
  readonly mode = 'web' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: LocationPoint[] = [];
  private lastSentAt: string | null = null;
  private error: string | null = null;
  private busy = false;

  constructor(
    private geo: Geolocation,
    private o: Options,
  ) {}

  start() {
    if (this.timer) return true;
    this.error = null;
    this.timer = setInterval(() => void this.sendNow(), intervalMs(this.o.intervalSec));
    void this.sendNow();
    this.changed();
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.changed();
  }

  async sendNow() {
    if (!this.timer || this.busy) return;
    this.busy = true;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        this.geo.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }),
      );
      const battery = this.o.battery ? await this.o.battery().catch(() => null) : null;
      this.queue = [...this.queue, pointFrom(position, battery)].slice(-MAX_QUEUE);
      await this.flush();
    } catch (e) {
      // An upload problem was already noted by flush(); this is the phone's position failing.
      if (!(e instanceof SendError)) this.error = (e as GeolocationPositionError | null)?.code === 1 ? 'denied' : 'position';
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  status(): SharingStatus {
    return { running: !!this.timer, lastSentAt: this.lastSentAt, lastError: this.error };
  }

  private async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.slice(0, MAX_QUEUE);
    try {
      const res = await this.o.send(batch);
      this.queue = this.queue.slice(batch.length);
      this.lastSentAt = new Date().toISOString();
      this.error = null;
      if (!res.on_duty) {
        this.error = 'off_duty';
        this.stop();
      }
    } catch (e) {
      const status = e instanceof SendError ? e.status : 0;
      if (status === 409) {
        this.queue = [];
        this.error = 'off_duty';
        this.stop();
      } else if (status === 401 || status === 403) {
        this.error = 'unauthorized';
        this.stop();
      } else if (status === 422) {
        this.queue = this.queue.slice(batch.length); // bad points never go through
        this.error = 'position';
      } else {
        this.error = 'offline'; // kept for the next try
      }
      throw e instanceof SendError ? e : new SendError(status);
    }
  }

  private changed() {
    this.o.onChange?.(this.status());
  }
}
