import { create } from 'zustand';
import { setApiToken } from '@/lib/api';

const KEY = 'dd_token';
/** A super admin's support session lives only in its own tab (never in localStorage). */
const SUPPORT_KEY = 'dd_support_token';

function read(): string | null {
  try {
    // Opened from the platform panel as /dashboard#support=TOKEN: keep it for this tab only.
    const m = window.location.hash.match(/^#support=([^&]+)$/);
    if (m) {
      sessionStorage.setItem(SUPPORT_KEY, decodeURIComponent(m[1]));
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

export function endSupportTab() {
  try {
    sessionStorage.removeItem(SUPPORT_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

/**
 * The API token lives in localStorage so owners and staff stay signed in on
 * their own devices (it expires server-side after SANCTUM_TOKEN_EXPIRATION).
 * The session itself (user, tenant, permissions) is fetched from /auth/me.
 */
export const useAuthStore = create<AuthState>((set) => {
  const initial = read();
  setApiToken(initial);
  return {
    token: initial,
    setToken: (token) => {
      try {
        if (isSupportTab()) {
          // Never mix a support token into the person's own sign-in.
          if (!token) endSupportTab();
        } else if (token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      } catch {
        /* private mode: keep it in memory only */
      }
      setApiToken(token);
      set({ token });
    },
  };
});
