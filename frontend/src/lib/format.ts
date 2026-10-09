const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** ₹1,25,000 / ₹1,665.83 */
export function formatINR(value: number | string | null | undefined): string {
  return inr.format(Number(value ?? 0));
}

/** Timestamps are stored in UTC; show them in IST (or the business's zone). */
export function formatDateTime(iso: string | null | undefined, timeZone = 'Asia/Kolkata'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, timeZone = 'Asia/Kolkata'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** "23:00" → "11:00 PM" */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "+919829012345" → "+91 98290 12345" */
export function formatPhone(phone: string | null | undefined): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone ?? '');
  return m ? `+91 ${m[1]} ${m[2]}` : (phone ?? '');
}

export const isIndianMobile = (v: string) => /^(\+?91|0)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, ''));

export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
