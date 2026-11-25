import { describe, expect, it } from 'vitest';
import type { MenuCategory, MenuItem } from '../types';
import { pairings } from './pairings';

const item = (id: number, extra: Partial<MenuItem> = {}) => ({ id, name: `D${id}`, is_available: true, is_bestseller: false, is_chefs_special: false, image: null, variants: [], addon_groups: [], ...extra }) as unknown as MenuItem;
const cat = (id: number, name: string, items: MenuItem[]) => ({ id, name, slug: name.toLowerCase(), items }) as unknown as MenuCategory;

const menu = [
  cat(1, 'Mains', [item(1), item(2, { is_bestseller: true }), item(3)]),
  cat(2, 'Breads', [item(4), item(5, { is_available: false })]),
  cat(3, 'Desserts', [item(6), item(7, { is_chefs_special: true })]),
  cat(4, 'Drinks', [item(8)]),
];

describe('pairings', () => {
  it('suggests nothing for an empty cart', () => {
    expect(pairings(menu, [])).toEqual([]);
  });

  it('puts a dessert or drink first, one dish per category, never what is in the cart', () => {
    const ids = pairings(menu, [1]).map((i) => i.id);
    expect(ids[0]).toBe(7);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(5);
    expect(new Set(ids.map((id) => menu.find((c) => c.items.some((i) => i.id === id))!.id)).size).toBe(3);
  });

  it('stops pushing sweets once the cart has one', () => {
    const ids = pairings(menu, [6]).map((i) => i.id);
    expect(ids[0]).toBe(2);
  });
});
