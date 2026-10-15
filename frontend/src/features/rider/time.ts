import type { TFunction } from 'i18next';

/** Default: a rider's last position older than this shows grey on the map. */
export const STALE_MINUTES = 15;

/** Whole minutes since a time (never negative), or null without one. */
export function minutesSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

/** No position, or one older than `staleMinutes`. */
export function isStale(iso: string | null | undefined, now: number = Date.now(), staleMinutes: number = STALE_MINUTES): boolean {
  const m = minutesSince(iso, now);
  return m === null || m > staleMinutes;
}

/** "just now", "2 min ago", "3 h ago" (null when there is no time). */
export function agoText(t: TFunction, iso: string | null | undefined, now: number = Date.now()): string | null {
  const m = minutesSince(iso, now);
  if (m === null) return null;
  if (m < 1) return t('orders.justNow');
  if (m < 60) return t('orders.minutesAgo', { count: m });
  return t('riders.hoursAgo', { count: Math.floor(m / 60) });
}

/** Directions in Google Maps: to the pinned spot when the guest shared one, else to the address. */
export function directionsUrl(a: { line1?: string | null; line2?: string | null; landmark?: string | null; pincode?: string | null; lat?: number | null; lng?: number | null } | null | undefined): string | null {
  if (!a) return null;
  if (typeof a.lat === 'number' && typeof a.lng === 'number') return `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
  const text = [a.line1, a.line2, a.landmark, a.pincode].filter(Boolean).join(', ');
  return text ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}` : null;
}
