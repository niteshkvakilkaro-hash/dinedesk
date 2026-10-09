import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { AuthResult, Session } from '@/types';

/** The signed-in user's session (user, business, role, permissions, plan features). */
export function useSession() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['session', token],
    queryFn: async () => (await api.get<Session>('/auth/me')).data,
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
