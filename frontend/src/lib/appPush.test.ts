import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appPushStatus, forgetAppPush, installAppPush, PUSH_TOKEN_EVENT, type AndroidBridge } from './dinedeskApp';

function bridge(token = 'fcm-token-1', status: Record<string, unknown> = { enabled: true, permission: 'granted', token: true, version: '1.3', flavor: 'dev' }) {
  return {
    printHtml: vi.fn(),
    printPage: vi.fn(),
    saveBegin: vi.fn(() => 'f1'),
    saveChunk: vi.fn(() => true),
    saveEnd: vi.fn(() => true),
    allowHost: vi.fn(),
    pushToken: vi.fn(() => token),
    pushStatus: vi.fn(() => JSON.stringify(status)),
    requestPushPermission: vi.fn(),
  } satisfies AndroidBridge;
}

/** A tiny auth store: the API token and its listeners. */
function auth(initial: string | null) {
  let token = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => token,
    set: (t: string | null) => {
      token = t;
      listeners.forEach((fn) => fn());
    },
    on: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('app notifications (DineDesk Android app)', () => {
  let uninstall: (() => void) | undefined;
  beforeEach(() => localStorage.clear());
  afterEach(() => uninstall?.());

  it('reads the status the app reports, and nothing outside the app or in an older app', () => {
    expect(appPushStatus(bridge())).toEqual({ enabled: true, permission: 'granted', token: true, version: '1.3', flavor: 'dev' });
    expect(appPushStatus(bridge('', { enabled: false, permission: 'weird' }))).toEqual({ enabled: false, permission: 'default', token: false, version: undefined, flavor: undefined });
    expect(appPushStatus(null)).toBeNull();
    const old = bridge();
    // @ts-expect-error an app from before notifications
    delete old.pushStatus;
    expect(appPushStatus(old)).toBeNull();
  });

  it('registers the phone on start with a session, once per sign-in and token', async () => {
    const a = auth('api-1');
    const post = vi.fn(async () => ({}));
    const b = bridge();
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => false, post, bridge: () => b });
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/devices', { token: 'fcm-token-1', app_version: '1.3', flavor: 'dev' });
    expect(localStorage.getItem('dd_push_device')).toBe('fcm-token-1');
    a.set('api-1');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('waits for sign-in, and sends again for the next person', async () => {
    const a = auth(null);
    const post = vi.fn(async () => ({}));
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => false, post, bridge: () => bridge() });
    expect(post).not.toHaveBeenCalled();
    a.set('api-owner');
    a.set(null);
    a.set('api-cashier');
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('sends the new token the app reports, and nothing while the app has none yet', async () => {
    const a = auth('api-1');
    const post = vi.fn(async () => ({}));
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => false, post, bridge: () => bridge('') });
    expect(post).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent(PUSH_TOKEN_EVENT, { detail: 'fcm-token-2' }));
    await flush();
    expect(post).toHaveBeenCalledWith('/devices', expect.objectContaining({ token: 'fcm-token-2' }));
  });

  it('never registers from a support session', () => {
    const a = auth('support-token');
    const post = vi.fn(async () => ({}));
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => true, post, bridge: () => bridge() });
    window.dispatchEvent(new CustomEvent(PUSH_TOKEN_EVENT, { detail: 'fcm-token-3' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('tries again after a failed request', async () => {
    const a = auth('api-1');
    const post = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => false, post, bridge: () => bridge() });
    await flush();
    window.dispatchEvent(new CustomEvent(PUSH_TOKEN_EVENT, { detail: 'fcm-token-1' }));
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('removes the phone on sign-out (and only when one was registered)', async () => {
    const del = vi.fn(async () => ({}));
    await forgetAppPush(del);
    expect(del).not.toHaveBeenCalled();

    const a = auth('api-1');
    uninstall = installAppPush({ authToken: a.get, onAuthChange: a.on, isSupport: () => false, post: async () => ({}), bridge: () => bridge('abc:DEF_1') });
    await flush();
    await forgetAppPush(del);
    expect(del).toHaveBeenCalledWith('/devices/abc%3ADEF_1');
    expect(localStorage.getItem('dd_push_device')).toBeNull();
  });
});
