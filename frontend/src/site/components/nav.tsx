import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { PageKey } from '@/themes/types';
import type { SiteData } from '../types';

export const NAV_PATHS: Record<PageKey, string> = { home: '/', menu: '/menu', about: '/about', gallery: '/gallery', contact: '/contact' };

/** Pages to show in navigation (gallery only once there are photos, menu only with dishes, booking when it's on). */
export function useNavItems(site: SiteData): { key: PageKey | 'reserve' | 'offers' | 'rooms' | 'events'; to: string; label: string }[] {
  const { t } = useTranslation();
  const items: { key: PageKey | 'reserve' | 'offers' | 'rooms' | 'events'; to: string; label: string }[] = (['home', 'menu', 'about', 'gallery', 'contact'] as PageKey[])
    .filter((k) => (k === 'gallery' ? site.has_gallery : k === 'menu' ? site.has_menu : true))
    .map((k) => ({ key: k, to: NAV_PATHS[k], label: t(`site.nav.${k}`) }));
  // Hotels: rooms right after the home page; events before contact.
  if (site.hotel?.has_rooms) items.splice(1, 0, { key: 'rooms', to: '/rooms', label: t('site.nav.rooms') });
  if (site.reservations?.enabled) items.splice(items.length - 1, 0, { key: 'reserve', to: '/reserve', label: t('site.nav.reserve') });
  if (site.hotel?.banquets) items.splice(items.length - 1, 0, { key: 'events', to: '/events', label: t('site.nav.events') });
  if (site.growth?.has_offers) items.splice(items.length - 1, 0, { key: 'offers', to: '/offers', label: t('site.nav.offers') });
  return items;
}

export function SiteNavLinks({ site, className = '', linkClassName = '', activeClassName = '', onNavigate }: { site: SiteData; className?: string; linkClassName?: string; activeClassName?: string; onNavigate?: () => void }) {
  const items = useNavItems(site);
  return (
    <ul className={className}>
      {items.map((i) => (
        <li key={i.key}>
          <NavLink to={i.to} end={i.to === '/'} onClick={onNavigate} className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}>
            {i.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Mobile menu open state that closes itself on navigation and Escape. */
export function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return [open, setOpen] as const;
}

export function SkipLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <a href="#main" className={`sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:px-4 focus:py-2 ${className}`}>
      {t('site.skipToContent')}
    </a>
  );
}
