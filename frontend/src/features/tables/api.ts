import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { playChime, useAlertPrefs } from '@/features/orders/alerts';
import type { TableOrder } from '@/site/table';

export interface TableRow {
  id: number;
  label: string;
  seats: number;
  area: string | null;
  is_active: boolean;
  sort_order: number;
  qr_url: string;
}

export interface LiveTable {
  id: number;
  label: string;
  seats: number;
  area: string | null;
  is_active: boolean;
  state: 'free' | 'occupied' | 'bill_requested' | 'inactive';
  session: { id: number; opened_at: string; orders_count: number; active_orders: number; items_count: number; total: string } | null;
  requests: { id: number; type: 'waiter' | 'bill'; created_at: string }[];
  booking: { code: string; name: string; party_size: number; time: string; status: string } | null;
}

export interface TableBill {
  session_id: number;
  table: string;
  status: 'open' | 'closed';
  opened_at: string;
  bill_requested_at: string | null;
  orders: (TableOrder & { id: number; customer_name: string })[];
  totals: { subtotal: string; tax_total: string; packaging_fee: string; total: string; paid: string; due: string; prices_include_tax: boolean };
}

export function useTables(enabled = true) {
  return useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get<{ tables: TableRow[]; business: string }>('/tenant/tables')).data,
    enabled,
  });
}

export function useLiveTables(enabled = true) {
  return useQuery({
    queryKey: ['tables-live'],
    queryFn: async () => (await api.get<{ tables: LiveTable[] }>('/tenant/tables/live')).data.tables,
    enabled,
    refetchInterval: 8_000,
  });
}

interface TableFeed {
  latest_id: number;
  new: { id: number; type: 'waiter' | 'bill'; table: string | null }[];
  open: number;
}

/** Polls for waiter / bill requests (chime + callback) and returns the open count. */
export function useTableAlerts(enabled: boolean, onNew?: (items: TableFeed['new']) => void) {
  const qc = useQueryClient();
  const last = useRef<number | null>(null);
  const sound = useAlertPrefs((s) => s.sound);
  const query = useQuery({
    queryKey: ['tables-feed'],
    queryFn: async () => (await api.get<TableFeed>('/tenant/tables/feed', { after: last.current ?? 0 })).data,
    enabled,
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    const feed = query.data;
    if (!feed) return;
    if (last.current === null) {
      last.current = feed.latest_id;
      return;
    }
    const fresh = feed.new.filter((r) => r.id > (last.current ?? 0));
    last.current = Math.max(last.current, feed.latest_id);
    if (!fresh.length) return;
    if (sound) playChime();
    void qc.invalidateQueries({ queryKey: ['tables-live'] });
    onNew?.(fresh);
  }, [query.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return query.data;
}
