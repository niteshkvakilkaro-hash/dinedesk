import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { apiLines, useCart } from './cart';
import type { CustomerOrder, OrderStatus, OrderType, Quote } from './types';

/** Live server price for the cart (debounced), with delivery zone info when a pincode is known. */
export function useQuote(
  type: OrderType | null,
  area: { pincode?: string; lat?: number | null; lng?: number | null } = {},
  offers: { coupon_code?: string | null; phone?: string | null; loyalty?: { token: string; points: number } | null } = {},
) {
  const lines = useCart((s) => s.lines);
  const body = useDebounced(
    JSON.stringify({
      type,
      items: apiLines(lines),
      pincode: /^[1-9]\d{5}$/.test(area.pincode ?? '') ? area.pincode : undefined,
      lat: area.lat ?? undefined,
      lng: area.lng ?? undefined,
      coupon_code: offers.coupon_code || undefined,
      phone: offers.phone || undefined,
      loyalty: offers.loyalty?.points ? offers.loyalty : undefined,
    }),
    300,
  );
  // Decide from the debounced payload itself, so a stale body (e.g. no type yet) is never sent.
  const pending = JSON.parse(body) as { type: OrderType | null; items: unknown[] };
  return useQuery({
    queryKey: ['quote', body],
    queryFn: async () => (await api.post<Quote>('/site/orders/quote', pending)).data,
    enabled: !!type && !!pending.type && pending.items.length > 0,
    placeholderData: (prev) => prev,
    retry: false,
    staleTime: 15_000,
  });
}

/** Order tracking: refreshes every 10 s while the order is still moving. */
export function useTrackedOrder(id: string, token: string) {
  return useQuery({
    queryKey: ['order', id, token],
    queryFn: async () => (await api.get<CustomerOrder>(`/site/orders/${id}`, { t: token })).data,
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
    refetchInterval: (q) => (q.state.data && ['completed', 'cancelled'].includes(q.state.data.status) ? false : 10_000),
    refetchIntervalInBackground: false,
  });
}

/** Orders placed from this device, so customers can find them again. */
const RECENT = 'dd_recent_orders';
export function rememberOrder(host: string, id: string, token: string, number: number) {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as { host: string; id: string; token: string; number: number; at: number }[];
    const next = [{ host, id, token, number, at: Date.now() }, ...all.filter((o) => o.id !== id)].slice(0, 10);
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
export function recentOrders(host: string) {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as { host: string; id: string; token: string; number: number; at: number }[]).filter((o) => o.host === host);
  } catch {
    return [];
  }
}

export const STATUS_FLOW: Record<OrderType, OrderStatus[]> = {
  delivery: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'],
  takeaway: ['pending', 'confirmed', 'preparing', 'ready', 'completed'],
  dine_in: ['pending', 'confirmed', 'preparing', 'ready', 'completed'],
};

/** Loads Razorpay Checkout on demand (only when someone pays online). */
let razorpayScript: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  razorpayScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => {
      razorpayScript = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return razorpayScript;
}

/** Bill amounts in the visitor's language. */
export function useMoney() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
  const whole = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const paise = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // ₹285 for whole rupees, ₹14.25 / ₹157.50 when there are paise.
  return (v: string | number) => {
    const n = Number(v);
    return Math.round(n * 100) % 100 === 0 ? whole.format(n) : paise.format(n);
  };
}

/** Ticks every 30 s so relative times ("5 min ago") stay fresh. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
