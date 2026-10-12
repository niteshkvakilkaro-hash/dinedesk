import { describe, expect, it } from 'vitest';
import type { MenuCategory, MenuItem } from '../types';
import { reorderLines } from './reorder';

const dish = (over: Partial<MenuItem>): MenuItem => ({
  id: 1, name: 'Dal', name_hi: null, description: null, description_hi: null, price: '200', food_type: 'veg', spice_level: 0, allergens: [], diet_tags: [],
  is_available: true, is_bestseller: false, is_chefs_special: false, image: null, is_demo: false, variants: [], addon_groups: [], ...over,
});

const menu = [
  {
    id: 1, slug: 'mains', name: 'Mains', name_hi: null, is_demo: false,
    items: [
      dish({ id: 1, name: 'Dal', price: '210' }),
      dish({
        id: 2, name: 'Biryani', price: '250',
        variants: [
          { id: 20, name: 'Half', name_hi: null, price: '250', is_default: true, is_available: true },
          { id: 21, name: 'Full', name_hi: null, price: '420', is_default: false, is_available: true },
        ],
        addon_groups: [{ id: 5, name: 'Extras', name_hi: null, min_select: 0, max_select: null, addons: [{ id: 50, name: 'Raita', name_hi: null, price: '40', food_type: 'veg', is_available: true }] }],
      }),
      dish({ id: 3, name: 'Kheer', is_available: false }),
    ],
  },
] as unknown as MenuCategory[];

const line = (over: Record<string, unknown>) => ({ item_id: 1, name: 'Dal', name_hi: null, variant_name: null, addons: [], food_type: 'veg' as const, unit_price: '200', quantity: 1, tax_rate: '5', line_total: '210', notes: null, ...over });

describe('order again', () => {
  it('uses today\'s prices, sizes and extras', () => {
    const { lines, missing } = reorderLines({ items: [line({ quantity: 2, notes: 'less oil' }), line({ item_id: 2, name: 'Biryani', variant_name: 'Full', addons: [{ name: 'Raita', price: '30' }, { name: 'Papad', price: '10' }] })] }, menu);
    expect(missing).toEqual([]);
    expect(lines[0]).toMatchObject({ item_id: 1, quantity: 2, unit_price: 210, notes: 'less oil' });
    // Raita is still offered (now ₹40); Papad is gone and is dropped.
    expect(lines[1]).toMatchObject({ item_id: 2, variant_id: 21, addon_ids: [50], unit_price: 460 });
  });

  it('reports dishes and sizes that are no longer available', () => {
    const { lines, missing } = reorderLines({ items: [line({ item_id: 3, name: 'Kheer' }), line({ item_id: 99, name: 'Old dish' }), line({ item_id: 2, name: 'Biryani', variant_name: 'Family' }), line({ item_id: null, name: 'Deleted' })] }, menu);
    expect(lines).toEqual([]);
    expect(missing).toEqual(['Kheer', 'Old dish', 'Biryani (Family)', 'Deleted']);
  });
});
