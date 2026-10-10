import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { playChime, useAlertPrefs } from '@/features/orders/alerts';
import type { Holiday } from '@/lib/openStatus';
import type { ReservationStatus } from '@/site/reservations';

export interface StaffReservation {
  id: number;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  party_size: number;
  date: string;
  time: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  source: 'website' | 'phone' | 'walk_in';
  notes: string | null;
  staff_note: string | null;
  cancelled_by: 'guest' | 'staff' | null;
  table: { id: number; label: string; seats: number } | null;
  created_at: string;
  next: ReservationStatus[];
  cancellable: boolean;
}

export interface ReservationList {
  date: string;
  reservations: StaffReservation[];
  tables: { id: number; label: string; seats: number }[];
  summary: { bookings: number; guests: number; pending: number };
}

export interface ReservationSettings {
  enabled: boolean;
  auto_confirm: boolean;
  slot_minutes: number;
  duration_minutes: number;
  default_capacity: number;
  min_party: number;
  max_party: number;
  lead_minutes: number;
  max_days: number;
  reminder_hours: number;
  match_tables: boolean;
  blackout_dates: Holiday[];
}

export interface Slot {
  day: string;
  time: string;
  capacity: number;
  is_active: boolean;
}

export interface SettingsPayload {
  settings: ReservationSettings;
  slots: Slot[];
  custom_slots: boolean;
  opening_hours: Record<string, { closed: boolean; open: string | null; close: string | null }> | null;
}

export interface StaffAvailability {
  date: string;
  problem: { code: string; message: string } | null;
  slots: { time: string; available: boolean; reason: string | null; capacity: number; booked: number; table_id: number | null }[];
}

export function useReservations(params: { date: string; status: string; q: string }) {
  return useQuery({
    queryKey: ['reservations', params],
    queryFn: async () => (await api.get<ReservationList>('/tenant/reservations', { date: params.date, status: params.status || undefined, q: params.q || undefined })).data,
    refetchInterval: 20_000,
  });
}

export function useReservationSettings() {
  return useQuery({ queryKey: ['reservation-settings'], queryFn: async () => (await api.get<SettingsPayload>('/tenant/reservations/settings')).data });
}

interface ReservationFeed {
  latest_id: number;
  new: { id: number; code: string; name: string; party_size: number; date: string; time: string; status: ReservationStatus }[];
  pending: number;
}

/** Polls for new website bookings (chime + callback) and returns the pending count. */
export function useReservationAlerts(enabled: boolean, onNew?: (items: ReservationFeed['new']) => void) {
  const qc = useQueryClient();
  const last = useRef<number | null>(null);
  const sound = useAlertPrefs((s) => s.sound);
  const query = useQuery({
    queryKey: ['reservations-feed'],
    queryFn: async () => (await api.get<ReservationFeed>('/tenant/reservations/feed', { after: last.current ?? 0 })).data,
    enabled,
    refetchInterval: 15_000,
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
    void qc.invalidateQueries({ queryKey: ['reservations'] });
    onNew?.(fresh);
  }, [query.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return query.data;
}

/** Business-local "today" as YYYY-MM-DD. */
export function todayIn(timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function shiftDate(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
