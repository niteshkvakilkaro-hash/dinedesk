import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, MapPin } from 'lucide-react';
import { DAYS } from '@/components/HoursEditor';
import { formatTime } from '@/lib/format';
import type { OpenStatus } from '@/lib/openStatus';
import { getTheme } from '@/themes/registry';
import { mapHref, useLocalized, useOpenStatus } from '../data';
import { SiteImg, useOpenLabel } from '../components/bits';
import { artFor, FoodArt } from '../components/FoodArt';
import type { MenuItem, SiteData } from '../types';

export const themeStyle = (site: SiteData) => getTheme(site.theme.key).style;

/** Eyebrow + heading + optional lead and action, used to open every section. */
export function SectionHead({ eyebrow, title, lead, action, id, center = false, level = 2 }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; action?: ReactNode; id?: string; center?: boolean; level?: 1 | 2 }) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-8 gap-y-4 ${center ? 'flex-col items-center text-center' : ''}`}>
      <div className={`s-reveal max-w-2xl ${center ? 'mx-auto' : ''}`}>
        {eyebrow && <p className="s-eyebrow mb-3">{eyebrow}</p>}
        <H id={id} className={level === 1 ? 's-h1' : 's-h2'}>
          {title}
        </H>
        {lead && <p className="s-lead mt-4">{lead}</p>}
      </div>
      {action && <div className="s-reveal shrink-0" style={{ ['--i' as string]: 1 }}>{action}</div>}
    </div>
  );
}

/** Haveli's gold double rule; a plain hairline elsewhere. */
export function Divider({ site, className = '' }: { site: SiteData; className?: string }) {
  if (site.theme.key === 'haveli') {
    return (
      <div className={`s-divider ${className}`} aria-hidden="true">
        <span />
      </div>
    );
  }
  return <hr className={`border-0 border-t border-t-line ${className}`} />;
}

/** "Open now · until 11:00 PM" pill with a live dot. */
export function OpenBadge({ site, className = '' }: { site: SiteData; className?: string }) {
  const status = useOpenLabel(useOpenStatus(site));
  if (!status) return null;
  return (
    <p className={`s-status ${status.open ? 'is-open' : ''} ${className}`}>
      <span className="s-status-dot" aria-hidden="true" />
      <span>
        {status.label}
        {status.detail && <span className="font-medium"> · {status.detail}</span>}
      </span>
    </p>
  );
}

/** Today's hours as one line ("11:00 AM – 11:00 PM" or "Closed today"). */
export function useTodayHours(site: SiteData): { status: OpenStatus | null; text: string | null } {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  if (!site.opening_hours || !status) return { status, text: null };
  if (status.holiday) return { status, text: t('site.closedToday') };
  const h = site.opening_hours[status.today];
  return { status, text: h.closed ? t('site.closedToday') : `${formatTime(h.open)} – ${formatTime(h.close)}` };
}

/** The week's hours with today highlighted, plus upcoming closures. */
export function Hours({ site, className = '' }: { site: SiteData; className?: string }) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  if (!site.opening_hours) return null;
  return (
    <div className={className}>
      <dl className="-mx-3">
        {DAYS.map((d) => {
          const h = site.opening_hours![d];
          const today = status?.today === d;
          return (
            <div key={d} className={`s-hours-row ${today ? 'is-today' : ''}`}>
              <dt>
                {t(`days.${d}`)}
                {today && <span className="s-small ml-2 font-semibold text-t-link">{t('site.today')}</span>}
              </dt>
              <dd className={h.closed ? 's-muted' : ''}>{h.closed ? t('onboarding.closed') : `${formatTime(h.open)} – ${formatTime(h.close)}`}</dd>
            </div>
          );
        })}
      </dl>
      {site.holidays.length > 0 && (
        <div className="mt-5">
          <p className="s-small font-bold">{t('site.holidaysTitle')}</p>
          <ul className="s-small s-muted mt-1 space-y-0.5">
            {site.holidays.slice(0, 5).map((h) => (
              <li key={h.date}>
                {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${h.date}T12:00:00`))}
                {h.label && ` · ${h.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Spice level as small flame icons (no emoji). */
export function Spice({ level, className = '' }: { level: number; className?: string }) {
  const { t } = useTranslation();
  if (!level) return null;
  const label = t('site.spice', { count: level });
  return (
    <span className={`inline-flex items-center text-t-link ${className}`} title={label} role="img" aria-label={label}>
      {Array.from({ length: Math.min(level, 3) }, (_, i) => (
        <Flame key={i} className="-mr-0.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
      ))}
    </span>
  );
}

/** A dish photo, or the shared illustration when there is none (never passed off as a photo). */
export function DishImage({ item, className = '', sizes = '(min-width: 1024px) 400px, 80vw', priority = false }: { item: MenuItem; className?: string; sizes?: string; priority?: boolean }) {
  const l = useLocalized();
  if (item.image) return <SiteImg image={item.image} alt={l(item, 'name') ?? item.name} sizes={sizes} priority={priority} className={`s-media ${className}`} />;
  return (
    <span className={`s-media s-art ${className}`}>
      <FoodArt art={artFor(item.name, item.description)} className="h-1/2 max-h-28 w-1/2 max-w-28" />
    </span>
  );
}

/**
 * Map behind a click: Google Maps loads only when asked (no third-party scripts on page load).
 * The embed needs no API key; "Get directions" always works.
 */
export function MapFacade({ site, className = '' }: { site: SiteData; className?: string }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const q = [site.name, site.content.contact.address, site.city].filter(Boolean).join(', ');
  return (
    <div className={`s-media relative aspect-[4/3] ${className}`}>
      {show ? (
        <iframe
          title={t('site.mapTitle', { name: site.name })}
          src={`https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="s-jaali absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-t-primary text-t-on-primary">
            <MapPin className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="s-small max-w-xs font-semibold">{[site.content.contact.address, site.city].filter(Boolean).join(', ') || site.name}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="s-btn s-btn-secondary s-btn-sm" onClick={() => setShow(true)}>
              {t('site.showMap')}
            </button>
            <a href={mapHref(site)} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-primary s-btn-sm">
              {t('site.directions')}
              <span className="sr-only"> ({t('common.opensInNewTab')})</span>
            </a>
          </div>
          <p className="s-small s-muted">{t('site.mapNote')}</p>
        </div>
      )}
    </div>
  );
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`s-wrap ${className}`}>{children}</div>;
}
