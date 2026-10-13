import type { SiteData } from '../types';

/**
 * How guests order on this website: through checkout (online ordering), by sending the cart to the
 * business's WhatsApp, or not at all (menu only).
 */
export function orderMode(site: SiteData | undefined): 'online' | 'whatsapp' | null {
  if (!site) return null;
  if (site.ordering.enabled) return 'online';
  return site.ordering.whatsapp ? 'whatsapp' : null;
}
