import { showApp } from '@/lib/prerender';
import { htmlLang } from '@/i18n/locale';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PLATFORM_DOMAIN } from '@/lib/host';
import ogImage from './assets/site-desktop.webp';
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
}

/**
 * Title, description and JSON-LD for each marketing page. Used by the pages in the browser
 * and by the build-time pre-render (scripts/prerender.mjs), so both always agree.
 * Everything describes only what DineDesk really does: no ratings, reviews or customer counts.
 */
export function marketingHead(path: string, t: TFunction): PageHead {
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  const crumbs = (name: string) => breadcrumbJsonLd([{ name: 'DineDesk', path: '/' }, { name, path }]);
  if (path === '/pricing') return { title: t('mk.seo.pricingTitle'), description: t('mk.seo.pricingDesc'), path, jsonLd: [orgJsonLd()[0], faqJsonLd(faq), crumbs(t('mk.nav.pricing'))] };
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
      ['name', 'robots', 'index, follow'],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'DineDesk'],
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

/** DineDesk as an organisation and as a web application (no ratings or offers invented). */
export function orgJsonLd() {
  const origin = siteOrigin();
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'DineDesk', url: origin, logo: `${origin}/favicon.svg` },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'DineDesk',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: origin,
      inLanguage: ['en-IN', 'hi-IN'],
      description: 'Restaurant website, online ordering, QR table ordering, table bookings, POS with GST billing, kitchen display and hotel management for India.',
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
