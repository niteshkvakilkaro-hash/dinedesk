import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BedDouble, CalendarCheck, ChevronRight, Download, Images, Info, LogOut, MapPin, MessageCircle, Navigation, PartyPopper, Phone, ReceiptText, Share, Tag, type LucideIcon } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { mapHref, telHref, whatsappHref } from '../data';
import { ReduceMotionToggle, SiteLanguageToggle } from '../components/bits';
import { guestSignOut, useGuestAccount } from '../account';
import { useInstallApp } from '../app';
import type { SiteData } from '../types';
import { OpenBadge } from '../ui/primitives';
import { GuestSignIn } from './GuestSignIn';
import { useSkin } from './skin';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** "Profile" tab: the guest's account, their orders and bookings, the other pages and contact. */
export default function ProfilePage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const skin = useSkin();
  const me = useGuestAccount().data;
  const app = useInstallApp();
  const c = site.content.contact;
  const hasBookings = !!site.reservations?.enabled || !!site.hotel?.has_rooms;
  const rows: { to: string; icon: LucideIcon; label: string; show: boolean }[] = [
    { to: '/orders', icon: ReceiptText, label: t('order.mine.title'), show: site.ordering.enabled || !!me },
    { to: '/bookings', icon: CalendarCheck, label: t('site.profile.bookings'), show: hasBookings },
    { to: '/rooms', icon: BedDouble, label: t('site.nav.rooms'), show: !!site.hotel?.has_rooms },
    { to: '/offers', icon: Tag, label: t('site.nav.offers'), show: !!site.growth?.has_offers },
    { to: '/events', icon: PartyPopper, label: t('site.nav.events'), show: !!site.hotel?.banquets },
    { to: '/gallery', icon: Images, label: t('site.nav.gallery'), show: site.has_gallery },
    { to: '/about', icon: Info, label: t('site.nav.about'), show: true },
    { to: '/contact', icon: MapPin, label: t('site.nav.contact'), show: true },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-24 pt-8 sm:px-6">
      <h1 className={`text-4xl ${skin.heading}`}>{t('site.profile.title')}</h1>

      <section className={`p-5 ${skin.card}`} aria-label={t('site.profile.account')}>
        {me ? (
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-t-primary text-xl font-bold text-t-on-primary" aria-hidden="true">
              {(me.name ?? '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{me.name ?? t('order.account.signedIn')}</p>
              <p className="text-sm text-t-muted">
                {formatPhone(me.phone)}
                {site.growth?.loyalty?.enabled && ` · ${t('order.account.points', { count: me.points })}`}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="font-bold">{t('order.account.title')}</p>
            <p className="mb-4 mt-1 text-sm text-t-muted">{t('order.account.why')}</p>
            <GuestSignIn />
          </>
        )}
      </section>

      {!app.installed && (app.canPrompt || app.ios) && (
        <section className={`flex items-center gap-4 p-5 ${skin.card}`} aria-labelledby="install-h">
          <img src="/site-icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 id="install-h" className="font-bold">
              {t('site.profile.install', { name: site.name })}
            </h2>
            <p className="text-sm text-t-muted">{app.canPrompt ? t('site.profile.installHint') : t('site.profile.iosHint')}</p>
          </div>
          {app.canPrompt ? (
            <button type="button" className={`min-h-11 shrink-0 px-4 ${skin.primary}`} onClick={() => void app.install()}>
              <Download className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
              {t('site.profile.installButton')}
            </button>
          ) : (
            <Share className="h-6 w-6 shrink-0 text-t-muted" aria-hidden="true" />
          )}
        </section>
      )}

      <nav aria-label={t('site.profile.title')} className={`overflow-hidden ${skin.card}`}>
        <ul className="divide-y divide-t-line">
          {rows
            .filter((r) => r.show)
            .map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <Link to={to} className="flex min-h-14 items-center gap-3 px-5 font-semibold hover:bg-black/5">
                  <Icon className="h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="h-4 w-4 text-t-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
        </ul>
      </nav>

      <section className={`space-y-3 p-5 ${skin.card}`} aria-labelledby="help-h">
        <h2 id="help-h" className="font-bold">
          {t('site.profile.help')}
        </h2>
        <div className={`grid gap-2 ${c.phone && c.whatsapp ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {c.phone && (
            <a href={telHref(c.phone)} className="s-btn s-btn-secondary !px-2">
              <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
              {t('site.bar.call')}
            </a>
          )}
          {c.whatsapp && (
            <a href={whatsappHref(c.whatsapp, t('site.whatsappHello', { name: site.name }))} {...ext} className="s-btn s-btn-secondary !px-2">
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              WhatsApp
              <span className="sr-only"> ({t('common.opensInNewTab')})</span>
            </a>
          )}
          <a href={mapHref(site)} {...ext} className="s-btn s-btn-secondary !px-2">
            <Navigation className="h-[18px] w-[18px]" aria-hidden="true" />
            {t('site.bar.directions')}
            <span className="sr-only"> ({t('common.opensInNewTab')})</span>
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-t-line pt-3">
          <OpenBadge site={site} />
          <div className="flex items-center gap-4">
            <SiteLanguageToggle className="inline-flex min-h-11 items-center font-semibold" />
            <ReduceMotionToggle className="s-small inline-flex min-h-11 items-center font-semibold" />
          </div>
        </div>
      </section>

      {me && (
        <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 font-semibold underline" onClick={() => void guestSignOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> {t('order.account.signOut')}
        </button>
      )}
    </div>
  );
}
