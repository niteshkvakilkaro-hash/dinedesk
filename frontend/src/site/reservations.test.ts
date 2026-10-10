import { formatDay, nextDates } from './reservations';

describe('booking dates', () => {
  it('lists business-local days from today, across the IST midnight', () => {
    // 20:00 UTC on 10 Oct is already 01:30 on 11 Oct in India.
    const now = Date.parse('2026-10-10T20:00:00Z');
    expect(nextDates('Asia/Kolkata', 2, now)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
    expect(nextDates('UTC', 0, now)).toEqual(['2026-10-10']);
  });

  it('crosses month ends', () => {
    expect(nextDates('Asia/Kolkata', 2, Date.parse('2026-10-31T06:00:00Z'))).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('formats a local date the same everywhere', () => {
    expect(formatDay('2026-11-14', 'en', { weekday: 'short', day: 'numeric', month: 'short' })).toBe('Sat, 14 Nov');
  });
});
