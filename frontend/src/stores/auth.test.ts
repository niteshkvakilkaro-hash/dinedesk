import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fresh module per test: the store reads its token once, when it is created.
async function load(hash = '') {
  vi.resetModules();
  window.history.replaceState(null, '', `/dashboard${hash}`);
  const api = await import('@/lib/api');
  const sent: (string | null)[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push((init.headers as Record<string, string>).Authorization ?? null);
    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const auth = await import('./auth');
  const lastAuth = async () => {
    await api.api.get('/auth/me');
    return sent.at(-1);
  };
  return { ...auth, lastAuth };
}

describe('support sessions in one tab', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('parses the new-tab link and nothing else', async () => {
    const { parseSupportHash, supportLink } = await load();
    const link = supportLink('5|abc&def', { tenantId: '01abc', name: 'Spice & Co' });
    expect(parseSupportHash(link.slice(link.indexOf('#')))).toEqual({ token: '5|abc&def', tenantId: '01abc', name: 'Spice & Co' });
    expect(parseSupportHash('#support=tok')).toEqual({ token: 'tok', tenantId: null, name: null });
    expect(parseSupportHash('#menu')).toBeNull();
    expect(parseSupportHash('')).toBeNull();
  });

  it('uses the support token in this tab and the own token again afterwards', async () => {
    localStorage.setItem('dd_token', 'own-token');
    const { useAuthStore, isSupportTab, supportTabInfo, lastAuth } = await load();
    expect(await lastAuth()).toBe('Bearer own-token');

    useAuthStore.getState().startSupport('support-token', { tenantId: 't1', name: 'Spice Route' });
    expect(useAuthStore.getState().token).toBe('support-token');
    expect(await lastAuth()).toBe('Bearer support-token');
    expect(isSupportTab()).toBe(true);
    expect(supportTabInfo()).toEqual({ tenantId: 't1', name: 'Spice Route' });
    // The own sign-in is never replaced.
    expect(localStorage.getItem('dd_token')).toBe('own-token');

    useAuthStore.getState().leaveSupport('ended');
    expect(useAuthStore.getState().token).toBe('own-token');
    expect(await lastAuth()).toBe('Bearer own-token');
    expect(isSupportTab()).toBe(false);
    expect(useAuthStore.getState().supportNotice).toEqual({ kind: 'ended', tenantId: 't1', name: 'Spice Route' });
  });

  it('keeps the support session across a reload of the tab', async () => {
    localStorage.setItem('dd_token', 'own-token');
    sessionStorage.setItem('dd_support_token', 'support-token');
    const { useAuthStore, lastAuth } = await load();
    expect(useAuthStore.getState().token).toBe('support-token');
    expect(await lastAuth()).toBe('Bearer support-token');
  });

  it('takes a new-tab link once and removes it from the address bar', async () => {
    localStorage.setItem('dd_token', 'own-token');
    const { useAuthStore, supportTabInfo } = await load('#support=tab-token&tenant=t9&name=Dhaba');
    expect(useAuthStore.getState().token).toBe('tab-token');
    expect(supportTabInfo()).toEqual({ tenantId: 't9', name: 'Dhaba', newTab: true });
    expect(window.location.hash).toBe('');
  });

  it('signing out of a support session (or its token being refused) only ends it', async () => {
    localStorage.setItem('dd_token', 'own-token');
    const { useAuthStore, isSupportTab } = await load();
    useAuthStore.getState().startSupport('support-token', { tenantId: 't1', name: 'Spice Route' });
    useAuthStore.getState().setToken(null);
    expect(isSupportTab()).toBe(false);
    expect(useAuthStore.getState().token).toBe('own-token');
    expect(localStorage.getItem('dd_token')).toBe('own-token');

    useAuthStore.getState().startSupport('support-token-2', { tenantId: 't1', name: 'Spice Route' });
    useAuthStore.getState().leaveSupport('expired');
    expect(useAuthStore.getState().supportNotice?.kind).toBe('expired');
    useAuthStore.getState().clearSupportNotice();
    expect(useAuthStore.getState().supportNotice).toBeNull();
  });

  it('outside support, signing out clears the own token as before', async () => {
    localStorage.setItem('dd_token', 'own-token');
    const { useAuthStore } = await load();
    useAuthStore.getState().setToken(null);
    expect(localStorage.getItem('dd_token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
