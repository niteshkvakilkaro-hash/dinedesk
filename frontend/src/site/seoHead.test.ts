import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import en from '@/i18n/en.json';
import { clip, langUrl, pageKind, siteHead } from './seoHead';
import type { MenuCategory, SiteData } from './types';

// English texts, as i18next would give them.
const t = ((key: string, opts?: Record<string, unknown>) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, n) => String(opts?.[n] ?? '')) : key;
}) as unknown as TFunction;

const site = {
  name: 'Haveli',
  business_type: 'restaurant',
  city: 'Jaipur',
  is_live: true,
  has_menu: true,
  has_gallery: true,
  has_tiffin: false,
  geo: null,
  hotel: null,
  opening_hours: null,
  theme: { logo: null },
  ordering: { enabled: true },
  reservations: { enabled: true, auto_confirm: true },
  growth: { has_offers: false },
  content: {
    about: 'Family run since 1998.',
    about_hi: null,
    contact: { phone: '0141 222 3333', email: null, address: 'MI Road, Jaipur 302001', map_url: null },
    socials: { instagram: 'https://instagram.com/haveli', facebook: null },
  },
  seo: {
    title: 'Haveli, Jaipur',
    description: 'Rajasthani thalis and laal maas in the old city.',
    description_hi: 'पुराने शहर में राजस्थानी थाली।',
    canonical: 'https://haveli.example.in',
    image: '/storage/cover-960.webp',
    indexable: true,
  },
} as unknown as SiteData;

const menu = [
  { id: 1, name: 'Mains', items: [{ name: 'Laal Maas', is_available: true, variants: [], price: '420', food_type: 'non_veg' }, { name: 'Gone', is_available: false, variants: [], price: '1' }] },
] as unknown as MenuCategory[];

const head = (path: string, extra: Partial<Parameters<typeof siteHead>[0]> = {}) => siteHead({ site, path, lang: 'en', t, menu, ...extra });

describe('business page <head>', () => {
  it('gives every public page its own title and description', () => {
    const pages = ['/', '/menu', '/about', '/gallery', '/contact', '/reserve'].map((p) => head(p, p === '/reserve' ? { title: 'Book a table' } : {}));
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
    expect(pages[0].title).toBe('Haveli, Jaipur');
    expect(pages[1].title).toBe('Menu · Haveli, Jaipur');
    expect(pages[1].description).toContain('Laal Maas');
    expect(pages[1].description).not.toContain('Gone');
    expect(pages[4].description).toContain('MI Road');
    pages.forEach((p) => expect(p.description.length).toBeLessThanOrEqual(160));
  });

  it('names itself as canonical in each language, with all 12 languages and x-default as alternates', () => {
    const en = head('/menu');
    expect(en.canonical).toBe('https://haveli.example.in/menu');
    expect(en.alternates).toHaveLength(13);
    expect(en.alternates).toContainEqual({ hreflang: 'x-default', href: 'https://haveli.example.in/menu' });
    expect(en.alternates).toContainEqual({ hreflang: 'ta-IN', href: 'https://haveli.example.in/menu?lang=ta' });

    const hi = head('/', { lang: 'hi' });
    expect(hi.canonical).toBe('https://haveli.example.in/?lang=hi');
    expect(hi.alternates.map((a) => a.href)).toContain(hi.canonical);
    expect(hi.htmlLang).toBe('hi-IN');
    expect(hi.description).toBe('पुराने शहर में राजस्थानी थाली।');
    expect(hi.ogLocale).toBe('hi_IN');
    expect(hi.ogLocaleAlternates).toHaveLength(11);
    expect(hi.ogLocaleAlternates).not.toContain('hi_IN');
    expect(head('/', { lang: 'ur' }).dir).toBe('rtl');
  });

  it('makes image addresses absolute for link previews and search engines', () => {
    expect(head('/').image).toBe('https://haveli.example.in/storage/cover-960.webp');
  });

  it('keeps private pages and demo sites out of the index', () => {
    const checkout = head('/checkout', { title: 'Checkout', isPrivate: true });
    expect(checkout.indexable).toBe(false);
    expect(checkout.alternates).toEqual([]);
    expect(head('/', { site: { ...site, seo: { ...site.seo, indexable: false } } }).indexable).toBe(false);
    expect(head('/menu').indexable).toBe(true);
  });

  it('adds a breadcrumb on inner pages and the full menu on the menu page', () => {
    const [biz, crumbs] = head('/menu').jsonLd as Record<string, unknown>[];
    expect(biz['@type']).toBe('Restaurant');
    expect((biz.hasMenu as Record<string, unknown>)['@type']).toBe('Menu');
    expect(crumbs).toMatchObject({ '@type': 'BreadcrumbList', itemListElement: [{ position: 1, item: 'https://haveli.example.in/' }, { position: 2, name: 'Menu', item: 'https://haveli.example.in/menu' }] });
    expect(head('/').jsonLd).toHaveLength(1);
    expect(head('/about').jsonLd[0]).toMatchObject({ hasMenu: 'https://haveli.example.in/menu' });
  });
});

describe('what an address on a business site is', () => {
  it('serves real pages, hides personal ones and 404s the rest', () => {
    expect(pageKind('/', site)).toBe('public');
    expect(pageKind('/menu', site)).toBe('public');
    expect(pageKind('/reserve', site)).toBe('public');
    expect(pageKind('/rooms', site)).toBe('missing'); // not a hotel
    expect(pageKind('/tiffin', site)).toBe('missing');
    expect(pageKind('/offers', site)).toBe('missing');
    expect(pageKind('/wp-admin', site)).toBe('missing');
    expect(pageKind('/menu/extra', site)).toBe('missing');
    for (const p of ['/checkout', '/order/abc', '/orders', '/account', '/bookings', '/t/xyz', '/r/xyz', '/table', '/stay', '/stay/5', '/reservation', '/unsubscribe']) {
      expect(pageKind(p, site)).toBe('private');
    }
  });
});

describe('helpers', () => {
  it('addresses languages with ?lang= (English is the plain address)', () => {
    expect(langUrl('https://x.in/menu', 'en')).toBe('https://x.in/menu');
    expect(langUrl('https://x.in/menu', 'bn-IN')).toBe('https://x.in/menu?lang=bn');
  });

  it('cuts long descriptions at a word', () => {
    const text = 'word '.repeat(60);
    const out = clip(text);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('word…')).toBe(true);
    expect(clip('  short   text ')).toBe('short text');
  });
});
