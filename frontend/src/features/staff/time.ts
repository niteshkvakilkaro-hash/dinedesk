// Business times are shown in India time (as elsewhere in the dashboard).
const TZ = 'Asia/Kolkata';

/** "8h 30m" */
export function hm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/** 24-hour "HH:MM" of an ISO time, for inputs. */
export function hhmm(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(iso));
}

/** "9:20 am" of an ISO time. */
export function clockTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
}

/** "09:00" → "9 am", "17:30" → "5:30 pm" */
export function shortTime(hhmmValue: string) {
  const [h, m] = hhmmValue.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** Calendar arithmetic on "YYYY-MM-DD" strings. */
export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function dayLabel(ymd: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));
}
