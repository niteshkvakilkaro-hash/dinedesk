import { describe, expect, it } from 'vitest';
import { actionsSchema, geoSchema, menuSchema } from './schema';
import type { MenuCategory, SiteData } from './types';

const site = {
  name: 'Haveli', seo: { canonical: 'https://haveli.example.in' }, ordering: { enabled: true }, reservations: { enabled: false },
  hotel: null, geo: { lat: 26.9, lng: 75.8 },
} as unknown as SiteData;

const item = (p: Record<string, unknown>) => ({ id: 1, name: 'Dish', description: null, price: '100.00', food_type: 'veg', is_available: true, variants: [], ...p });
const menu = [
  { id: 1, name: 'Starters', items: [item({ name: 'Paneer Tikka', description: 'Grilled', price: '280' }), item({ name: 'Gone', is_available: false })] },
  { id: 2, name: 'Mains', items: [item({ name: 'Laal Maas', food_type: 'non_veg', variants: [{ name: 'Half', price: '220', is_available: true }, { name: 'Full', price: '420', is_available: true }, { name: 'Family', price: '800', is_available: false }] })] },
  { id: 3, name: 'Empty', items: [] },
] as unknown as MenuCategory[];

describe('schema.org data for search engines', () => {
  it('lists available dishes by section with rupee prices, sizes and the veg mark', () => {
    const m = menuSchema(site, menu);
    expect(m.url).toBe('https://haveli.example.in/menu');
    expect(m.hasMenuSection.map((s) => s.name)).toEqual(['Starters', 'Mains']);
    expect(m.hasMenuSection[0].hasMenuItem).toEqual([
      { '@type': 'MenuItem', name: 'Paneer Tikka', description: 'Grilled', suitableForDiet: 'https://schema.org/VegetarianDiet', offers: { '@type': 'Offer', price: '280.00', priceCurrency: 'INR' } },
    ]);
    expect(m.hasMenuSection[1].hasMenuItem[0].offers).toEqual([
      { '@type': 'Offer', name: 'Half', price: '220.00', priceCurrency: 'INR' },
      { '@type': 'Offer', name: 'Full', price: '420.00', priceCurrency: 'INR' },
    ]);
    expect(m.hasMenuSection[1].hasMenuItem[0]).not.toHaveProperty('suitableForDiet');
  });

  it('offers only the actions the business has switched on, and the map pin', () => {
    expect(actionsSchema(site)).toEqual([{ '@type': 'OrderAction', target: 'https://haveli.example.in/menu' }]);
    expect(geoSchema(site)).toEqual({ '@type': 'GeoCoordinates', latitude: 26.9, longitude: 75.8 });
    expect(geoSchema({ ...site, geo: null })).toBeNull();
  });
});
