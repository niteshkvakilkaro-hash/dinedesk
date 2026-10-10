import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { CustomerOrder, OrderStatus, PaymentMethod, SiteData } from './types';

/**
 * Dine-in by QR code. Scanning a table's QR (/t/{token}) remembers that table for
 * this browser tab session, so the cart orders "to Table 4". It is forgotten when the
 * tab closes, after a few hours, or when the guest leaves the table.
 */
export interface TableContext {
  token: string;
  label: string;
  at: number;
}

const KEY = 'dd_table';
const MAX_AGE = 6 * 60 * 60 * 1000;

function load(): TableContext | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as TableContext | null;
    return raw && raw.token && Date.now() - raw.at < MAX_AGE ? raw : null;
  } catch {
    return null;
  }
}

export const useTable = create<{ table: TableContext | null; join: (token: string, label: string) => void; leave: () => void }>((set) => ({
  table: typeof window === 'undefined' ? null : load(),
  join: (token, label) => {
    const table = { token, label, at: Date.now() };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(table));
    } catch {
      /* still works for this page view */
    }
    set({ table });
  },
  leave: () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ table: null });
  },
}));

/** The table this visitor is ordering for, if QR ordering is possible on this site. */
export function useActiveTable(site: SiteData | undefined): TableContext | null {
  const table = useTable((s) => s.table);
  if (!site || !site.features.qr_ordering) return null;
  return table;
}

export interface TableOrder {
  number: number;
  status: OrderStatus;
  placed_at: string;
  items: CustomerOrder['items'];
  subtotal: string;
  tax_total: string;
  total: string;
  payment_method: PaymentMethod;
  payment_status: CustomerOrder['payment_status'];
}

export interface TableView {
  label: string;
  area: string | null;
  seats: number;
  session: {
    opened_at: string;
    bill_requested: boolean;
    orders: TableOrder[];
    totals: { subtotal: string; tax_total: string; packaging_fee: string; total: string; paid: string; due: string; prices_include_tax: boolean };
  } | null;
  open_requests: ('waiter' | 'bill')[];
}

/** The table's running order, refreshed every 10 s while open. */
export function useTableView(token: string | null | undefined) {
  return useQuery({
    queryKey: ['site', 'table', token],
    queryFn: async () => (await api.get<TableView>(`/site/tables/${token}`)).data,
    enabled: !!token,
    refetchInterval: 10_000,
    retry: false,
  });
}
