import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePollInterval } from '@/lib/realtime';
import type { SiteImage } from '@/site/types';

export type StayStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type Housekeeping = 'clean' | 'dirty' | 'inspected' | 'out_of_order';
export type FolioMode = 'cash' | 'upi' | 'card' | 'online' | 'other';

export const AMENITIES = ['ac', 'wifi', 'tv', 'breakfast', 'geyser', 'balcony', 'view', 'minibar', 'kettle', 'workdesk', 'bathtub', 'room_service', 'parking', 'wheelchair', 'non_smoking', 'pet_friendly'] as const;
export const ID_TYPES = ['aadhaar', 'passport', 'driving_licence', 'voter_id', 'other'] as const;
export const FOLIO_MODES: FolioMode[] = ['cash', 'upi', 'card', 'other'];
export const HK_STATES: Housekeeping[] = ['clean', 'dirty', 'inspected', 'out_of_order'];
export const EVENT_TYPES = ['wedding', 'birthday', 'anniversary', 'corporate', 'other'] as const;
export const BANQUET_STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost'] as const;

export interface NightRate {
  date: string;
  price: string;
  tax_rate: string;
  tax: string;
  season: string | null;
  weekend: boolean;
}

export interface Stay {
  id: number;
  public_id: string;
  code: string;
  status: StayStatus;
  source: string;
  name: string;
  phone: string;
  email: string | null;
  adults: number;
  children: number;
  check_in: string;
  check_out: string;
  nights: number;
  room_type: { id: number; name: string };
  room: { id: number; number: string; housekeeping: Housekeeping } | null;
  total: string;
  advance_due: string;
  awaiting_payment: boolean;
  arrival_time: string | null;
  requests: string | null;
  created_at: string;
}

export interface FolioItem {
  id: number;
  type: 'room' | 'food' | 'extra' | 'discount';
  description: string;
  date: string;
  quantity: number;
  unit_price: string;
  amount: string;
  tax_rate: string;
  tax: string;
  order_id: number | null;
  voided: boolean;
  void_reason: string | null;
}

export interface StayDetail extends Stay {
  rates: NightRate[];
  room_total: string;
  tax_total: string;
  staff_note: string | null;
  company: string | null;
  gstin: string | null;
  id_type: string | null;
  id_last4: string | null;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  invoice: { id: number; number: string } | null;
  folio: {
    items: FolioItem[];
    payments: { id: number; kind: 'advance' | 'payment' | 'refund'; mode: FolioMode; amount: string; reference: string | null; received_at: string }[];
    summary: { charges: string; tax: string; total: string; paid: string; refunded: string; balance: string };
  };
  orders: { id: number; number: number; status: string; total: string; placed_at: string }[];
  documents: { id: number; doc_type: string; size: number; delete_after: string; created_at: string }[] | null;
}

export interface Today {
  date: string;
  arrivals: Stay[];
  departures: Stay[];
  in_house: Stay[];
  requests: Stay[];
  stats: { rooms: number; occupied: number; sold_tonight: number; free_tonight: number; dirty: number; out_of_order: number };
}

export interface CalendarStay { id: number; code: string; name: string; status: StayStatus; check_in: string; check_out: string; adults: number; children: number; room_id: number | null }
export interface CalendarData {
  from: string;
  days: number;
  types: { id: number; name: string; rooms: { id: number; number: string; housekeeping: Housekeeping; bookings: CalendarStay[] }[]; unassigned: CalendarStay[] }[];
}

export interface DeskAvailability {
  id: number;
  name: string;
  free: number;
  fits: boolean;
  free_rooms: { id: number; number: string; housekeeping: Housekeeping }[];
  quote: { nights: number; rates: NightRate[]; room_total: string; tax_total: string; total: string } | null;
}

export interface BoardRoom { id: number; number: string; floor: string | null; type: string; housekeeping: Housekeeping; note: string | null; changed_at: string | null; occupied: boolean; departing: boolean; arriving: boolean }

export interface RoomTypeRow {
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
  is_active: boolean;
  sort_order: number;
  rooms_count: number;
  rates: { id: number; name: string; starts_on: string; ends_on: string; price: string; weekend_price: string | null }[];
}

export interface RoomRow { id: number; number: string; floor: string | null; room_type_id: number; type: string | null; housekeeping: Housekeeping; housekeeping_note: string | null; is_active: boolean; sort_order: number; qr_token: string; qr_url: string }

export interface HotelSettings {
  online_booking: boolean;
  auto_confirm: boolean;
  check_in_time: string;
  check_out_time: string;
  advance_percent: number;
  hold_minutes: number;
  max_nights: number;
  max_days_ahead: number;
  free_cancel_days: number;
  charge_gst: boolean;
  house_rules: string | null;
  house_rules_hi: string | null;
  room_service: boolean;
  banquets: boolean;
  id_documents: boolean;
  id_keep_days: number;
}

export interface Banquet {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  event_type: (typeof EVENT_TYPES)[number];
  event_date: string | null;
  guests: number | null;
  message: string | null;
  status: (typeof BANQUET_STATUSES)[number];
  follow_up_on: string | null;
  notes: { at: string; by: string; text: string | null; status?: string }[];
  created_at: string;
}

export function useToday() {
  const interval = usePollInterval(30_000);
  return useQuery({ queryKey: ['hotel', 'today'], queryFn: async () => (await api.get<Today>('/tenant/hotel/today')).data, refetchInterval: interval });
}

export function useStay(id: number | null) {
  return useQuery({ queryKey: ['hotel', 'stay', id], queryFn: async () => (await api.get<StayDetail>(`/tenant/hotel/bookings/${id}`)).data, enabled: !!id });
}

export function useRoomTypes(enabled = true) {
  return useQuery({ queryKey: ['hotel', 'types'], queryFn: async () => (await api.get<RoomTypeRow[]>('/tenant/hotel/types')).data, enabled });
}

export function useRooms(enabled = true) {
  return useQuery({ queryKey: ['hotel', 'rooms'], queryFn: async () => (await api.get<RoomRow[]>('/tenant/hotel/rooms')).data, enabled });
}

export function useHotelSettings(enabled = true) {
  return useQuery({ queryKey: ['hotel', 'settings'], queryFn: async () => (await api.get<HotelSettings>('/tenant/hotel/settings')).data, enabled });
}

/** "12 Nov" from "2026-11-12" (no timezone shift). */
export function shortDate(ymd: string, withDay = false) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', ...(withDay ? { weekday: 'short' } : {}), timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Today in India as YYYY-MM-DD. */
export function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export const STATUS_TONE: Record<StayStatus, string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  checked_in: 'preparing',
  checked_out: 'completed',
  cancelled: 'cancelled',
  no_show: 'cancelled',
};
