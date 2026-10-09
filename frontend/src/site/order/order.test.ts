import type { OpeningHours } from '@/types';
import { scheduleSlots, zonedToUtc } from './schedule';
import { apiLines, cartCount, useCart } from '../cart';

const week = (open: string, close: string): OpeningHours =>
  Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { closed: false, open, close }])) as OpeningHours;

describe('scheduled order slots', () => {
  it('converts business wall time to UTC', () => {
    expect(zonedToUtc('2026-11-10', '19:30', 'Asia/Kolkata').toISOString()).toBe('2026-11-10T14:00:00.000Z');
    expect(zonedToUtc('2026-11-10', '00:15', 'Asia/Kolkata').toISOString()).toBe('2026-11-09T18:45:00.000Z');
  });

  it('starts after the prep time, steps by 15 minutes and stops before closing', () => {
    const now = Date.parse('2026-11-10T07:30:00Z'); // 1:00 pm IST
    const days = scheduleSlots(week('11:00', '23:00'), [], 'Asia/Kolkata', 30, 1, now, 'en');
    expect(days[0].date).toBe('2026-11-10');
    expect(days[0].slots[0].value).toBe('2026-11-10T08:00:00.000Z'); // 1:30 pm
    expect(days[0].slots.at(-1)!.value).toBe('2026-11-10T17:15:00.000Z'); // 10:45 pm
    expect(days[1].slots[0].value).toBe('2026-11-11T05:30:00.000Z'); // 11:00 am next day
  });

  it('skips holidays and closed days', () => {
    const hours = { ...week('11:00', '23:00'), wed: { closed: true, open: null, close: null } };
    const days = scheduleSlots(hours, [{ date: '2026-11-12', label: 'Holiday' }], 'Asia/Kolkata', 30, 3, Date.parse('2026-11-10T07:30:00Z'));
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-13']); // Wed 11th closed, Thu 12th holiday
  });
});

describe('cart', () => {
  beforeEach(() => useCart.setState({ lines: [], type: null }));
  const base = { item_id: 1, variant_id: 2, addon_ids: [5], quantity: 1, notes: '', name: 'Dal', name_hi: null, variant_name: 'Full', addon_names: ['Butter'], unit_price: 280, food_type: 'veg' as const, image: null };

  it('merges identical lines and keeps different choices apart', () => {
    useCart.getState().add(base);
    useCart.getState().add({ ...base, quantity: 2 });
    useCart.getState().add({ ...base, addon_ids: [] });
    const { lines } = useCart.getState();
    expect(lines).toHaveLength(2);
    expect(cartCount(lines)).toBe(4);
    expect(apiLines(lines)[0]).toEqual({ item_id: 1, variant_id: 2, addon_ids: [5], quantity: 3, notes: null });
  });

  it('caps quantity and removes at zero', () => {
    useCart.getState().add({ ...base, quantity: 60 });
    const key = useCart.getState().lines[0].key;
    expect(useCart.getState().lines[0].quantity).toBe(50);
    useCart.getState().setQuantity(key, 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });
});
