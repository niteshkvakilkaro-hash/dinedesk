import { describe, expect, it } from 'vitest';
import { orderEstimate } from './eta';

const base = {
  type: 'takeaway' as const,
  status: 'pending' as const,
  placed_at: '2026-10-12T14:00:00Z',
  scheduled_for: null,
  timeline: [{ status: 'pending' as const, at: '2026-10-12T14:00:00Z' }],
  payment_method: 'counter' as const,
  payment_status: 'unpaid' as const,
};
const t = (iso: string) => new Date(iso).getTime();

describe('order estimate', () => {
  it('counts prep time from confirmation, plus delivery time for deliveries', () => {
    expect(orderEstimate(base, 25, 30, t('2026-10-12T14:05:00Z'))).toEqual({ kind: 'ready', at: new Date('2026-10-12T14:25:00Z'), late: false });
    const confirmed = { ...base, type: 'delivery' as const, status: 'confirmed' as const, timeline: [...base.timeline, { status: 'confirmed' as const, at: '2026-10-12T14:10:00Z' }] };
    expect(orderEstimate(confirmed, 25, 30, t('2026-10-12T14:12:00Z'))?.at).toEqual(new Date('2026-10-12T15:05:00Z'));
    const out = { ...confirmed, status: 'out_for_delivery' as const, timeline: [...confirmed.timeline, { status: 'out_for_delivery' as const, at: '2026-10-12T14:40:00Z' }] };
    expect(orderEstimate(out, 25, 30, t('2026-10-12T14:45:00Z'))?.at).toEqual(new Date('2026-10-12T15:10:00Z'));
  });

  it('says when it is running late', () => {
    expect(orderEstimate(base, 25, 30, t('2026-10-12T14:40:00Z'))?.late).toBe(true);
  });

  it('shows nothing for scheduled, unpaid online, ready pickups and finished orders', () => {
    expect(orderEstimate({ ...base, scheduled_for: '2026-10-12T19:00:00Z' }, 25, 30)).toBeNull();
    expect(orderEstimate({ ...base, payment_method: 'online' as const }, 25, 30)).toBeNull();
    expect(orderEstimate({ ...base, status: 'ready' as const }, 25, 30)).toBeNull();
    expect(orderEstimate({ ...base, status: 'completed' as const }, 25, 30)).toBeNull();
  });
});
