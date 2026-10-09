import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '@/lib/api';

export interface OrderFeed {
  latest_id: number;
  new: { id: number; number: number; type: string; total: string; customer_name: string }[];
  counts: { pending: number; in_kitchen: number; ready: number; scheduled: number };
  unread: number;
}

const SOUND_KEY = 'dd_order_sound';

/** Staff preference: chime on new orders (remembered on this device). */
export const useAlertPrefs = create<{ sound: boolean; setSound: (v: boolean) => void }>((set) => ({
  sound: (() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== '0';
    } catch {
      return true;
    }
  })(),
  setSound: (sound) => {
    try {
      localStorage.setItem(SOUND_KEY, sound ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ sound });
  },
}));

let ctx: AudioContext | null = null;

/** A short two-note chime made with Web Audio (no sound file to download). */
export function playChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.55);
    });
  } catch {
    /* audio unavailable (or not yet allowed by the browser) */
  }
}

/**
 * Polls the order feed every 8 s for staff who can see orders. New orders
 * play the chime, show a desktop notification (if allowed) and refresh the
 * orders list. Live WebSockets replace this polling in Phase 5.
 */
export function useOrderAlerts(enabled: boolean, onNew?: (feed: OrderFeed) => void) {
  const qc = useQueryClient();
  const last = useRef<number | null>(null);
  const sound = useAlertPrefs((s) => s.sound);
  const query = useQuery({
    queryKey: ['orders-feed'],
    queryFn: async () => (await api.get<OrderFeed>('/tenant/orders/feed', { after: last.current ?? 0 })).data,
    enabled,
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const feed = query.data;
    if (!feed) return;
    if (last.current === null) {
      last.current = feed.latest_id; // first load: don't ring for old orders
      return;
    }
    const fresh = feed.new.filter((o) => o.id > (last.current ?? 0));
    last.current = Math.max(last.current, feed.latest_id);
    if (!fresh.length) return;
    if (sound) playChime();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      for (const o of fresh) new Notification(`New order #${o.number}`, { body: `${o.customer_name} · ₹${o.total}`, tag: `order-${o.id}` });
    }
    void qc.invalidateQueries({ queryKey: ['orders'] });
    onNew?.({ ...feed, new: fresh });
  }, [query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return query.data;
}
