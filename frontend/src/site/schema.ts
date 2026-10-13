import type { MenuCategory, SiteData } from './types';

/*
 * schema.org data for search engines (Google shows menus, hours, actions and the map pin from it).
 * Built only from what the business entered: no ratings, reviews or price ranges are made up.
 */

const MAX_ITEMS = 300;

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
          return {
            '@type': 'MenuItem',
            name: i.name,
            ...(i.description ? { description: i.description } : {}),
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
