import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePollInterval } from '@/lib/realtime';
import { useSession } from '@/hooks/useSession';
import { keep, kept, type OfflinePack } from './offline';
import type { MenuCategory } from '@/site/types';

export type PayMode = 'cash' | 'upi' | 'card' | 'gift_card' | 'online' | 'other' | 'app';

export interface Bill {
  id: number;
  public_id: string;
  number: string;
  kind: 'tax_invoice' | 'bill';
  status: 'unpaid' | 'paid' | 'void';
  seller: { name: string; address: string; gstin: string | null; fssai: string | null; phone: string | null };
  buyer: { name: string | null; phone: string | null; gstin: string | null } | null;
  table: string | null;
  orders: { id: number; number: number; type: string }[];
  lines: { description: string; sac: string; quantity: number; unit_price: string; discount: string; taxable_value: string; tax_rate: string; cgst: string; sgst: string; total: string }[];
  items_total: string;
  discount: string;
  discount_reason: string | null;
  taxable_value: string;
  cgst: string;
  sgst: string;
  charges: string;
  round_off: string;
  total: string;
  paid: string;
  due: string;
  payments: { mode: PayMode; amount: string; reference: string | null; received_at: string }[];
  prices_include_tax: boolean;
  void_reason: string | null;
  issued_at: string;
  business_date: string;
  amount_in_words: string;
  /** The restaurant's UPI ID (for a QR with the amount due), when set. */
  upi: { vpa: string; payee: string } | null;
}

export interface OpenBills {
  tables: { session_id: number; table: string; opened_at: string; bill_requested: boolean; orders: number; total: string; invoice: { id: number; number: string; total: string; due: string } | null }[];
  orders: { id: number; number: number; type: string; source: string; status: string; customer_name: string; total: string; placed_at: string }[];
  bills: { id: number; number: string; total: string; due: string }[];
}

/** Line sent to the API (same shape as the website cart). */
export interface TicketLine {
  key: string;
  item_id: number;
  variant_id: number | null;
  addon_ids: number[];
  quantity: number;
  notes: string;
  // display
  name: string;
  detail: string;
  unit: number;
  food_type: 'veg' | 'non_veg' | 'egg';
}

/** The menu, kept on this device too so the counter can sell with no internet. */
export function usePosMenu() {
  const tenant = useSession().data?.tenant?.id;
  return useQuery({
    queryKey: ['pos-menu', tenant],
    queryFn: async () => {
      const data = (await api.get<MenuCategory[]>('/tenant/pos/menu')).data;
      if (tenant) keep(tenant, 'menu', data);
      return data;
    },
    initialData: () => (tenant ? kept<MenuCategory[]>(tenant, 'menu') : undefined),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
}

/** GST rates and charges for pricing sales offline (refreshed while online, kept on the device). */
export function usePosPack(enabled = true) {
  const tenant = useSession().data?.tenant?.id;
  return useQuery({
    queryKey: ['pos-pack', tenant],
    queryFn: async () => {
      const data = (await api.get<OfflinePack>('/tenant/pos/offline-pack')).data;
      if (tenant) keep(tenant, 'pack', data);
      return data;
    },
    initialData: () => (tenant ? kept<OfflinePack>(tenant, 'pack') : undefined),
    initialDataUpdatedAt: 0,
    staleTime: 10 * 60_000,
    enabled: enabled && Boolean(tenant),
  });
}

export function useOpenBills(enabled = true) {
  const interval = usePollInterval(10_000);
  return useQuery({ queryKey: ['pos-open'], queryFn: async () => (await api.get<OpenBills>('/tenant/pos/open')).data, enabled, refetchInterval: interval });
}

export const lineKey = (l: Pick<TicketLine, 'item_id' | 'variant_id' | 'addon_ids' | 'notes'>) => [l.item_id, l.variant_id ?? 0, [...l.addon_ids].sort().join('.'), l.notes.trim()].join('|');
