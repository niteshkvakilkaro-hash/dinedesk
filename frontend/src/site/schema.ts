import type { OpeningHours } from '@/types';
import type { HotelPublic } from './hotel';
import type { MenuCategory, SiteData } from './types';

/*
 * schema.org data for search engines (Google shows menus, hours, actions and the map pin from it).
 * Built only from what the business entered: no ratings, reviews or price ranges are made up.
 * (Published guest reviews are shown on the page but deliberately not marked up: Google does not
 * accept a business's reviews of itself on its own site as review snippets.)
 */

const MAX_ITEMS = 300;

export const SCHEMA_TYPE: Record<string, string> = { restaurant: 'Restaurant', cafe: 'CafeOrCoffeeShop', cloud_kitchen: 'FoodEstablishment', hotel: 'Hotel' };
const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** Image addresses from the API can be relative ("/storage/…"); search engines and link previews need absolute ones. */
export function absoluteUrl(src: string | null | undefined, base: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, `${base}/`).href;
  } catch {
    return null;
  }
}

/** The menu as schema.org Menu → MenuSection → MenuItem with prices in rupees. */
export function menuSchema(site: SiteData, menu: MenuCategory[]) {
  let left = MAX_ITEMS;
  const sections = menu
    .map((c) => {
      const items = c.items.filter((i) => i.is_available).slice(0, Math.max(0, left));
      left -= items.length;
      return {
        '@type': 'MenuSection',
        name: c.name,
        hasMenuItem: items.map((i) => {
          const variants = i.variants.filter((v) => v.is_available);
          const image = absoluteUrl(i.image?.src, site.seo.canonical);
          return {
            '@type': 'MenuItem',
            name: i.name,
            ...(i.description ? { description: i.description } : {}),
            ...(image ? { image } : {}),
            ...(i.food_type === 'veg' ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}),
            offers: variants.length
              ? variants.map((v) => ({ '@type': 'Offer', name: v.name, price: Number(v.price).toFixed(2), priceCurrency: 'INR' }))
              : { '@type': 'Offer', price: Number(i.price).toFixed(2), priceCurrency: 'INR' },
          };
        }),
      };
    })
    .filter((s) => s.hasMenuItem.length);
  return { '@type': 'Menu', name: `${site.name} menu`, url: `${site.seo.canonical}/menu`, inLanguage: 'en-IN', hasMenuSection: sections };
}

/** What a visitor can do from search (only what the business really offers). */
export function actionsSchema(site: SiteData) {
  const base = site.seo.canonical;
  return [
    site.ordering.enabled && { '@type': 'OrderAction', target: `${base}/menu` },
    site.reservations?.enabled && { '@type': 'ReserveAction', target: `${base}/reserve` },
    site.hotel?.has_rooms && site.hotel.online_booking && { '@type': 'ReserveAction', target: `${base}/rooms` },
  ].filter(Boolean);
}

export function geoSchema(site: SiteData) {
  return site.geo ? { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng } : null;
}

/**
 * Weekly hours. A close time at or before the open time means "past midnight" (e.g. 18:00–02:00),
 * which is how Google reads such a pair too.
 */
export function openingHoursSchema(hours: OpeningHours | null | undefined) {
  if (!hours) return [];
  return Object.entries(hours)
    .filter(([d, h]) => DAY_NAMES[d] && h && !h.closed && h.open && h.close)
    .map(([d, h]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[d], opens: h.open, closes: h.close }));
}

/** The address the owner typed, plus the city; a 6-digit PIN code in it becomes the postal code. */
export function addressSchema(site: SiteData) {
  const street = site.content.contact.address?.trim() || null;
  if (!street && !site.city) return null;
  const pin = street?.match(/\b[1-9]\d{5}\b/)?.[0];
  return {
    '@type': 'PostalAddress',
    ...(street ? { streetAddress: street } : {}),
    ...(site.city ? { addressLocality: site.city } : {}),
    ...(pin ? { postalCode: pin } : {}),
    addressCountry: 'IN',
  };
}

/** Room types with their starting nightly price (the rooms page). */
export function roomsSchema(site: SiteData, hotel: HotelPublic | null | undefined, amenity: (key: string) => string = (k) => k) {
  if (!hotel?.types?.length) return [];
  return hotel.types.map((r) => {
    const photo = absoluteUrl(r.photos[0]?.src, site.seo.canonical);
    return {
      '@type': 'Offer',
      price: Number(r.from_price).toFixed(2),
      priceCurrency: 'INR',
      url: `${site.seo.canonical}/rooms`,
      itemOffered: {
        '@type': 'HotelRoom',
        name: r.name,
        ...(r.description ? { description: r.description } : {}),
        ...(photo ? { image: photo } : {}),
        ...(r.bed ? { bed: r.bed } : {}),
        ...(r.size_sqft ? { floorSize: { '@type': 'QuantitativeValue', value: r.size_sqft, unitCode: 'FTK' } } : {}),
        occupancy: { '@type': 'QuantitativeValue', maxValue: r.max_adults + r.max_children },
        ...(r.amenities?.length ? { amenityFeature: r.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: amenity(a), value: true })) } : {}),
      },
    };
  });
}

/** Home → this page, for the search result's breadcrumb line. */
export function breadcrumbSchema(site: SiteData, homeName: string, name: string, path: string) {
  const base = site.seo.canonical;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeName, item: `${base}/` },
      { '@type': 'ListItem', position: 2, name, item: `${base}${path}` },
    ],
  };
}

/** The business itself (Restaurant, CafeOrCoffeeShop, FoodEstablishment or Hotel). */
export function businessSchema(site: SiteData, opts: { path: string; menu?: MenuCategory[] | null; hotel?: HotelPublic | null; description?: string | null; amenity?: (key: string) => string }) {
  const base = site.seo.canonical;
  const c = site.content.contact;
  const geo = geoSchema(site);
  const actions = actionsSchema(site);
  const address = addressSchema(site);
  const hours = openingHoursSchema(site.opening_hours);
  const logo = absoluteUrl(site.theme.logo?.src, base);
  const image = absoluteUrl(site.seo.image, base) ?? logo;
  const sameAs = Object.values(site.content.socials ?? {}).filter((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v));
  const rooms = opts.path === '/rooms' ? roomsSchema(site, opts.hotel, opts.amenity) : [];
  const isFood = site.business_type !== 'hotel';
  return {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[site.business_type] ?? 'LocalBusiness',
    '@id': `${base}/#business`,
    name: site.name,
    url: `${base}/`,
    ...(opts.description ? { description: opts.description } : {}),
    ...(image ? { image } : {}),
    ...(logo ? { logo } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(c.map_url && /^https?:\/\//.test(c.map_url) ? { hasMap: c.map_url } : {}),
    // The menu page carries the whole menu; other pages point to it.
    ...(site.has_menu && opts.path === '/menu' && opts.menu?.length ? { hasMenu: menuSchema(site, opts.menu) } : site.has_menu && isFood ? { hasMenu: `${base}/menu` } : {}),
    ...(isFood && site.reservations?.enabled ? { acceptsReservations: true } : {}),
    ...(actions.length ? { potentialAction: actions } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(site.hotel?.has_rooms ? { checkinTime: site.hotel.check_in_time, checkoutTime: site.hotel.check_out_time } : {}),
    ...(rooms.length ? { makesOffer: rooms } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
