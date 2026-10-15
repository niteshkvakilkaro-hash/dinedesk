import type { TFunction } from 'i18next';
import { htmlLang, isRtl, languageCode, LANGUAGE_CODES } from '@/i18n/locale';
import type { HotelPublic } from './hotel';
import { localize } from './localize';
import { absoluteUrl, breadcrumbSchema, businessSchema } from './schema';
import type { GalleryItem, MenuCategory, SiteData } from './types';

/**
 * Everything a business page puts in <head> for search engines and link previews: title,
 * description, canonical, hreflang alternates, Open Graph and JSON-LD. A pure function, so the
 * browser (Seo.tsx), the server-side renderer and the tests all get the same answer.
 */

/** Public pages besides the five every theme has (path → nav label key). */
export const EXTRA_PAGES: Record<string, string> = { '/rooms': 'rooms', '/events': 'events', '/offers': 'offers', '/tiffin': 'tiffin', '/reserve': 'reserve' };
const CORE_PAGES: Record<string, string> = { '/': 'home', '/menu': 'menu', '/about': 'about', '/gallery': 'gallery', '/contact': 'contact' };

/** Public pages worth rendering on the server (everything else is personal or a form step). */
export const SSR_PATHS = ['/', '/menu', '/about', '/gallery', '/contact', '/rooms', '/events', '/offers', '/tiffin', '/reserve'];

/**
 * Personal pages and steps (checkout, order tracking, QR landings, look-ups): the app shows them,
 * search engines are told not to index them. Same list as the backend's robots.txt.
 */
const PRIVATE_PATHS = [/^\/checkout$/, /^\/order\/[^/]+$/, /^\/orders$/, /^\/account$/, /^\/bookings$/, /^\/reservation$/, /^\/t\/[^/]+$/, /^\/table$/, /^\/stay(\/[^/]+)?$/, /^\/r\/[^/]+$/, /^\/unsubscribe$/, /^\/style-guide$/];

/**
 * What a path on a business site is: a public page this site really has ("public"), a personal
 * page ("private"), or nothing ("missing" → 404, e.g. /rooms on a restaurant or a mistyped address).
 */
export function pageKind(pathname: string, site: SiteData): 'public' | 'private' | 'missing' {
  if (PRIVATE_PATHS.some((re) => re.test(pathname))) return 'private';
  if (!SSR_PATHS.includes(pathname)) return 'missing';
  const has: Record<string, boolean> = {
    '/gallery': !!site.has_gallery,
    '/rooms': !!site.hotel?.has_rooms,
    '/events': !!site.hotel?.banquets,
    '/offers': !!site.growth?.has_offers,
    '/tiffin': !!site.has_tiffin,
    '/reserve': !!site.reservations?.enabled,
  };
  return has[pathname] === false ? 'missing' : 'public';
}

export interface SiteHeadInput {
  site: SiteData;
  /** The page's address ("/", "/menu", "/rooms", "/checkout" …). */
  path: string;
  /** The page's own heading for pages outside the main five (private pages and extras). */
  title?: string | null;
  /** Private pages (checkout, order tracking, QR landings …) are never indexed. */
  isPrivate?: boolean;
  lang: string;
  t: TFunction;
  menu?: MenuCategory[] | null;
  gallery?: GalleryItem[] | null;
  hotel?: HotelPublic | null;
}

/** ?lang=… is how each language is addressed (English is the plain address). */
export function langUrl(url: string, lang: string) {
  const code = languageCode(lang);
  return code === 'en' ? url : `${url}?lang=${code}`;
}

/** Meta descriptions: one line, at most ~160 characters, cut at a word. */
export function clip(text: string, max = 160) {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

export function siteHead({ site, path, title = null, isPrivate = false, lang, t, menu, gallery, hotel }: SiteHeadInput) {
  const code = languageCode(lang);
  const place = site.seo.title; // "Name, City"
  const label = CORE_PAGES[path] ?? EXTRA_PAGES[path];
  const heading = title ?? (label && label !== 'home' ? t(`site.nav.${label}`) : null);
  const pageTitle = path === '/' && !title ? site.seo.title : `${heading ?? site.name} · ${place}`;
  const base = localize(site.seo, 'description', code) ?? site.seo.description;
  const intro = (lead: string) => `${place}: ${lead}`;

  let description = base;
  if (!isPrivate) {
    if (path === '/menu') {
      const dishes = (menu ?? []).flatMap((c) => c.items).filter((i) => i.is_available).slice(0, 8).map((i) => localize(i, 'name', code) ?? i.name);
      description = dishes.length ? `${t('site.nav.menu')} · ${place}: ${dishes.join(', ')}. ${base}` : `${t('site.nav.menu')} · ${place}. ${base}`;
    } else if (path === '/about') {
      description = localize(site.content, 'about', code) ?? `${t('site.storyTitle', { name: site.name })}. ${base}`;
    } else if (path === '/gallery') {
      const photos = (gallery ?? []).map((g) => g.caption || g.alt_text).filter(Boolean).slice(0, 5);
      description = `${t('site.nav.gallery')} · ${place}${photos.length ? `: ${photos.join(', ')}` : ''}. ${base}`;
    } else if (path === '/contact') {
      const c = site.content.contact;
      description = intro([t('site.contactLead'), c.address, c.phone].filter(Boolean).join(' '));
    } else if (path === '/offers') description = intro(t('site.offers.lead'));
    else if (path === '/events') description = intro(t('site.events.lead'));
    else if (path === '/tiffin') description = intro(t('site.tiffin.lead'));
    else if (path === '/reserve') description = intro(site.reservations?.auto_confirm ? t('site.res.leadInstant') : t('site.res.leadRequest'));
    else if (path === '/rooms' && site.hotel) description = intro(`${t('site.stay.lead', { in: site.hotel.check_in_time, out: site.hotel.check_out_time })} ${base}`);
  }
  description = clip(description);

  const url = `${site.seo.canonical}${path}`;
  const indexable = site.seo.indexable && !isPrivate;
  const image = absoluteUrl(site.seo.image, site.seo.canonical) ?? absoluteUrl(site.theme.logo?.src, site.seo.canonical);
  const jsonLd: object[] = [businessSchema(site, { path, menu, hotel, description: clip(base, 300), amenity: (a) => t(`hotel.amenity.${a}`) })];
  if (!isPrivate && path !== '/' && heading) jsonLd.push(breadcrumbSchema(site, t('site.nav.home'), heading, path));

  return {
    title: pageTitle,
    description,
    /** Each language version names itself as canonical (else search engines drop the alternates). */
    canonical: langUrl(url, code),
    indexable,
    htmlLang: htmlLang(code),
    dir: isRtl(code) ? 'rtl' : 'ltr',
    // Private pages have no language alternates worth listing.
    alternates: isPrivate ? [] : [...LANGUAGE_CODES.map((l) => ({ hreflang: htmlLang(l), href: langUrl(url, l) })), { hreflang: 'x-default', href: url }],
    ogLocale: htmlLang(code).replace('-', '_'),
    ogLocaleAlternates: isPrivate ? [] : LANGUAGE_CODES.filter((l) => l !== code).map((l) => htmlLang(l).replace('-', '_')),
    image,
    imageAlt: site.name,
    jsonLd,
  };
}
