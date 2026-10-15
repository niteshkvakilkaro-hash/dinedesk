import { describe, expect, it } from 'vitest';
import { absoluteUrl, actionsSchema, businessSchema, geoSchema, menuSchema, openingHoursSchema } from './schema';
import type { HotelPublic } from './hotel';
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

  it('reads past-midnight hours the way Google does and skips closed days', () => {
    const hours = { mon: { closed: false, open: '18:00', close: '02:00' }, tue: { closed: true, open: null, close: null } } as unknown as SiteData['opening_hours'];
    expect(openingHoursSchema(hours)).toEqual([{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '18:00', closes: '02:00' }]);
    expect(openingHoursSchema(null)).toEqual([]);
  });

  it('makes relative image addresses absolute', () => {
    expect(absoluteUrl('/storage/a.webp', 'https://haveli.example.in')).toBe('https://haveli.example.in/storage/a.webp');
    expect(absoluteUrl('https://cdn.example/a.webp', 'https://haveli.example.in')).toBe('https://cdn.example/a.webp');
    expect(absoluteUrl(null, 'https://haveli.example.in')).toBeNull();
  });

  it('describes the business only from what the owner entered (no ratings, even with published reviews)', () => {
    const full = {
      ...site,
      business_type: 'restaurant',
      city: 'Jaipur',
      has_menu: true,
      opening_hours: null,
      theme: { logo: { src: '/storage/logo.webp' } },
      reservations: { enabled: true },
      content: { contact: { phone: '0141 222 3333', email: null, address: 'MI Road, Jaipur 302001', map_url: null }, socials: { instagram: 'https://instagram.com/haveli', facebook: null, youtube: '' } },
      growth: { reviews: { count: 12, average: 4.8, items: [] } },
      seo: { canonical: 'https://haveli.example.in', image: '/storage/cover.webp' },
    } as unknown as SiteData;
    const ld = businessSchema(full, { path: '/', menu });
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': 'https://haveli.example.in/#business',
      url: 'https://haveli.example.in/',
      image: 'https://haveli.example.in/storage/cover.webp',
      logo: 'https://haveli.example.in/storage/logo.webp',
      telephone: '0141 222 3333',
      address: { '@type': 'PostalAddress', streetAddress: 'MI Road, Jaipur 302001', addressLocality: 'Jaipur', postalCode: '302001', addressCountry: 'IN' },
      hasMenu: 'https://haveli.example.in/menu',
      acceptsReservations: true,
      sameAs: ['https://instagram.com/haveli'],
    });
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('review');
    expect(ld).not.toHaveProperty('priceRange');
    expect(ld).not.toHaveProperty('servesCuisine');
    expect(JSON.parse(JSON.stringify(ld))).toEqual(ld);
  });

  it('lists a hotel’s rooms with their starting price on the rooms page', () => {
    const hotelSite = { ...site, business_type: 'hotel', has_menu: false, opening_hours: null, theme: { logo: null }, content: { contact: {}, socials: {} }, hotel: { has_rooms: true, online_booking: true, check_in_time: '12:00', check_out_time: '11:00' }, reservations: { enabled: false }, seo: { canonical: 'https://stay.example.in', image: null } } as unknown as SiteData;
    const hotel = { types: [{ name: 'Deluxe', description: null, photos: [{ src: '/storage/room.webp' }], bed: 'King', size_sqft: 280, max_adults: 2, max_children: 1, from_price: '3500', amenities: ['Wi-Fi'] }] } as unknown as HotelPublic;
    const ld = businessSchema(hotelSite, { path: '/rooms', hotel });
    expect(ld['@type']).toBe('Hotel');
    expect(ld).toMatchObject({ checkinTime: '12:00', checkoutTime: '11:00', potentialAction: [{ '@type': 'OrderAction' }, { '@type': 'ReserveAction', target: 'https://stay.example.in/rooms' }] });
    expect((ld as unknown as { makesOffer: unknown[] }).makesOffer[0]).toMatchObject({
      '@type': 'Offer', price: '3500.00', priceCurrency: 'INR',
      itemOffered: { '@type': 'HotelRoom', name: 'Deluxe', image: 'https://stay.example.in/storage/room.webp', bed: 'King', occupancy: { maxValue: 3 } },
    });
    expect(businessSchema(hotelSite, { path: '/', hotel })).not.toHaveProperty('makesOffer');
    expect(ld).not.toHaveProperty('hasMenu');
  });
});
