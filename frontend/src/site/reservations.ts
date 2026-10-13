import { useQuery } from '@tanstack/react-query';
import { intlLocale } from '@/i18n/locale';
import { api } from '@/lib/api';

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'rejected' | 'cancelled' | 'no_show';

export interface GuestReservation {
  code: string;
  name: string;
  party_size: number;
  date: string;
  time: string;
  starts_at: string;
  status: ReservationStatus;
  notes: string | null;
  cancellable: boolean;
}

export interface DayAvailability {
  date: string;
  problem: { code: string; message: string } | null;
  slots: { time: string; available: boolean }[];
}

export function useAvailability(date: string | null, party: number) {
  return useQuery({
    queryKey: ['site', 'availability', date, party],
    queryFn: async () => (await api.get<DayAvailability>('/site/reservations/availability', { date: date!, party_size: party })).data,
    enabled: !!date,
    staleTime: 30_000,
  });
}

const KEY = 'dd_bookings';

/** Bookings made on this device, so the guest can find them again without typing the ID. */
export function rememberBooking(host: string, code: string, phone: string) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, { code: string; phone: string }[]>;
    all[host] = [{ code, phone }, ...(all[host] ?? []).filter((b) => b.code !== code)].slice(0, 5);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function rememberedBookings(host: string): { code: string; phone: string }[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, { code: string; phone: string }[]>)[host] ?? [];
  } catch {
    return [];
  }
}

/** "Sat, 14 Nov" in the visitor's language (dates are business-local, so read as UTC noon). */
export function formatDay(date: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(intlLocale(lang), { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** Business-local dates from today for `days` days. */
export function nextDates(timezone: string, days: number, now = Date.now()): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date(now));
  const base = new Date(`${today}T12:00:00Z`).getTime();
  return Array.from({ length: days + 1 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}
