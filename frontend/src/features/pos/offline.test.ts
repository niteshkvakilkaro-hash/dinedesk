import { describe, expect, it } from 'vitest';
import { estimate, type OfflinePack } from './offline';
import type { TicketLine } from './api';

const line = (item_id: number, unit: number, quantity: number): TicketLine => ({
  key: String(item_id), item_id, variant_id: null, addon_ids: [], quantity, notes: '', name: `#${item_id}`, detail: '', unit, food_type: 'veg',
});

describe('offline price estimate (same rules as the server bill)', () => {
  const rates = { 1: 500, 2: 1800 };

  it('adds GST on top per dish, packaging, and rounds to the rupee', () => {
    const pack: OfflinePack = { prices_include_tax: false, packaging_fee: 1000, rates, at: '' };
    // Naan ₹60 × 2 at 5% = 120 + 6; Lassi ₹99.99 at 18% = 99.99 + 18.00 (17.998 rounded); + ₹10 packaging.
    const r = estimate([line(1, 60, 2), line(2, 99.99, 1)], pack);
    expect(r.tax).toBe(600 + 1800);
    expect(r.packaging).toBe(1000);
    expect(r.total).toBe(25400); // 253.99 → ₹254
  });

  it('takes GST out of prices that already include it', () => {
    const pack: OfflinePack = { prices_include_tax: true, packaging_fee: 0, rates, at: '' };
    const r = estimate([line(1, 105, 1)], pack);
    expect(r.tax).toBe(500); // 105 includes ₹5 at 5%
    expect(r.total).toBe(10500);
  });

  it('charges no packaging on an empty ticket and treats unknown dishes as tax free', () => {
    const pack: OfflinePack = { prices_include_tax: false, packaging_fee: 1000, rates, at: '' };
    expect(estimate([], pack).total).toBe(0);
    expect(estimate([line(9, 50, 1)], pack).tax).toBe(0);
  });
});
