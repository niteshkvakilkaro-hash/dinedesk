import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, MapPin, Phone } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { mapHref, telHref, useLocalized, whatsappHref } from '../data';
import { SiteImg } from '../components/bits';
import type { SiteData } from '../types';
import { useParallax } from './motion';
import { OpenBadge, themeStyle, useTodayHours } from './primitives';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
const delay = (i: number) => ({ ['--i' as string]: i });

/** "Restaurant · Jaipur" */
export function useKicker(site: SiteData) {
  const { t } = useTranslation();
  return [t(`types.${site.business_type}`), site.city].filter(Boolean).join(' · ');
}

/** Main and secondary hero actions, from what the business actually offers. */
function useCtas(site: SiteData) {
  const { t } = useTranslation();
  const c = site.content.contact;
  const food = site.ordering.enabled ? { to: '/menu', label: t('site.hero.order') } : site.has_menu ? { to: '/menu', label: t('site.viewMenu') } : null;
  let secondary: { href: string; label: string; external?: boolean; internal?: boolean } | null = null;
  // A hotel leads with its rooms; the restaurant comes second.
  if (site.hotel?.has_rooms) {
    secondary = food ? { href: food.to, label: site.ordering.enabled ? t('site.hero.order') : t('site.hero.restaurant'), internal: true } : null;
    return { primary: { to: '/rooms', label: t('site.hero.rooms') }, secondary };
  }
  const primary = food;
  if (site.reservations?.enabled) secondary = { href: '/reserve', label: t('site.reserveTitle'), internal: true };
  else if (site.business_type !== 'cloud_kitchen' && c.phone) secondary = { href: telHref(c.phone), label: t('site.hero.book') };
  else if (c.whatsapp) secondary = { href: whatsappHref(c.whatsapp, t('site.whatsappHello', { name: site.name })), label: t('site.hero.whatsapp'), external: true };
  else secondary = { href: mapHref(site), label: t('site.directions'), external: true };
  return { primary, secondary };
}

function Ctas({ site, onPhoto = false, gold = false }: { site: SiteData; onPhoto?: boolean; gold?: boolean }) {
  const { t } = useTranslation();
  const { primary, secondary } = useCtas(site);
  return (
    <div className="s-reveal flex flex-wrap gap-3" style={delay(3)}>
      {primary && (
        <Link to={primary.to} className={`s-btn ${gold ? 's-btn-gold' : 's-btn-primary'}`}>
          {primary.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {secondary?.internal && (
        <Link to={secondary.href} className={`s-btn ${onPhoto ? 's-btn-glass' : 's-btn-secondary'}`}>
          {secondary.label}
        </Link>
      )}
      {secondary && !secondary.internal && (
        <a href={secondary.href} className={`s-btn ${onPhoto ? 's-btn-glass' : 's-btn-secondary'}`} {...(secondary.external ? ext : {})}>
          {secondary.label}
          {secondary.external && <span className="sr-only"> ({t('common.opensInNewTab')})</span>}
        </a>
      )}
    </div>
  );
}

/** Today's hours, address and phone in one card. */
export function InfoCard({ site, className = '' }: { site: SiteData; className?: string }) {
  const { t } = useTranslation();
  const today = useTodayHours(site);
  const c = site.content.contact;
  const address = [c.address, site.city].filter(Boolean).join(', ');
  const row = 'flex gap-3 py-3 first:pt-0 last:pb-0';
  const icon = 'mt-0.5 h-5 w-5 shrink-0 text-t-link';
  return (
    <div className={`s-card p-5 text-t-text sm:p-6 ${className}`}>
      <ul className="divide-y divide-t-line">
        {today.text && (
          <li className={row}>
            <Clock className={icon} aria-hidden="true" />
            <div>
              <p className="s-eyebrow !text-[0.7rem]">{t('site.today')}</p>
              <p className="font-semibold tabular-nums">{today.text}</p>
            </div>
          </li>
        )}
        {address && (
          <li className={row}>
            <MapPin className={icon} aria-hidden="true" />
            <div className="min-w-0">
              <p className="s-small">{address}</p>
              <a href={mapHref(site)} {...ext} className="s-link s-small">
                {t('site.directions')}
                <span className="sr-only"> ({t('common.opensInNewTab')})</span>
              </a>
            </div>
          </li>
        )}
        {c.phone && (
          <li className={row}>
            <Phone className={icon} aria-hidden="true" />
            <a href={telHref(c.phone)} className="font-semibold tabular-nums hover:underline">
              {formatPhone(c.phone)}
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

function FullBleed({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const kicker = useKicker(site);
  const parallax = useParallax<HTMLDivElement>(0.3);
  const cover = site.theme.cover;
  return (
    <section className="s-hero-full s-hero-pull" aria-labelledby="hero-title">
      {cover && (
        <div ref={parallax} className="s-hero-img">
          <SiteImg image={cover} alt={t('site.coverAlt', { name: site.name })} sizes="(orientation: portrait) 260vw, 100vw" priority className="h-full w-full" />
        </div>
      )}
      <div className="s-wrap s-grid w-full items-end gap-y-8 pb-10 pt-[calc(var(--s-header-h)+56px)] md:pb-20 md:pt-[calc(var(--s-header-h)+96px)]">
        <div className="col-span-4 md:col-span-8 lg:col-span-7">
          <p className="s-reveal s-eyebrow !text-white/85">{kicker}</p>
          <h1 id="hero-title" className="s-reveal s-display mt-4 break-words" style={delay(1)}>
            {site.name}
          </h1>
          {l(site.content, 'tagline') && (
            <p className="s-reveal mt-5 max-w-xl text-lg leading-relaxed text-white/90 md:text-xl" style={delay(2)}>
              {l(site.content, 'tagline')}
            </p>
          )}
          <div className="mt-8 space-y-6">
            <Ctas site={site} onPhoto />
            <div className="s-reveal" style={delay(4)}>
              <OpenBadge site={site} />
            </div>
          </div>
        </div>
        <div className="s-reveal col-span-4 hidden md:col-span-4 md:block lg:col-span-4 lg:col-start-9" style={delay(4)}>
          <InfoCard site={site} />
        </div>
      </div>
    </section>
  );
}

function Split({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const kicker = useKicker(site);
  const style = themeStyle(site);
  const cover = site.theme.cover;
  return (
    <section className={`s-hero-split relative overflow-hidden pb-16 pt-10 md:pb-24 md:pt-16 ${site.theme.key === 'haveli' ? 's-jaali' : ''}`} aria-labelledby="hero-title">
      <div className="s-wrap s-grid items-center gap-y-12">
        <div className="col-span-4 md:col-span-6">
          <p className="s-reveal s-eyebrow">{kicker}</p>
          <h1 id="hero-title" className="s-reveal s-display mt-4 break-words" style={delay(1)}>
            {site.name}
          </h1>
          {l(site.content, 'tagline') && (
            <p className="s-reveal s-lead mt-5 max-w-lg" style={delay(2)}>
              {l(site.content, 'tagline')}
            </p>
          )}
          <div className="mt-8 space-y-6">
            <Ctas site={site} />
            <div className="s-reveal" style={delay(4)}>
              <OpenBadge site={site} />
            </div>
          </div>
        </div>
        <div className={`relative col-span-4 md:col-span-6 lg:col-span-5 lg:col-start-8 ${site.theme.key === 'kulhad' ? 's-glow' : ''}`}>
          {cover ? (
            <div className="s-hero-photo">
              <SiteImg image={cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 1024px) 480px, 100vw" priority className={`s-media aspect-[4/5] w-full ${style.imageMask === 'arch' ? 's-media-arch' : ''}`} />
            </div>
          ) : (
            <div className="s-hero-photo">
              <div className={`s-media aspect-[4/5] w-full ${style.imageMask === 'arch' ? 's-media-arch' : ''}`} aria-hidden="true" />
            </div>
          )}
          <div className="s-reveal mt-4 md:absolute md:-left-12 md:bottom-10 md:mt-0 md:w-80" style={delay(3)}>
            <InfoCard site={site} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Editorial({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const kicker = useKicker(site);
  const cover = site.theme.cover;
  return (
    <section className="pb-16 pt-8 md:pb-24 md:pt-12" aria-labelledby="hero-title">
      <div className="s-wrap">
        <div className="s-reveal flex flex-wrap items-center justify-between gap-3 border-b border-t-line pb-4">
          <p className="s-eyebrow">{kicker}</p>
          <OpenBadge site={site} />
        </div>
        <h1 id="hero-title" className="s-reveal s-display mt-8 break-words !text-[clamp(3.25rem,11vw,9.5rem)] !leading-[0.92]" style={delay(1)}>
          {site.name}
        </h1>
        {/* Phones: the actions right under the name, so they are on the first screen. */}
        <div className="mt-6 md:hidden">
          <Ctas site={site} />
        </div>
        <div className="s-grid mt-8 gap-y-8 border-t border-t-line pt-8 md:mt-10">
          <div className="col-span-4 md:col-span-7">{/* no fade on the LCP photo */}
            {cover && <SiteImg image={cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 1024px) 720px, 100vw" priority className="s-media aspect-[4/3] w-full" />}
          </div>
          <div className="col-span-4 flex flex-col justify-between gap-8 md:col-span-5">
            {l(site.content, 'tagline') && (
              <p className="s-reveal font-display text-2xl leading-snug md:text-3xl" style={delay(3)}>
                {l(site.content, 'tagline')}
              </p>
            )}
            <div className="space-y-8">
              <div className="hidden md:block">
                <Ctas site={site} />
              </div>
              <div className="s-reveal" style={delay(4)}>
                <InfoCard site={site} className="!px-0 !pb-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Heritage themes: the photo fills the screen, with an ornament, a gold call to action and the quick actions over its lower edge. */
function Royal({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const kicker = useKicker(site);
  const parallax = useParallax<HTMLDivElement>(0.25);
  const tagline = l(site.content, 'tagline');
  return (
    <section className="s-hero-full s-hero-royal s-hero-pull" aria-labelledby="hero-title">
      <div ref={parallax} className="s-hero-img">
        <SiteImg image={site.theme.cover!} alt={t('site.coverAlt', { name: site.name })} sizes="(orientation: portrait) 260vw, 100vw" priority className="h-full w-full" />
      </div>
      <div className="s-wrap w-full pb-24 pt-[calc(var(--s-header-h)+48px)] md:pb-36">
        <div className="max-w-2xl">
          <span className="s-reveal s-ornament" aria-hidden="true" />
          <p className="s-reveal s-eyebrow s-hero-kicker mt-4" style={delay(1)}>{kicker}</p>
          <h1 id="hero-title" className="s-reveal s-display mt-3 break-words" style={delay(1)}>
            {site.name}
          </h1>
          {tagline && (
            <p className="s-reveal mt-4 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg md:text-xl" style={delay(2)}>
              {tagline}
            </p>
          )}
          <div className="mt-7 flex flex-col items-start gap-5">
            <Ctas site={site} onPhoto gold />
            <div className="s-reveal" style={delay(4)}>
              <OpenBadge site={site} className="s-status-glass" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Hero({ site }: { site: SiteData }) {
  const hero = themeStyle(site).hero;
  if (hero === 'royal' && site.theme.cover) return <Royal site={site} />;
  if (hero === 'fullbleed') return <FullBleed site={site} />;
  if (hero === 'editorial') return <Editorial site={site} />;
  return <Split site={site} />;
}
