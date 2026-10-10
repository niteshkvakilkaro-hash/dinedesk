import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, MessageCircle, Phone, ShoppingBag, MapPin, UtensilsCrossed } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { cartCount, cartEstimate, useCart } from '../cart';
import { mapHref, telHref, useLocalized, whatsappHref } from '../data';
import { ReduceMotionToggle, SiteLanguageToggle } from '../components/bits';
import { useNavItems } from '../components/nav';
import { useMoney } from '../ordering';
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

/** Mobile-only bottom bar: Call · WhatsApp (or Directions) · Order / cart. */
export function MobileBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { pathname } = useLocation();
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  if (pathname.startsWith('/checkout') || pathname.startsWith('/order/') || pathname.startsWith('/style-guide')) return null;
  const c = site.content.contact;
  const count = cartCount(lines);
  const icon = 'h-[18px] w-[18px]';

  return (
    <nav className="s-bar" aria-label={t('site.bar.label')}>
      {c.phone && (
        <a href={telHref(c.phone)}>
          <Phone className={icon} aria-hidden="true" />
          {t('site.bar.call')}
        </a>
      )}
      {c.whatsapp ? (
        <a href={whatsappHref(c.whatsapp, t('site.whatsappHello', { name: site.name }))} {...ext}>
          <MessageCircle className={icon} aria-hidden="true" />
          WhatsApp
          <span className="sr-only"> ({t('common.opensInNewTab')})</span>
        </a>
      ) : (
        <a href={mapHref(site)} {...ext}>
          <MapPin className={icon} aria-hidden="true" />
          {t('site.bar.directions')}
          <span className="sr-only"> ({t('common.opensInNewTab')})</span>
        </a>
      )}
      {site.ordering.enabled && count > 0 ? (
        <button type="button" className="is-main" onClick={() => setOpen(true)} aria-label={t('order.viewCart', { count })}>
          <ShoppingBag className={icon} aria-hidden="true" />
          <span className="tabular-nums">
            {count} · {money(cartEstimate(lines))}
          </span>
        </button>
      ) : !site.ordering.enabled && site.reservations?.enabled ? (
        <Link to="/reserve" className="is-main">
          <CalendarCheck className={icon} aria-hidden="true" />
          {t('site.bar.book')}
        </Link>
      ) : (
        site.has_menu && (
          <Link to="/menu" className="is-main">
            <UtensilsCrossed className={icon} aria-hidden="true" />
            {site.ordering.enabled ? t('site.bar.order') : t('site.bar.menu')}
          </Link>
        )
      )}
    </nav>
  );
}
