import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { SiteData, SiteImage } from './types';

/**
 * In-room dining by QR code. Scanning a room's QR (/r/{token}) remembers the room for this
 * tab session, so the cart orders room service to it (charged to the room). Forgotten when
 * the tab closes, after a day, or when the guest leaves the room mode.
 */
export interface RoomContext {
  token: string;
  number: string;
  at: number;
}

const KEY = 'dd_room';
const MAX_AGE = 24 * 60 * 60 * 1000;

function load(): RoomContext | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as RoomContext | null;
    return raw && raw.token && Date.now() - raw.at < MAX_AGE ? raw : null;
  } catch {
    return null;
  }
}

export const useRoom = create<{ room: RoomContext | null; join: (token: string, number: string) => void; leave: () => void }>((set) => ({
  room: typeof window === 'undefined' ? null : load(),
  join: (token, number) => {
    const room = { token, number, at: Date.now() };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(room));
    } catch {
      /* still works for this page view */
    }
    set({ room });
  },
  leave: () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ room: null });
  },
}));

/** The room this visitor is ordering to, if room service is on for this site. */
export function useActiveRoom(site: SiteData | undefined): RoomContext | null {
  const room = useRoom((s) => s.room);
  if (!site?.hotel?.room_service) return null;
  return room;
}

export interface RoomTypeInfo {
  id: number;
  slug: string;
  name: string;
  name_hi: string | null;
  description: string | null;
  description_hi: string | null;
  photos: (SiteImage & { key: number; alt: string })[];
  amenities: string[];
  bed: string | null;
  size_sqft: number | null;
  base_occupancy: number;
  max_adults: number;
  max_children: number;
  base_price: string;
  weekend_price: string | null;
  extra_adult_price: string;
  extra_child_price: string;
  from_price: string;
}

export interface HotelPublic {
  online_booking: boolean;
  check_in_time: string;
  check_out_time: string;
  advance_percent: number;
  free_cancel_days: number;
  max_nights: number;
  max_days_ahead: number;
  charge_gst: boolean;
  house_rules: string | null;
  house_rules_hi: string | null;
  types: RoomTypeInfo[];
}

export interface StayQuote {
  nights: number;
  room_total: string;
  tax_total: string;
  total: string;
  rates: { date: string; price: string; tax_rate: string; tax: string; season: string | null; weekend: boolean }[];
}

export interface Availability {
  check_in: string;
  check_out: string;
  nights: number;
  types: { id: number; available: boolean; fits: boolean; few_left: number | null; quote: StayQuote | null }[];
}

export interface GuestStay {
  id: string;
  code: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  name: string;
  room_type: { name: string; name_hi: string | null };
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rates: { date: string; price: string; tax: string }[];
  room_total: string;
  tax_total: string;
  total: string;
  advance_due: string;
  paid: string;
  awaiting_payment: boolean;
  hold_expires_at: string | null;
  can_cancel: boolean;
  cancelled_by: string | null;
  requests: string | null;
}

export function useHotel(enabled = true) {
  return useQuery({
    queryKey: ['site', 'hotel'],
    queryFn: async () => (await api.get<HotelPublic>('/site/hotel')).data,
    // Server-rendered pages already have it.
    initialData: () => (typeof window !== 'undefined' ? (window.__ddSsr?.hotel as HotelPublic | undefined) : undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function useStayAvailability(search: { check_in: string; check_out: string; adults: number; children: number } | null) {
  return useQuery({
    queryKey: ['site', 'hotel', 'availability', search],
    queryFn: async () => (await api.get<Availability>('/site/hotel/availability', search!)).data,
    enabled: !!search,
    retry: false,
  });
}

export function useGuestStay(id: string | undefined, token: string | null) {
  return useQuery({
    queryKey: ['site', 'stay', id, token],
    queryFn: async () => (await api.get<GuestStay>(`/site/hotel/bookings/${id}`, { t: token ?? '' })).data,
    enabled: !!id && !!token,
    retry: false,
    // While an online advance is being confirmed, check again shortly.
    refetchInterval: (q) => (q.state.data?.awaiting_payment ? 5000 : false),
  });
}

/** Stays this browser booked, so a guest can find them again. */
const STAYS = 'dd_stays';
export function rememberStay(host: string, id: string, token: string, code: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(STAYS) ?? '[]') as { host: string; id: string; token: string; code: string; at: number }[]).filter((s) => s.id !== id);
    list.unshift({ host, id, token, code, at: Date.now() });
    localStorage.setItem(STAYS, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* ignore */
  }
}
export function rememberedStays(host: string) {
  try {
    return (JSON.parse(localStorage.getItem(STAYS) ?? '[]') as { host: string; id: string; token: string; code: string; at: number }[]).filter((s) => s.host === host);
  } catch {
    return [];
  }
}

/** YYYY-MM-DD helpers (no timezone shifts). */
export function ymdAdd(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function ymdToday(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}
export function ymdLabel(ymd: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = ymd.split('-').map(Number);
  // Indian English / Hindi ("Sat, 14 Nov"), never US order.
  const tag = locale.startsWith('hi') ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(tag, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
