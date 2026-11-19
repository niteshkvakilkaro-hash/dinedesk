import { showApp } from '@/lib/prerender';
import { htmlLang } from '@/i18n/locale';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PLATFORM_DOMAIN } from '@/lib/host';
import ogImage from './assets/hero/coastal-desktop.webp';
import { featureBySlug } from './content';

/** The marketing site's public address (https on the real domain, the dev server locally). */
export function siteOrigin() {
  if (PLATFORM_DOMAIN === 'localhost' && typeof window !== 'undefined') return window.location.origin;
  return `https://${PLATFORM_DOMAIN}`;
}

export interface PageHead {
  title: string;
  description: string;
  path: string;
  jsonLd: object[];
  keywords?: string;
}

/**
 * What restaurant owners in India type into Google, one group per page so the pages don't compete
 * with each other. Used for the keywords meta tag (Bing reads it; Google ranks on titles, headings
 * and text, which use the same words) and the SoftwareApplication data.
 */
export const SEO_KEYWORDS: Record<string, string[]> = {
  '/': ['restaurant billing software', 'restaurant POS software', 'restaurant management software', 'billing software for restaurant', 'restaurant software India', 'cafe billing software', 'cloud kitchen software', 'restaurant website with online ordering', 'QR code menu', 'KOT billing software', 'GST billing software for restaurant'],
  '/pricing': ['restaurant billing software price', 'restaurant POS software price India', 'restaurant software pricing', 'POS software cost India', 'restaurant billing software free trial', 'cheap restaurant billing software'],
  '/themes': ['restaurant website templates', 'restaurant website design', 'restaurant website builder', 'cafe website template', 'hotel website template', 'restaurant website demo'],
  '/features/restaurant-website': ['restaurant website builder', 'restaurant website with online ordering', 'make restaurant website', 'restaurant website India', 'restaurant menu website', 'website for restaurant'],
  '/features/online-ordering': ['online food ordering system for restaurant', 'zero commission online ordering', 'restaurant online ordering website', 'own food delivery website', 'online ordering system India', 'Swiggy Zomato alternative'],
  '/features/qr-menu-ordering': ['QR code menu for restaurant', 'QR code ordering system', 'digital menu QR code', 'contactless menu', 'table ordering system', 'QR menu India'],
  '/features/pos-billing': ['restaurant POS', 'GST billing software for restaurant', 'KOT billing software', 'restaurant billing software', 'POS billing software India', 'kitchen display system', 'cloud POS for restaurant'],
  '/features/hotel-management': ['hotel management software', 'hotel booking engine', 'hotel front desk software', 'hotel software with restaurant POS', 'hotel billing software India', 'PMS for hotels India'],
};

/**
 * Title, description and JSON-LD for each marketing page. Used by the pages in the browser
 * and by the build-time pre-render (scripts/prerender.mjs), so both always agree.
 * Everything describes only what NikoBite really does: no ratings, reviews or customer counts.
 */
export function marketingHead(path: string, t: TFunction): PageHead {
  const head = baseHead(path, t);
  return { ...head, keywords: (SEO_KEYWORDS[head.path] ?? SEO_KEYWORDS['/']).join(', ') };
}

function baseHead(path: string, t: TFunction): PageHead {
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  const crumbs = (name: string) => breadcrumbJsonLd([{ name: 'NikoBite', path: '/' }, { name, path }]);
  // The pricing page repeats the home page's FAQ: it is marked up once, on the home page.
  if (path === '/pricing') return { title: t('mk.seo.pricingTitle'), description: t('mk.seo.pricingDesc'), path, jsonLd: [orgJsonLd()[0], crumbs(t('mk.nav.pricing'))] };
  if (path === '/themes') return { title: t('mk.seo.themesTitle'), description: t('mk.seo.themesDesc'), path, jsonLd: [orgJsonLd()[0], crumbs(t('mk.nav.themes'))] };
  const feature = path.startsWith('/features/') ? featureBySlug(path.slice('/features/'.length)) : undefined;
  if (feature) {
    const k = `mk.f.${feature.key}`;
    const ffaq = t(`${k}.faq`, { returnObjects: true }) as { q: string; a: string }[];
    return { title: t(`${k}.metaTitle`), description: t(`${k}.metaDesc`), path, jsonLd: [orgJsonLd()[0], faqJsonLd(ffaq), crumbs(t(`${k}.eyebrow`))] };
  }
  return { title: t('mk.seo.homeTitle'), description: t('mk.seo.homeDesc'), path: '/', jsonLd: [...orgJsonLd(), faqJsonLd(faq)] };
}

/** Meta and link tags as [tag, attributes] pairs (rendered into <head> by the browser hook and the pre-render). */
export function headTags(head: PageHead, lang: string): { meta: [string, string, string][]; canonical: string; image: string } {
  const url = siteOrigin() + head.path;
  const image = new URL(ogImage, siteOrigin() + '/').href;
  return {
    canonical: url,
    image,
    meta: [
      ['name', 'description', head.description],
      ...(head.keywords ? [['name', 'keywords', head.keywords] as [string, string, string]] : []),
      ['name', 'robots', 'index, follow, max-image-preview:large'],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'NikoBite'],
      ['property', 'og:title', head.title],
      ['property', 'og:description', head.description],
      ['property', 'og:url', url],
      ['property', 'og:image', image],
      ['property', 'og:locale', htmlLang(lang).replace('-', '_')],
      ['name', 'twitter:card', 'summary_large_image'],
    ],
  };
}

function setMeta(attr: string, key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/**
 * The page arrived pre-rendered: the HTML stayed on screen (in #prerender) while the app
 * loaded. Now that the app shows the same page, swap it in.
 */
export { showApp };

/** Keeps <head> in step with the page as people move around the marketing site. */
export function usePageMeta(head: PageHead) {
  const { i18n } = useTranslation();
  const ld = JSON.stringify(head.jsonLd);
  useEffect(() => {
    showApp();
    const lang = i18n.language ?? 'en';
    const tags = headTags(head, lang);
    document.title = head.title;
    document.documentElement.lang = htmlLang(lang);
    tags.meta.forEach(([attr, key, value]) => setMeta(attr, key, value));
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = tags.canonical;
    document.head.querySelectorAll('script[data-page="marketing"]').forEach((s) => s.remove());
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.page = 'marketing';
    script.textContent = ld;
    document.head.appendChild(script);
    return () => script.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head.title, head.description, head.path, ld, i18n.language]);
}

/** NikoBite as an organisation and as a web application (no ratings, reviews or offers invented). */
export function orgJsonLd() {
  const origin = siteOrigin();
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'NikoBite', url: origin, logo: `${origin}/favicon.svg` },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'NikoBite',
      alternateName: 'NikoBite restaurant billing software',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Restaurant POS and billing software',
      operatingSystem: 'Web browser, Android',
      url: origin,
      inLanguage: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'or-IN', 'pa-IN', 'ta-IN', 'te-IN', 'ur-IN'],
      description: 'Restaurant billing software for India: POS with GST and KOT billing, QR code menu and table ordering, online ordering website, table bookings, kitchen display and hotel management.',
      featureList: ['Restaurant POS with GST billing', 'KOT to kitchen display', 'QR code menu and table ordering', 'Online ordering website with no commission', 'Table reservations', 'Inventory and reports', 'Hotel booking engine and front desk', '12 Indian languages'],
      keywords: SEO_KEYWORDS['/'].join(', '),
    },
  ];
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: siteOrigin() + c.path })),
  };
}
