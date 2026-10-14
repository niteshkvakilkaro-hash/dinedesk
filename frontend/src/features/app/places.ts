import { PLATFORM_DOMAIN } from '@/lib/host';
import { allowInApp, rememberPlace, subdomainUrl, withAppFlag } from '@/lib/dinedeskApp';

/** A row of GET /directory (and /directory/place). */
export interface Place {
  name: string;
  slug: string;
  host: string;
  url: string;
  business_type: string;
  city: string | null;
  logo: { src: string; srcset: string } | null;
  cover: { src: string; srcset: string } | null;
  is_open: boolean | null;
  is_demo: boolean;
}

/** Where a place opens from here: its subdomain (nip.io on a phone in development) or its own domain. */
export function placeHref(place: Pick<Place, 'host' | 'url'>, path = '/'): string {
  const suffix = `.${PLATFORM_DOMAIN}`;
  const label = place.host.endsWith(suffix) ? place.host.slice(0, -suffix.length) : null;
  return label && !label.includes('.') ? subdomainUrl(label, path) : place.url.replace(/\/$/, '') + path;
}

/** Records the place in "Recently visited", then opens its website in this window. */
export function openPlace(place: Pick<Place, 'host' | 'url' | 'name' | 'business_type' | 'city'> & Partial<Pick<Place, 'logo' | 'cover'>>, href = placeHref(place)) {
  rememberPlace({ host: place.host, url: place.url, name: place.name, logo: place.logo?.src ?? place.cover?.src ?? null, business_type: place.business_type, city: place.city });
  // A business's own domain was confirmed by the server: the Android app may open it inside.
  allowInApp(href);
  window.location.assign(withAppFlag(href));
}
