import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from '@/lib/api';

/**
 * A guest's sign-in on this business website (phone + SMS code). The token lives in this
 * browser only and is sent as X-Guest-Token; signing in shows orders placed from any device,
 * saved addresses and loyalty points.
 */
export interface GuestAddress {
  label: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  pincode: string;
}

export interface GuestAccount {
  phone: string;
  name: string | null;
  addresses: GuestAddress[];
  points: number;
  orders: { id: string; token: string; number: number; at: string }[];
}

const key = () => `dd_guest_${typeof window === 'undefined' ? 'x' : window.location.host}`;
const listeners = new Set<() => void>();

function readToken(): string | null {
  try {
    return localStorage.getItem(key());
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(key(), token);
    else localStorage.removeItem(key());
  } catch {
    // Private mode: nothing is kept, so the guest simply stays signed out.
  }
  listeners.forEach((l) => l());
}

export function useGuestToken() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readToken,
    () => null,
  );
}

const call = <T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) => {
  const token = readToken();
  return request<T>(`/site/account${path}`, { method, body, headers: token ? { 'X-Guest-Token': token } : {} });
};

/** The signed-in guest (null when signed out; a stale token is dropped). */
export function useGuestAccount() {
  const token = useGuestToken();
  return useQuery({
    queryKey: ['guest-account', token],
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        return (await call<GuestAccount>('')).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setToken(null);
        throw e;
      }
    },
  });
}

export function sendGuestCode(phone: string) {
  return call<{ sent: boolean; dev_code?: string }>('/code', 'POST', { phone });
}

export function useGuestSignIn() {
  const qc = useQueryClient();
  return useMutation<GuestAccount, ApiError, { phone: string; code: string }>({
    mutationFn: async (v) => {
      const res = await call<{ token: string; account: GuestAccount }>('/verify', 'POST', v);
      setToken(res.data.token);
      qc.setQueryData(['guest-account', res.data.token], res.data.account);
      return res.data.account;
    },
  });
}

export function useGuestUpdate() {
  const qc = useQueryClient();
  return useMutation<GuestAccount, ApiError, { name: string | null; addresses: GuestAddress[] }>({
    mutationFn: async (v) => (await call<GuestAccount>('', 'PUT', v)).data,
    onSuccess: (account) => qc.setQueryData(['guest-account', readToken()], account),
  });
}

export async function guestSignOut() {
  try {
    await call('/sign-out', 'POST');
  } finally {
    setToken(null);
  }
}
