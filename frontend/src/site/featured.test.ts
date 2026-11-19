import { describe, expect, it } from 'vitest';
import { featuredItems } from './data';
import type { MenuCategory, MenuItem } from './types';

const item = (id: number, extra: Partial<MenuItem> = {}) => ({ id, is_available: true, is_bestseller: false, is_chefs_special: false, ...extra }) as MenuItem;
const menu = (items: MenuItem[]) => [{ id: 1, items } as unknown as MenuCategory];

describe('featuredItems', () => {
  it('puts bestsellers and specials first and tops up with other dishes', () => {
    const list = featuredItems(menu([item(1), item(2, { is_bestseller: true }), item(3), item(4, { is_chefs_special: true }), item(5), item(6), item(7)]), 6, 3);
    expect(list.map((i) => i.id)).toEqual([2, 4, 1, 3, 5, 6]);
  });

  it('keeps whole rows, so no card sits alone on a second row', () => {
    expect(featuredItems(menu([1, 2, 3, 4].map((n) => item(n))), 6, 3)).toHaveLength(3);
    expect(featuredItems(menu([1, 2, 3, 4, 5].map((n) => item(n))), 4, 2)).toHaveLength(4);
    expect(featuredItems(menu([1, 2].map((n) => item(n))), 6, 3)).toHaveLength(2);
  });

  it('skips dishes that are not available', () => {
    expect(featuredItems(menu([item(1, { is_available: false }), item(2)]), 6, 3).map((i) => i.id)).toEqual([2]);
  });
});
