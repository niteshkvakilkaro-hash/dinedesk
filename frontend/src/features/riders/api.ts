import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui';
import type { OrderStatus } from '@/site/types';

export interface RiderOrderBrief {
  id: number;
  number: number;
  status: OrderStatus;
  customer_name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  total: string;
  payment_method: string;
  placed_at: string;
}

export interface RiderRow {
  id: number;
  name: string;
  phone: string | null;
  on_duty: boolean;
  duty_started_at: string | null;
  last: { lat: number; lng: number; accuracy_m: number | null; battery: number | null; at: string } | null;
  orders: RiderOrderBrief[];
}

export interface RidersData {
  riders: RiderRow[];
  unassigned: RiderOrderBrief[];
  staleMinutes: number;
  intervalSec: number;
}

/** Riders, their last positions and orders (refreshed live, and every 30 s as a fallback). */
export function useRiders(enabled = true) {
  return useQuery({
    queryKey: ['riders'],
    queryFn: async (): Promise<RidersData> => {
      const res = await api.get<{ riders: RiderRow[]; unassigned: RiderOrderBrief[] }>('/tenant/riders');
      const meta = (res.meta ?? {}) as { stale_minutes?: number; interval_sec?: number };
      return { ...res.data, staleMinutes: meta.stale_minutes ?? 15, intervalSec: meta.interval_sec ?? 300 };
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useRiderTrail(riderId: number | null) {
  return useQuery({
    queryKey: ['rider-trail', riderId],
    queryFn: async () => (await api.get<{ points: { lat: number; lng: number; at: string }[] }>(`/tenant/riders/${riderId}/trail`)).data.points,
    enabled: !!riderId,
    refetchInterval: 60_000,
  });
}

/** Give a delivery order to a rider (null takes it back). */
export function useAssignRider() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { orderId: number; riderId: number | null }>({
    mutationFn: ({ orderId, riderId }) => api.post(`/tenant/orders/${orderId}/rider`, { rider_id: riderId }),
    onSuccess: (_r, v) => {
      toast.success(v.riderId ? t('riders.assigned') : t('riders.unassigned'));
      for (const k of ['riders', 'orders', 'order-detail']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e.message),
  });
}
