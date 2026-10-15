import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import type { SiteData } from './types';
import { useSiteGallery, useSiteMenu } from './data';
import { useHotel } from './hotel';
import { siteHead } from './seoHead';

// JSON inside <script>: stop "</script>" in owner text from closing the tag early.
const ldJson = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c');

/**
 * Title, description, canonical, language alternates, Open Graph and schema.org JSON-LD
 * (built in seoHead.ts). Only from what the owner entered: no ratings, reviews or invented claims.
 * `isPrivate`: checkout, order tracking, QR landings … (noindex).
 */
export function Seo({ site, path, themeColor, title = null, isPrivate = false }: { site: SiteData; path: string; themeColor: string; title?: string | null; isPrivate?: boolean }) {
  const { t, i18n } = useTranslation();
  const { data: menu } = useSiteMenu();
  const { data: gallery } = useSiteGallery(!!site.has_gallery && path === '/gallery');
  const { data: hotel } = useHotel(!!site.hotel?.has_rooms && path === '/rooms');
  const head = siteHead({ site, path, title, isPrivate, lang: i18n.language, t, menu, gallery, hotel });

  return (
    <Helmet>
      <html lang={head.htmlLang} dir={head.dir} />
      <title>{head.title}</title>
      <meta name="description" content={head.description} />
      <meta name="robots" content={head.indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'} />
      <link rel="canonical" href={head.canonical} />
      {/* The same page in every language (English is the default address). */}
      {head.alternates.map((a) => <link key={a.hreflang} rel="alternate" hrefLang={a.hreflang} href={a.href} />)}
      <meta name="theme-color" content={themeColor} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={head.title} />
      <meta property="og:description" content={head.description} />
      <meta property="og:url" content={head.canonical} />
      <meta property="og:locale" content={head.ogLocale} />
      {head.ogLocaleAlternates.map((l) => <meta key={l} property="og:locale:alternate" content={l} />)}
      {head.image && <meta property="og:image" content={head.image} />}
      {head.image && <meta property="og:image:alt" content={head.imageAlt} />}
      <meta name="twitter:card" content={head.image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={head.title} />
      <meta name="twitter:description" content={head.description} />
      {head.image && <meta name="twitter:image" content={head.image} />}
      {site.theme.logo ? <link rel="icon" href={site.theme.logo.src} /> : <link rel="icon" type="image/png" href="/site-icon-192.png" />}
      <link rel="apple-touch-icon" href="/site-icon-192.png" />
      <link rel="manifest" href="/site.webmanifest" />
      {head.jsonLd.map((ld, i) => <script key={i} type="application/ld+json">{ldJson(ld)}</script>)}
    </Helmet>
  );
}
