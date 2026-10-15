import { create } from 'zustand';
import { setApiToken } from '@/lib/api';

const KEY = 'dd_token';
/** A super admin's support session lives only in its own tab (never in localStorage). */
const SUPPORT_KEY = 'dd_support_token';
/** Which business the support session is for, to return to it in the platform panel. */
const SUPPORT_INFO_KEY = 'dd_support_info';

/** The support session in this tab (the server's session payload has read-only and the end time). */
export interface SupportTabInfo {
  tenantId: string | null;
  name: string | null;
  /** Opened as a separate browser tab (desktop): "Back" closes it when it can. */
  newTab?: boolean;
}

/** How the last support session in this tab ended: the platform panel says so and opens that business. */
export interface SupportNotice {
  kind: 'ended' | 'expired';
  tenantId: string | null;
  name: string | null;
}

/** "/dashboard#support=…" link for a support session opened in a new tab (desktop only). */
export function supportLink(token: string, info: { tenantId: string; name: string }): string {
  return `/dashboard#support=${encodeURIComponent(token)}&tenant=${encodeURIComponent(info.tenantId)}&name=${encodeURIComponent(info.name)}`;
}

/** Reads "#support=TOKEN[&tenant=ID][&name=NAME]" (anything else: null). */
export function parseSupportHash(hash: string): { token: string; tenantId: string | null; name: string | null } | null {
  if (!hash.startsWith('#support=')) return null;
  try {
    const p = new URLSearchParams(hash.slice(1));
    const token = p.get('support');
    return token ? { token, tenantId: p.get('tenant'), name: p.get('name') } : null;
  } catch {
    return null;
  }
}

function ownToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function read(): string | null {
  try {
    // Opened from the platform panel in a new tab: keep it for this tab only.
    const opened = parseSupportHash(window.location.hash);
    if (opened) {
      sessionStorage.setItem(SUPPORT_KEY, opened.token);
      sessionStorage.setItem(SUPPORT_INFO_KEY, JSON.stringify({ tenantId: opened.tenantId, name: opened.name, newTab: true } satisfies SupportTabInfo));
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return sessionStorage.getItem(SUPPORT_KEY) ?? localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** True in a support tab (its token is not the person's own sign-in). */
export function isSupportTab(): boolean {
  try {
    return !!sessionStorage.getItem(SUPPORT_KEY);
  } catch {
    return false;
  }
}

export function supportTabInfo(): SupportTabInfo | null {
  try {
    if (!sessionStorage.getItem(SUPPORT_KEY)) return null;
    return { tenantId: null, name: null, ...(JSON.parse(sessionStorage.getItem(SUPPORT_INFO_KEY) ?? '{}') as Partial<SupportTabInfo>) };
  } catch {
    return null;
  }
}

export function endSupportTab() {
  try {
    sessionStorage.removeItem(SUPPORT_KEY);
    sessionStorage.removeItem(SUPPORT_INFO_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthState {
  token: string | null;
  /** Set when a support session in this tab ended; the platform panel shows it once. */
  supportNotice: SupportNotice | null;
  setToken: (token: string | null) => void;
  /** Work inside a business in this tab with a support token (the own sign-in stays untouched). */
  startSupport: (token: string, info: SupportTabInfo) => void;
  /** Back to the person's own sign-in in this tab. */
  leaveSupport: (kind: SupportNotice['kind']) => void;
  clearSupportNotice: () => void;
}

/**
 * The API token lives in localStorage so owners and staff stay signed in on
 * their own devices (it expires server-side after SANCTUM_TOKEN_EXPIRATION).
 * The session itself (user, tenant, permissions) is fetched from /auth/me.
 *
 * Support sessions (a super admin inside a business) keep their token in sessionStorage, so
 * only this tab uses it; every API call in the tab goes out with it until the session ends.
 */
export const useAuthStore = create<AuthState>((set, get) => {
  const initial = read();
  setApiToken(initial);
  return {
    token: initial,
    supportNotice: null,
    setToken: (token) => {
      if (isSupportTab()) {
        // Never mix a support token into the person's own sign-in. Signing out of a support
        // session (or its token being refused) only ends it: back to the own sign-in.
        if (!token) get().leaveSupport('ended');
        else {
          setApiToken(token);
          set({ token });
        }
        return;
      }
      try {
        if (token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      } catch {
        /* private mode: keep it in memory only */
      }
      setApiToken(token);
      set({ token });
    },
    startSupport: (token, info) => {
      try {
        sessionStorage.setItem(SUPPORT_KEY, token);
        sessionStorage.setItem(SUPPORT_INFO_KEY, JSON.stringify(info));
      } catch {
        /* storage blocked: the session still works in this page until it is reloaded */
      }
      setApiToken(token);
      set({ token, supportNotice: null });
    },
    leaveSupport: (kind) => {
      const info = supportTabInfo();
      endSupportTab();
      const own = ownToken();
      setApiToken(own);
      set({ token: own, supportNotice: { kind, tenantId: info?.tenantId ?? null, name: info?.name ?? null } });
    },
    clearSupportNotice: () => set({ supportNotice: null }),
  };
});
