import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

const KEY = 'dd_reduce_motion';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** The visitor's own "Reduce motion" switch (site footer), remembered on this device. */
export const useMotionStore = create<{ userReduce: boolean; setUserReduce: (v: boolean) => void }>((set) => ({
  userReduce: read(),
  setUserReduce: (v) => {
    try {
      if (v) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: keep it for this visit only */
    }
    set({ userReduce: v });
  },
}));

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

export function systemPrefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;
}

/**
 * True when motion should be minimal: the OS setting or the footer toggle.
 * Then: no intros, parallax, pinned scroll, flying elements, cursor effects
 * or auto-moving marquees. Simple fades are still allowed.
 */
export function useReduceMotion(): boolean {
  const system = useSyncExternalStore(subscribe, systemPrefersReduced, () => false);
  const user = useMotionStore((s) => s.userReduce);
  return system || user;
}
