import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { createLocationSharing, intervalMs, nativeLocationBridge, parseNativeStatus, pickMode, SendError, uploadUrl, type NativeLocationBridge, type Sender } from './locationSharing';
import { agoText, directionsUrl, isStale, minutesSince } from './time';

function fakeGeo(fail?: { code: number }) {
  let n = 0;
  return {
    getCurrentPosition: vi.fn((ok: PositionCallback, err?: PositionErrorCallback | null) => {
      if (fail) return err?.(fail as GeolocationPositionError);
      n += 1;
      ok({ timestamp: Date.now(), coords: { latitude: 18.5 + n / 1000, longitude: 73.8, accuracy: 12.4, speed: null, heading: null, altitude: null, altitudeAccuracy: null } } as unknown as GeolocationPosition);
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as Geolocation & { getCurrentPosition: ReturnType<typeof vi.fn> };
}

function fakeBridge(extra: Partial<NativeLocationBridge> = {}) {
  return { startLocationSharing: vi.fn(() => true), stopLocationSharing: vi.fn(), ...extra } satisfies NativeLocationBridge;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('choosing how to share', () => {
  it('uses the app only when it offers both start and stop', () => {
    expect(nativeLocationBridge({ DineDeskAndroid: { startLocationSharing: () => true } })).toBeNull();
    expect(nativeLocationBridge({ DineDeskAndroid: { printHtml: () => undefined } })).toBeNull();
    expect(nativeLocationBridge({})).toBeNull();
    const b = fakeBridge();
    expect(nativeLocationBridge({ DineDeskAndroid: b })).toBe(b);
  });

  it('prefers the app, then the browser on https, else explains why not', () => {
    const geo = fakeGeo();
    expect(pickMode({ bridge: fakeBridge(), geolocation: geo, secure: true })).toBe('native');
    expect(pickMode({ bridge: null, geolocation: geo, secure: true })).toBe('web');
    expect(pickMode({ bridge: null, geolocation: geo, secure: false })).toBe('unavailable');
    expect(pickMode({ bridge: null, geolocation: null })).toBe('unavailable');
    const send = vi.fn<Sender>();
    expect(createLocationSharing({ bridge: null, geolocation: geo, secure: false, send, intervalSec: 300 }).status().lastError).toBe('insecure');
    expect(createLocationSharing({ bridge: null, geolocation: null, send, intervalSec: 300 }).status().lastError).toBe('unsupported');
  });

  it('keeps the interval sane and builds an absolute upload address', () => {
    expect(intervalMs(300)).toBe(300_000);
    expect(intervalMs(5)).toBe(60_000);
    expect(intervalMs(undefined)).toBe(300_000);
    expect(uploadUrl('/api/v1', 'http://192.168.1.5:5180/rider/')).toBe('http://192.168.1.5:5180/api/v1/tenant/rider/locations');
    expect(uploadUrl('https://api.dinedesk.in/api/v1/', 'https://dinedesk.in/rider/')).toBe('https://api.dinedesk.in/api/v1/tenant/rider/locations');
  });
});

describe('in the app', () => {
  it('hands the upload details to the app and reads its status', () => {
    const start = vi.fn((_json: string) => true);
    const bridge = fakeBridge({ startLocationSharing: start, locationSharingStatus: vi.fn(() => JSON.stringify({ running: true, lastSentAt: '2026-11-10T07:30:00Z', lastError: null })), sendLocationNow: vi.fn() });
    const s = createLocationSharing({ bridge, geolocation: fakeGeo(), send: vi.fn<Sender>(), intervalSec: 300, native: { uploadUrl: 'https://dinedesk.in/api/v1/tenant/rider/locations', tenantHost: 'dinedesk.in', locale: 'hi' } });
    expect(s.mode).toBe('native');
    expect(s.start({ token: '12|abc', expiresAt: '2026-11-11T05:00:00Z' })).toBe(true);
    expect(JSON.parse(start.mock.calls[0][0])).toEqual({
      uploadUrl: 'https://dinedesk.in/api/v1/tenant/rider/locations',
      token: '12|abc',
      intervalSec: 300,
      tenantHost: 'dinedesk.in',
      locale: 'hi',
      expiresAt: '2026-11-11T05:00:00Z',
    });
    expect(s.status()).toEqual({ running: true, lastSentAt: '2026-11-10T07:30:00Z', lastError: null });
    void s.sendNow();
    expect(bridge.sendLocationNow).toHaveBeenCalled();
    s.stop();
    expect(bridge.stopLocationSharing).toHaveBeenCalled();
  });

  it('reports when the app refuses or has no token', () => {
    const bridge = fakeBridge({ startLocationSharing: vi.fn(() => false) });
    const s = createLocationSharing({ bridge, send: vi.fn<Sender>(), intervalSec: 300, native: { uploadUrl: 'u', tenantHost: 'h', locale: 'en' } });
    expect(s.start({ token: 't', expiresAt: null })).toBe(false);
    expect(s.status()).toEqual({ running: false, lastSentAt: null, lastError: 'start_failed' });
    expect(s.start(undefined)).toBe(false);
    expect(parseNativeStatus('not json')).toBeNull();
    expect(parseNativeStatus(undefined)).toBeNull();
  });
});

describe('in the browser', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('sends one position at once, then every interval, until stopped', async () => {
    const send = vi.fn<Sender>(async () => ({ on_duty: true }));
    const geo = fakeGeo();
    const s = createLocationSharing({ bridge: null, geolocation: geo, secure: true, send, intervalSec: 300 });
    expect(s.start()).toBe(true);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0][0]).toMatchObject({ lat: 18.501, lng: 73.8, accuracy_m: 12, speed: null });
    expect(s.status().running).toBe(true);
    expect(s.status().lastSentAt).not.toBeNull();

    vi.advanceTimersByTime(299_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);

    s.stop();
    vi.advanceTimersByTime(600_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(s.status().running).toBe(false);
  });

  it('keeps positions taken offline and sends them together later', async () => {
    let online = false;
    const send = vi.fn<Sender>(async () => {
      if (!online) throw new SendError(0);
      return { on_duty: true };
    });
    const s = createLocationSharing({ bridge: null, geolocation: fakeGeo(), secure: true, send, intervalSec: 60 });
    s.start();
    await flush();
    expect(s.status().lastError).toBe('offline');
    vi.advanceTimersByTime(60_000);
    await flush();
    online = true;
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(send.mock.calls.at(-1)![0]).toHaveLength(3);
    expect(s.status().lastError).toBeNull();
  });

  it('stops when the server says the rider is off duty', async () => {
    const send = vi.fn<Sender>(async () => {
      throw new SendError(409);
    });
    const s = createLocationSharing({ bridge: null, geolocation: fakeGeo(), secure: true, send, intervalSec: 300 });
    s.start();
    await flush();
    expect(s.status()).toMatchObject({ running: false, lastError: 'off_duty' });
  });

  it('says so when location permission is refused', async () => {
    const send = vi.fn<Sender>();
    const s = createLocationSharing({ bridge: null, geolocation: fakeGeo({ code: 1 }), secure: true, send, intervalSec: 300 });
    s.start();
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(s.status().lastError).toBe('denied');
  });
});

describe('time ago and staleness', () => {
  const now = Date.parse('2026-11-10T08:00:00Z');
  const t = ((key: string, o?: { count?: number }) => (o?.count !== undefined ? `${key}:${o.count}` : key)) as unknown as TFunction;

  it('counts whole minutes and marks old positions stale', () => {
    expect(minutesSince('2026-11-10T07:58:30Z', now)).toBe(1);
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince('2026-11-10T08:05:00Z', now)).toBe(0); // phone clock a little ahead
    expect(isStale('2026-11-10T07:50:00Z', now)).toBe(false);
    expect(isStale('2026-11-10T07:44:00Z', now)).toBe(true);
    expect(isStale('2026-11-10T07:44:00Z', now, 30)).toBe(false);
    expect(isStale(undefined, now)).toBe(true);
  });

  it('says just now, minutes or hours', () => {
    expect(agoText(t, '2026-11-10T07:59:40Z', now)).toBe('orders.justNow');
    expect(agoText(t, '2026-11-10T07:58:00Z', now)).toBe('orders.minutesAgo:2');
    expect(agoText(t, '2026-11-10T05:10:00Z', now)).toBe('riders.hoursAgo:2');
    expect(agoText(t, null, now)).toBeNull();
  });

  it('links directions to the pin, else the address', () => {
    expect(directionsUrl({ lat: 18.5, lng: 73.8, line1: 'x' })).toBe('https://www.google.com/maps/dir/?api=1&destination=18.5,73.8');
    expect(directionsUrl({ line1: '12 MG Road', pincode: '411038', lat: null, lng: null })).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20MG%20Road%2C%20411038');
    expect(directionsUrl(null)).toBeNull();
  });
});
