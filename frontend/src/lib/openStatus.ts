import type { DayKey, OpeningHours } from '@/types';

export interface Holiday {
  date: string; // YYYY-MM-DD in the business's timezone
  label: string | null;
}

export interface OpenStatus {
  is_open: boolean;
  closes_at: string | null;
  opens_at: string | null;
  today: DayKey;
  holiday: Holiday | null;
}

const WEEKDAYS: Record<string, DayKey> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
const ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Wall-clock parts of `now` in the business's timezone. */
function zoned(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: WEEKDAYS[parts.weekday],
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function previousDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const mins = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);

/**
 * Same rules as the server's OpeningHours::status, so the badge stays live
 * between refreshes: overnight service carries past midnight (unless last
 * night was a holiday), and a holiday closes the whole day.
 */
export function openStatus(hours: OpeningHours, timeZone: string, holidays: Holiday[] = [], now = new Date()): OpenStatus {
  const z = zoned(now, timeZone);
  const yesterday = ORDER[(ORDER.indexOf(z.day) + 6) % 7];
  const holidayOn = (date: string) => holidays.find((h) => h.date === date) ?? null;
  const base = { today: z.day, holiday: null as Holiday | null };

  const y = hours[yesterday];
  if (y && !y.closed && !holidayOn(previousDate(z.date)) && mins(y.close) <= mins(y.open) && z.minutes < mins(y.close)) {
    return { ...base, is_open: true, closes_at: y.close, opens_at: null };
  }

  const holiday = holidayOn(z.date);
  if (holiday) return { ...base, holiday, is_open: false, closes_at: null, opens_at: null };

  const d = hours[z.day];
  if (d && !d.closed) {
    const open = mins(d.open);
    const close = mins(d.close);
    if (z.minutes >= open && (close <= open || z.minutes < close)) return { ...base, is_open: true, closes_at: d.close, opens_at: null };
    if (z.minutes < open) return { ...base, is_open: false, closes_at: null, opens_at: d.open };
  }
  return { ...base, is_open: false, closes_at: null, opens_at: null };
}
