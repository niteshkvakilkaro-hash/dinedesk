import { Link, NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BedDouble, CalendarCheck, CookingPot, House, Images, Info, MapPin, PartyPopper, ShoppingBag, Tag, UserRound, UtensilsCrossed } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { cartCount, useCart } from '../cart';
import { orderMode } from '../order/mode';
import { mapHref, telHref, useLocalized } from '../data';
import { ReduceMotionToggle, SiteLanguageToggle } from '../components/bits';
import { useNavItems, type NavKey } from '../components/nav';
import type { SiteData } from '../types';
import { Brand } from './Header';
import { useTodayHours } from './primitives';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function Footer({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const items = useNavItems(site);
  const today = useTodayHours(site);
  const c = site.content.contact;
  const s = site.content.socials;
  const socials = [
    s.instagram && { label: 'Instagram', href: s.instagram },
    s.facebook && { label: 'Facebook', href: s.facebook },
    s.youtube && { label: 'YouTube', href: s.youtube },
    s.google_maps && { label: 'Google Maps', href: s.google_maps },
  ].filter(Boolean) as { label: string; href: string }[];
  const fssai = site.content.legal?.fssai;
  const year = new Date().getFullYear();

  return (
    <footer className="s-alt mt-auto border-t border-t-line">
      <div className="s-wrap s-grid gap-y-8 py-12">
        <div className="col-span-4 md:col-span-5">
          <Brand site={site} />
          {l(site.content, 'tagline') && <p className="s-muted mt-4 max-w-sm">{l(site.content, 'tagline')}</p>}
          {today.text && (
            <p className="s-small mt-5">
              <span className="font-bold">{t('site.today')}: </span>
              {today.text}
            </p>
          )}
        </div>
        {/* Two columns of links: a hotel with every page would otherwise make a very tall footer. */}
        <nav aria-label={t('site.footerNav')} className="col-span-4 md:col-span-4">
          <p className="s-eyebrow mb-3">{t('site.explore')}</p>
          <ul className="grid grid-cols-2 gap-x-6">
            {items.map((i) => (
              <li key={i.key}>
                <Link to={i.to} className="inline-flex min-h-10 items-center hover:underline">
                  {i.label}
                </Link>
              </li>
            ))}
            {site.ordering.enabled && (
              <li>
                <Link to="/orders" className="inline-flex min-h-10 items-center hover:underline">
                  {t('order.mine.title')}
                </Link>
              </li>
            )}
          </ul>
        </nav>
        <div className="col-span-2 md:col-span-3">
          <p className="s-eyebrow mb-3">{t('site.contactTitle')}</p>
          <ul className="space-y-1">
            {c.phone && (
              <li>
                <a href={telHref(c.phone)} className="inline-flex min-h-10 items-center hover:underline">
                  {formatPhone(c.phone)}
                </a>
              </li>
            )}
            {c.email && (
              <li>
                <a href={`mailto:${c.email}`} className="inline-flex min-h-10 items-center break-all hover:underline">
                  {c.email}
                </a>
              </li>
            )}
            <li>
              <a href={mapHref(site)} {...ext} className="inline-flex min-h-10 items-center hover:underline">
                {t('site.directions')}
                <span className="sr-only"> ({t('common.opensInNewTab')})</span>
              </a>
            </li>
          </ul>
        </div>
        {socials.length > 0 && (
          <div className="col-span-2 md:col-span-3 md:col-start-10">
            <p className="s-eyebrow mb-3">{t('site.followUs')}</p>
            <ul className="space-y-1">
              {socials.map((x) => (
                <li key={x.label}>
                  <a href={x.href} {...ext} className="inline-flex min-h-10 items-center hover:underline">
                    {x.label}
                    <span className="sr-only"> ({t('common.opensInNewTab')})</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="border-t border-t-line">
        <div className="s-wrap s-small s-muted flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>
              © {year} {site.name}
            </span>
            {fssai && <span>{t('site.fssai', { number: fssai })}</span>}
            {site.gstin && <span>{t('site.gstin', { number: site.gstin })}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <SiteLanguageToggle className="inline-flex min-h-10 items-center font-semibold hover:underline" />
            <ReduceMotionToggle className="inline-flex min-h-10 items-center font-semibold" />
            <span>{t('site.poweredBy')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

const TAB_ICONS: Record<NavKey, typeof House> = {
  home: House,
  menu: UtensilsCrossed,
  rooms: BedDouble,
  reserve: CalendarCheck,
  offers: Tag,
  tiffin: CookingPot,
  about: Info,
  gallery: Images,
  events: PartyPopper,
  contact: MapPin,
};
// Which pages earn a tab of their own; the rest are listed on the Profile tab.
const TAB_ORDER: NavKey[] = ['home', 'rooms', 'menu', 'reserve', 'offers', 'about', 'gallery', 'events', 'contact'];

/** Phones and tablets: app-style bottom tabs (pages, cart and Profile), like a native app. */
export function MobileBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const items = useNavItems(site);
  const count = cartCount(useCart((s) => s.lines));
  const setCartOpen = useCart((s) => s.setOpen);
  if (pathname.startsWith('/checkout') || pathname.startsWith('/order/') || pathname.startsWith('/style-guide')) return null;
  const cart = !!orderMode(site);
  const sorted = [...items].sort((a, b) => TAB_ORDER.indexOf(a.key) - TAB_ORDER.indexOf(b.key));
  const tabs = sorted.slice(0, cart ? 3 : 4);
  // Profile also covers the pages without a tab, and the guest's orders and bookings.
  const profileActive = ['/account', '/orders', '/bookings'].includes(pathname) || items.some((i) => !tabs.includes(i) && i.to !== '/' && pathname.startsWith(i.to));
  const label = (i: (typeof items)[number]) => (i.key === 'reserve' ? t('site.bar.book') : i.key === 'menu' && site.hotel?.has_rooms ? t('site.bar.dining') : i.label);
  const icon = 'h-[22px] w-[22px]';

  return (
    <nav className="s-tabbar" aria-label={t('site.mainNav')}>
      {tabs.map((i) => {
        const Icon = TAB_ICONS[i.key];
        return (
          <NavLink key={i.key} to={i.to} end={i.to === '/'}>
            <span className="s-tab-icon">
              <Icon className={icon} aria-hidden="true" />
            </span>
            {label(i)}
          </NavLink>
        );
      })}
      {cart && (
        <button type="button" onClick={() => setCartOpen(true)} aria-label={t('order.viewCart', { count })}>
          <span className="s-tab-icon">
            <ShoppingBag className={icon} aria-hidden="true" />
            {count > 0 && <span className="s-tab-count tabular-nums">{count}</span>}
          </span>
          {t('site.bar.cart')}
        </button>
      )}
      <Link to="/account" className={profileActive ? 'is-active' : ''} aria-current={pathname === '/account' ? 'page' : undefined}>
        <span className="s-tab-icon">
          <UserRound className={icon} aria-hidden="true" />
        </span>
        {t('site.bar.profile')}
      </Link>
    </nav>
  );
}
