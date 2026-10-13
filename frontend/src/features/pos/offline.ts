import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '@/lib/api';
import type { TicketLine } from './api';

/*
 * Offline POS. While the internet is down, counter sales are saved on this device (with their
 * own id) and sent to the server as soon as the connection is back, where each becomes an order,
 * a GST bill and its payment, exactly once. Prices are worked out here the same way the server
 * does, from a pricing pack kept while online.
 */

export interface OfflinePack { prices_include_tax: boolean; packaging_fee: number; rates: Record<string, number>; at: string }
export type OfflineMode = 'cash' | 'upi' | 'card';
export interface OfflineSale {
  ref: string;
  at: string;
  items: { item_id: number; variant_id: number | null; addon_ids: number[]; quantity: number; notes: string | null }[];
  customer: { name: string | null; phone: string | null } | null;
  notes: string | null;
  payments: { mode: OfflineMode; amount: number }[];
  /** Rupees, as worked out on this device. */
  total: number;
  /** For the list on screen. */
  summary: string;
  state: 'waiting' | 'failed' | 'attention';
  message?: string;
  bill?: string;
}
interface SyncResult { ref: string; status: 'synced' | 'duplicate' | 'needs_attention' | 'failed'; bill?: string; message?: string }

const key = (tenant: number | string, what: string) => `dd_pos_${what}_${tenant}`;

export function keep(tenant: number | string, what: string, value: unknown) {
  try {
    localStorage.setItem(key(tenant, what), JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

export function kept<T>(tenant: number | string, what: string): T | undefined {
  try {
    const raw = localStorage.getItem(key(tenant, what));
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- the queue (shared by every component on the page) ---------- */

const listeners = new Set<() => void>();
const snapshots = new Map<string, OfflineSale[]>();

function readQueue(tenant: number | string): OfflineSale[] {
  const k = String(tenant);
  if (!snapshots.has(k)) snapshots.set(k, kept<OfflineSale[]>(tenant, 'queue') ?? []);
  return snapshots.get(k)!;
}

function writeQueue(tenant: number | string, list: OfflineSale[]) {
  snapshots.set(String(tenant), list);
  keep(tenant, 'queue', list);
  listeners.forEach((l) => l());
}

export function useQueue(tenant: number | string) {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readQueue(tenant),
  );
}

/** An id for this device, so ids from two counters never clash. */
function deviceId() {
  let id = '';
  try {
    id = localStorage.getItem('dd_pos_device') ?? '';
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem('dd_pos_device', id);
    }
  } catch {
    id = Math.random().toString(36).slice(2, 8);
  }
  return id;
}

export function addSale(tenant: number | string, sale: Omit<OfflineSale, 'ref' | 'at' | 'state'>): OfflineSale {
  const full: OfflineSale = { ...sale, ref: `${deviceId()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), state: 'waiting' };
  writeQueue(tenant, [...readQueue(tenant), full]);
  return full;
}

export function dropSale(tenant: number | string, ref: string) {
  writeQueue(tenant, readQueue(tenant).filter((s) => s.ref !== ref));
}

/** Sends waiting sales; synced ones leave the list, problems stay with the server's message. */
export async function syncQueue(tenant: number | string): Promise<{ synced: number; problems: number }> {
  const waiting = readQueue(tenant).filter((s) => s.state === 'waiting');
  let synced = 0;
  let problems = 0;
  for (let i = 0; i < waiting.length; i += 50) {
    const batch = waiting.slice(i, i + 50);
    const res = await api.post<{ results: SyncResult[] }>('/tenant/pos/offline-sync', {
      sales: batch.map(({ ref, at, items, customer, notes, payments, total }) => ({ ref, at, items, customer, notes, payments, total })),
    });
    const byRef = new Map(res.data.results.map((r) => [r.ref, r]));
    writeQueue(
      tenant,
      readQueue(tenant).flatMap((s) => {
        const r = byRef.get(s.ref);
        if (!r) return [s];
        if (r.status === 'synced' || r.status === 'duplicate') {
          synced++;
          return [];
        }
        problems++;
        return [{ ...s, state: r.status === 'failed' ? 'failed' : 'attention', message: r.message, bill: r.bill } as OfflineSale];
      }),
    );
  }
  return { synced, problems };
}

/* ---------- connection ---------- */

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

/** Sends the queue when the connection comes back, and every 20 s while anything is waiting. */
export function useAutoSync(tenant: number | string | undefined, onDone?: (r: { synced: number; problems: number }) => void) {
  const online = useOnline();
  const queue = useQueue(tenant ?? 'none');
  const [syncing, setSyncing] = useState(false);
  const waiting = queue.filter((s) => s.state === 'waiting').length;
  const run = useCallback(async () => {
    if (!tenant || syncing) return;
    setSyncing(true);
    try {
      const r = await syncQueue(tenant);
      if (r.synced || r.problems) onDone?.(r);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 0)) throw e;
    } finally {
      setSyncing(false);
    }
  }, [tenant, syncing, onDone]);
  useEffect(() => {
    if (!online || !waiting) return;
    void run().catch(() => undefined);
    const timer = window.setInterval(() => void run().catch(() => undefined), 20_000);
    return () => window.clearInterval(timer);
  }, [online, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  return { online, queue, waiting, syncing, syncNow: run };
}

/* ---------- prices, the server's way ---------- */

const divRound = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

/** Total in paise for a takeaway sale: GST per dish (on top or within), packaging, rounded to the rupee. */
export function estimate(lines: TicketLine[], pack: OfflinePack): { total: number; tax: number; packaging: number } {
  let gross = 0;
  let tax = 0;
  for (const l of lines) {
    const lineGross = Math.round(l.unit * 100) * l.quantity;
    const rate = pack.rates[String(l.item_id)] ?? 0;
    const lineTax = pack.prices_include_tax ? divRound(lineGross * rate, 10000 + rate) : divRound(lineGross * rate, 10000);
    tax += lineTax;
    gross += pack.prices_include_tax ? lineGross : lineGross + lineTax;
  }
  const packaging = lines.length ? pack.packaging_fee : 0;
  return { total: Math.round((gross + packaging) / 100) * 100, tax, packaging };
}
