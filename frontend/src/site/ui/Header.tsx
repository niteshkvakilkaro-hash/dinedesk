import { Link, NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu as MenuIcon, ShoppingBag, X } from 'lucide-react';
import { cartCount, useCart } from '../cart';
import { useActiveRoom } from '../hotel';
import { telHref } from '../data';
import { ReduceMotionToggle, SiteImg, SiteLanguageToggle } from '../components/bits';
import { SkipLink, useMobileMenu, useNavItems } from '../components/nav';
import type { SiteData } from '../types';
import { useScrolled } from './motion';
import { OpenBadge, themeStyle } from './primitives';

export function Brand({ site, className = '' }: { site: SiteData; className?: string }) {
  return (
    <Link to="/" className={`flex min-h-11 items-center gap-3 ${className}`}>
      {site.theme.logo && <SiteImg image={site.theme.logo} alt="" sizes="44px" className="h-10 w-10 shrink-0 rounded-full" imgClassName="!object-contain" />}
      <span className="s-h3 truncate !text-[1.25rem] leading-none sm:!text-[1.4rem]">{site.name}</span>
    </Link>
  );
}

function CartButton({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const count = cartCount(useCart((s) => s.lines));
  const setOpen = useCart((s) => s.setOpen);
  const room = useActiveRoom(site);
  if (!site.ordering.enabled && !room) return null;
  return (
    <button type="button" className="s-icon-btn relative" onClick={() => setOpen(true)} aria-label={t('order.viewCart', { count })}>
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      {count > 0 && <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-t-primary px-1 text-[11px] font-bold tabular-nums text-t-on-primary">{count}</span>}
    </button>
  );
}

/** Sticky header: transparent over a full-bleed hero photo, then a blurred bar once you scroll. */
export function Header({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const items = useNavItems(site);
  const [open, setOpen] = useMobileMenu();
  const scrolled = useScrolled();
  const over = pathname === '/' && themeStyle(site).hero === 'fullbleed' && !!site.theme.cover && !scrolled && !open;
  const phone = site.content.contact.phone;
  const cta = site.ordering.enabled ? { to: '/menu', label: t('site.hero.order') } : site.reservations?.enabled ? { to: '/reserve', label: t('site.reserveTitle') } : site.has_menu ? { to: '/menu', label: t('site.viewMenu') } : null;

  return (
    <>
      <SkipLink className="bg-t-primary text-t-on-primary" />
      <header className={`s-header ${over ? 'is-over' : ''}`}>
        <div className="s-wrap flex h-full items-center gap-4">
          <Brand site={site} className="min-w-0 flex-1 lg:flex-none" />
          <nav aria-label={t('site.mainNav')} className="mx-auto hidden lg:block">
            <ul className="flex items-center">
              {items.map((i) => (
                <li key={i.key}>
                  <NavLink to={i.to} end={i.to === '/'} className="s-nav-link">
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1">
            <SiteLanguageToggle className="s-icon-btn text-sm font-bold" />
            <CartButton site={site} />
            {cta ? (
              <Link to={cta.to} className={`s-btn s-btn-sm ml-2 hidden md:inline-flex ${over ? 's-btn-glass' : 's-btn-primary'}`}>
                {cta.label}
              </Link>
            ) : (
              phone && (
                <a href={telHref(phone)} className={`s-btn s-btn-sm ml-2 hidden md:inline-flex ${over ? 's-btn-glass' : 's-btn-primary'}`}>
                  {t('site.call')}
                </a>
              )
            )}
            <button type="button" className="s-icon-btn lg:hidden" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)} aria-label={open ? t('site.menuClose') : t('site.menuOpen')}>
              {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MenuIcon className="h-6 w-6" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div id="site-menu" className="s-sheet lg:hidden" style={{ paddingTop: "calc(var(--s-header-h) + 32px)" }}>
          <nav aria-label={t('site.mainNav')} className="s-wrap flex-1 overflow-y-auto py-6">
            <ul>
              {items.map((i, n) => (
                <li key={i.key} className="border-b border-t-line">
                  <NavLink to={i.to} end={i.to === '/'} onClick={() => setOpen(false)} className="s-h2 flex min-h-16 items-center justify-between py-3 aria-[current=page]:text-t-link" style={{ animation: `s-fade .45s var(--t-ease) ${n * 60}ms both` }}>
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-8 space-y-4">
              <OpenBadge site={site} />
              <ReduceMotionToggle className="s-small flex min-h-11 items-center font-semibold" />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
