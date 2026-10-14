import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { isSupportTab, useAuthStore } from '@/stores/auth';
import type { AuthResult, Session } from '@/types';

/** The last session, so the POS still opens with no internet (the token is already on the device). */
const SESSION_KEY = 'dd_session';

function keepSession(token: string, session: Session) {
  if (isSupportTab()) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, session }));
  } catch {
    /* storage full or blocked */
  }
}

function keptSession(token: string): Session | null {
  try {
    const kept = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as { token: string; session: Session } | null;
    return kept && kept.token === token ? kept.session : null;
  } catch {
    return null;
  }
}

function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** The signed-in user's session (user, business, role, permissions, plan features). */
export function useSession() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['session', token],
    queryFn: async () => {
      try {
        const session = (await api.get<Session>('/auth/me')).data;
        keepSession(token!, session);
        return session;
      } catch (e) {
        // No connection (not a rejected sign-in): carry on with the last session.
        const kept = e instanceof ApiError && e.status === 0 ? keptSession(token!) : null;
        if (kept) return kept;
        throw e;
      }
    },
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  return (result: AuthResult) => {
    setToken(result.token);
    qc.setQueryData(['session', result.token], result.session);
  };
}

export function useSignOut() {
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  return async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    forgetSession();
    qc.clear();
  };
}

/** Plan-gated features: hide or show upgrade prompts in the UI. The API enforces the same rules. */
export function useFeature(feature: string): boolean {
  const { data } = useSession();
  return Boolean(data?.features?.[feature]);
}

export function useCan(permission: string): boolean {
  const { data } = useSession();
  return Boolean(data?.permissions?.includes(permission));
}

/** My account changed: the session the server sent back replaces the cached one (and the offline copy). */
export function useSetSession() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  return (session: Session) => {
    qc.setQueryData(['session', token], session);
    if (token) keepSession(token, session);
  };
}

/**
 * Switch the dashboard language and remember it on the account (users.locale): alerts and
 * messages to this person (staff push alerts, the owner's morning summary) use it too.
 * Not saved in a support session (that's someone else's account).
 */
export function useSaveLanguage() {
  const { i18n } = useTranslation();
  const { data: session } = useSession();
  const setSession = useSetSession();
  return async (code: string) => {
    await i18n.changeLanguage(code);
    if (!session || session.support || session.user.locale === code) return;
    setSession((await api.patch<Session>('/account', { locale: code })).data);
  };
}
