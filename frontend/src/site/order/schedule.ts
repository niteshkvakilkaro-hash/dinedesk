import type { DayKey, OpeningHours } from '@/types';
import { intlLocale } from '@/i18n/locale';
import type { Holiday } from '@/lib/openStatus';

const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Milliseconds the timezone is ahead of UTC at a given instant. */
function tzOffset(ts: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ts))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
}

/** "2026-11-10" + "19:30" in the business's timezone → UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - tzOffset(guess - tzOffset(guess, timeZone), timeZone));
}

export function zonedDate(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

export interface SlotDay {
  date: string; // YYYY-MM-DD (business timezone)
  slots: { value: string; label: string }[]; // value = ISO UTC
}

/**
 * Pickup / delivery times in 15-minute steps within opening hours, from
 * (now + prep time) up to `maxDays` ahead, skipping closed days and holidays.
 */
export function scheduleSlots(hours: OpeningHours, holidays: Holiday[], timeZone: string, prepMinutes: number, maxDays: number, now = Date.now(), lang = 'en'): SlotDay[] {
  const earliest = now + prepMinutes * 60_000;
  const out: SlotDay[] = [];
  const fmt = new Intl.DateTimeFormat(intlLocale(lang), { timeZone, hour: 'numeric', minute: '2-digit' });
  for (let i = 0; i <= maxDays; i++) {
    const date = zonedDate(now + i * 86_400_000, timeZone);
    const weekday = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const h = hours[weekday];
    if (!h || h.closed || !h.open || !h.close || holidays.some((x) => x.date === date)) continue;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const start = toMin(h.open);
    const end = toMin(h.close) <= start ? 24 * 60 - 15 : toMin(h.close) - 15; // last order 15 min before closing
    const slots: SlotDay['slots'] = [];
    for (let m = Math.ceil(start / 15) * 15; m <= end; m += 15) {
      const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const at = zonedToUtc(date, time, timeZone);
      if (at.getTime() >= earliest) slots.push({ value: at.toISOString(), label: fmt.format(at) });
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}
