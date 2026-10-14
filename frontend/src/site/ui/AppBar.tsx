import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { appHomeUrl } from '@/lib/dinedeskApp';
import type { SiteData } from '../types';
import { CartButton } from './Header';

/** The page's name for the app's top bar. */
function useAppTitle(site: SiteData): string {
  const { t } = useTranslation();
  const p = useLocation().pathname;
  const nav = ['about', 'gallery', 'contact', 'rooms', 'reserve', 'offers', 'events', 'tiffin'].find((k) => p === `/${k}`);
  if (p === '/menu') return site.hotel?.has_rooms ? t('site.bar.dining') : t('site.nav.menu');
  if (nav) return t(`site.nav.${nav}`);
  if (p.startsWith('/checkout')) return t('order.checkoutTitle');
  if (p.startsWith('/order/')) return t('order.trackTitle');
  if (p === '/orders') return t('order.mine.title');
  if (p === '/account') return t('site.profile.title');
  if (p === '/bookings') return t('site.profile.bookings');
  if (p.startsWith('/t/') || p === '/table') return t('site.table.pageTitle');
  if (p === '/reservation' || p.startsWith('/stay') || p.startsWith('/r/')) return t('site.stay.yourBooking');
  return site.name;
}

/**
 * Inside the DineDesk app, inner pages get an app top bar instead of the website header: back
 * (history, or the site's home when there is none), the page name in the middle, and the cart.
 * Colours come from the theme (primary / on-primary), so it fits every theme.
 */
export function AppBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = useAppTitle(site);
  const back = () => {
    // React Router numbers its history entries: 0 = this site was opened on this page.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };
  return (
    <header className="s-appbar">
      <button type="button" className="s-appbar-btn" onClick={back} aria-label={t('common.back')}>
        <ArrowLeft className="h-6 w-6 rtl:rotate-180" aria-hidden="true" />
      </button>
      <p className="s-appbar-title">{title}</p>
      <div className="s-appbar-end">
        <CartButton site={site} />
      </div>
    </header>
  );
}

/** Home page inside the app: back to every place on DineDesk (the app's start screen). */
export function AllPlacesLink({ light = false }: { light?: boolean }) {
  const { t } = useTranslation();
  return (
    <a href={appHomeUrl()} className={`s-places-btn ${light ? 'is-light' : ''}`}>
      <ChevronLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
      <span className="truncate">{t('app.allPlaces')}</span>
    </a>
  );
}
