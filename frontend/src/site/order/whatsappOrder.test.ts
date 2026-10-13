import { describe, expect, it } from 'vitest';
import { whatsappOrder } from './Cart';
import { whatsappHref } from '../data';
import type { CartLine } from '../cart';

const line = (p: Partial<CartLine>): CartLine => ({
  key: 'k', item_id: 1, variant_id: null, addon_ids: [], quantity: 1, notes: '', name: 'Dish', name_hi: null, variant_name: null, addon_names: [], unit_price: 100, food_type: 'veg', image: null, ...p,
});
const money = (v: number) => `₹${v}`;
const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`;

describe('WhatsApp order message', () => {
  it('lists each dish with options, notes and price, then the total and lines to fill in', () => {
    const text = whatsappOrder([line({ quantity: 2, name: 'Dal Makhani', variant_name: 'Full', unit_price: 320 }), line({ name: 'Butter Naan', addon_names: ['Extra butter'], notes: 'well done', unit_price: 60 })], 'Haveli', money, t);
    expect(text.split('\n')).toEqual([
      'order.wa.hello{"name":"Haveli"}',
      '',
      '2 × Dal Makhani (Full) — ₹640',
      '1 × Butter Naan (Extra butter) – "well done" — ₹60',
      '',
      'order.wa.totalLine{"total":"₹700"}',
      '',
      'order.wa.fill',
    ]);
  });

  it('adds India\'s country code to a 10-digit number', () => {
    expect(whatsappHref('98765 43210', 'Hi')).toBe('https://wa.me/919876543210?text=Hi');
    expect(whatsappHref('+91 98765 43210')).toBe('https://wa.me/919876543210');
  });
});
