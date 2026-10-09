import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import type { PageKey } from '@/themes/types';
import type { SiteData } from './types';

const PATHS: Record<PageKey, string> = { home: '/', menu: '/menu', about: '/about', gallery: '/gallery', contact: '/contact' };

const SCHEMA_TYPE: Record<string, string> = { restaurant: 'Restaurant', cafe: 'CafeOrCoffeeShop', cloud_kitchen: 'FoodEstablishment', hotel: 'Hotel' };
const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/**
 * Title, description, canonical, Open Graph and schema.org JSON-LD. Built
 * only from what the owner entered: no ratings, reviews or invented claims.
 */
export function Seo({ site, page, themeColor }: { site: SiteData; page: PageKey; themeColor: string }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language?.startsWith('hi');
  const pageTitle = page === 'home' ? site.seo.title : `${t(`site.nav.${page}`)} · ${site.name}`;
  const description = (hi && site.seo.description_hi) || site.seo.description;
  const url = `${site.seo.canonical}${PATHS[page]}`;
  const c = site.content.contact;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[site.business_type] ?? 'LocalBusiness',
    name: site.name,
    url: site.seo.canonical,
    ...(site.seo.image ? { image: site.seo.image } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.address || site.city
      ? { address: { '@type': 'PostalAddress', ...(c.address ? { streetAddress: c.address } : {}), ...(site.city ? { addressLocality: site.city } : {}), addressCountry: 'IN' } }
      : {}),
    ...(site.has_menu && site.business_type !== 'hotel' ? { hasMenu: `${site.seo.canonical}/menu` } : {}),
    ...(site.opening_hours
      ? {
          openingHoursSpecification: Object.entries(site.opening_hours)
            .filter(([, h]) => !h.closed)
            .map(([d, h]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[d], opens: h.open, closes: h.close })),
        }
      : {}),
    sameAs: Object.values(site.content.socials).filter(Boolean),
  };

  return (
    <Helmet>
      <html lang={hi ? 'hi-IN' : 'en-IN'} />
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <link rel="alternate" hrefLang="en-IN" href={url} />
      <link rel="alternate" hrefLang="hi-IN" href={`${url}?lang=hi`} />
      {!site.seo.indexable && <meta name="robots" content="noindex, nofollow" />}
      <meta name="theme-color" content={themeColor} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content={hi ? 'hi_IN' : 'en_IN'} />
      {site.seo.image && <meta property="og:image" content={site.seo.image} />}
      <meta name="twitter:card" content={site.seo.image ? 'summary_large_image' : 'summary'} />
      {site.theme.logo && <link rel="icon" href={site.theme.logo.src} />}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
