import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PLATFORM_DOMAIN } from '@/lib/host';
import ogImage from './assets/site-desktop.webp';

/** The marketing site's public address (https on the real domain, the dev server locally). */
export function siteOrigin() {
  return PLATFORM_DOMAIN === 'localhost' ? window.location.origin : `https://${PLATFORM_DOMAIN}`;
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/**
 * Title, description, canonical, Open Graph / Twitter tags and JSON-LD for a marketing page.
 * Everything describes only what DineDesk really does: no ratings, reviews or customer counts.
 */
export function usePageMeta({ title, description, path, jsonLd }: { title: string; description: string; path: string; jsonLd?: object[] }) {
  const { i18n } = useTranslation();
  const ld = JSON.stringify(jsonLd ?? []);
  useEffect(() => {
    const url = siteOrigin() + path;
    document.title = title;
    document.documentElement.lang = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
    setMeta('name', 'description', description);
    setMeta('name', 'robots', 'index, follow');
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', 'DineDesk');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', new URL(ogImage, window.location.origin).href);
    setMeta('property', 'og:locale', i18n.language?.startsWith('hi') ? 'hi_IN' : 'en_IN');
    setMeta('name', 'twitter:card', 'summary_large_image');
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.page = 'marketing';
    script.textContent = ld;
    document.head.querySelectorAll('script[data-page="marketing"]').forEach((s) => s.remove());
    if (ld !== '[]') document.head.appendChild(script);
    return () => script.remove();
  }, [title, description, path, ld, i18n.language]);
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
