import { BedDouble, CalendarCheck, ChefHat, Globe, LineChart, Megaphone, Package, QrCode, ReceiptText, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { ThemeKey } from '@/themes/types';

/** Feature pages: /features/<slug>, copy under mk.f.<key>. */
export const FEATURE_PAGES = [
  { slug: 'restaurant-website', key: 'website', icon: Globe },
  { slug: 'online-ordering', key: 'ordering', icon: ShoppingBag },
  { slug: 'qr-menu-ordering', key: 'qr', icon: QrCode },
  { slug: 'pos-billing', key: 'pos', icon: ReceiptText },
  { slug: 'hotel-management', key: 'hotel', icon: BedDouble },
] as const;

export type FeatureKey = (typeof FEATURE_PAGES)[number]['key'];

export const featureBySlug = (slug: string | undefined) => FEATURE_PAGES.find((f) => f.slug === slug);
export const featurePath = (key: string) => {
  const f = FEATURE_PAGES.find((p) => p.key === key);
  return f ? `/features/${f.slug}` : null;
};

/** Home page module grid (copy under mk.modules.items.<key>); five of them have their own page. */
export const MODULES: { key: string; icon: LucideIcon }[] = [
  { key: 'website', icon: Globe },
  { key: 'ordering', icon: ShoppingBag },
  { key: 'qr', icon: QrCode },
  { key: 'bookings', icon: CalendarCheck },
  { key: 'pos', icon: ReceiptText },
  { key: 'kds', icon: ChefHat },
  { key: 'hotel', icon: BedDouble },
  { key: 'marketing', icon: Megaphone },
  { key: 'inventory', icon: Package },
  { key: 'reports', icon: LineChart },
];

/** The live demo business for each theme (seeded, labelled Demo, never indexed). */
export const DEMO_SLUG: Record<ThemeKey, string> = {
  rajwada: 'hotel-demo',
  haveli: 'haveli-demo',
  ember: 'ember-demo',
  bistro: 'bistro-demo',
  kulhad: 'kulhad-demo',
  qsr: 'qsr-demo',
  street: 'street-demo',
  coastal: 'coastal-demo',
};

/** Indexable marketing pages (the backend's SeoController::PLATFORM_PAGES lists the same). */
export const MARKETING_PAGES = ['/', '/pricing', '/themes', ...FEATURE_PAGES.map((f) => `/features/${f.slug}`)];
