import { create } from 'zustand';
import { setApiToken } from '@/lib/api';

const KEY = 'dd_token';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
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
        if (token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      } catch {
        /* private mode: keep it in memory only */
      }
      setApiToken(token);
      set({ token });
    },
  };
});
