import type { OpeningHours } from '@/types';
import { openStatus } from './openStatus';

const all = (open: string, close: string): OpeningHours => ({
  mon: { closed: false, open, close },
  tue: { closed: false, open, close },
  wed: { closed: false, open, close },
  thu: { closed: false, open, close },
  fri: { closed: false, open, close },
  sat: { closed: false, open, close },
  sun: { closed: false, open, close },
});

// 2026-11-08 is a Sunday. Times below are India time (UTC+5:30).
const ist = (local: string) => new Date(`${local}:00+05:30`);
const TZ = 'Asia/Kolkata';

describe('openStatus', () => {
  it('is open within hours and reports closing time', () => {
    const s = openStatus(all('11:00', '23:00'), TZ, [], ist('2026-11-08T14:00'));
    expect(s).toMatchObject({ is_open: true, closes_at: '23:00', today: 'sun', holiday: null });
  });

  it('reports the opening time before opening', () => {
    expect(openStatus(all('11:00', '23:00'), TZ, [], ist('2026-11-08T09:30'))).toMatchObject({ is_open: false, opens_at: '11:00' });
  });

  it('uses the business timezone, not the browser one', () => {
    // 05:00 UTC is 10:30 in India: not yet open.
    expect(openStatus(all('11:00', '23:00'), TZ, [], new Date('2026-11-08T05:00:00Z')).is_open).toBe(false);
  });

  it('carries late service past midnight', () => {
    const s = openStatus(all('18:00', '02:00'), TZ, [], ist('2026-11-09T01:00'));
    expect(s).toMatchObject({ is_open: true, closes_at: '02:00', today: 'mon' });
  });

  it('closes the whole day on a holiday', () => {
    const s = openStatus(all('11:00', '23:00'), TZ, [{ date: '2026-11-08', label: 'Diwali' }], ist('2026-11-08T14:00'));
    expect(s).toMatchObject({ is_open: false, holiday: { date: '2026-11-08', label: 'Diwali' } });
  });

  it('does not carry late service out of a holiday', () => {
    const s = openStatus(all('18:00', '02:00'), TZ, [{ date: '2026-11-08', label: null }], ist('2026-11-09T01:00'));
    expect(s.is_open).toBe(false);
  });

  it('respects closed days', () => {
    const hours = { ...all('11:00', '23:00'), sun: { closed: true, open: null, close: null } };
    expect(openStatus(hours, TZ, [], ist('2026-11-08T14:00')).is_open).toBe(false);
  });
});
