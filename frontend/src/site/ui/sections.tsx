import { useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarCheck, Car, MapPin, MessageCircle, Phone, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { featuredItems, mapHref, telHref, useLocalized, useSiteGallery, useSiteMenu, whatsappHref } from '../data';
import { FoodTypeMark, SiteImg } from '../components/bits';
import { Lightbox, Paragraphs, useStory } from '../components/shared';
import type { GalleryItem, SectionKey, SiteData } from '../types';
import { DishCard, useDishPrice } from './DishCard';
import { Hours, MapFacade, SectionHead, themeStyle } from './primitives';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
const delay = (i: number) => ({ ['--i' as string]: i });

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="s-link inline-flex min-h-11 items-center gap-2">
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/** Quick actions under the hero: only the ones this business really offers. */
export function QuickActions({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const c = site.content.contact;
  const actions = [
    site.has_menu && { key: 'menu', icon: site.ordering.enabled ? ShoppingBag : UtensilsCrossed, label: site.ordering.enabled ? t('site.quick.order') : t('site.quick.menu'), hint: site.ordering.enabled ? t('site.quick.orderHint') : t('site.quick.menuHint'), to: '/menu' },
    site.reservations?.enabled && { key: 'reserve', icon: CalendarCheck, label: t('site.reserveTitle'), hint: t('site.quick.reserveHint'), to: '/reserve' },
    c.phone && { key: 'call', icon: Phone, label: t('site.quick.call'), hint: formatPhone(c.phone), href: telHref(c.phone) },
    c.whatsapp && { key: 'wa', icon: MessageCircle, label: 'WhatsApp', hint: t('site.quick.whatsappHint'), href: whatsappHref(c.whatsapp, t('site.whatsappHello', { name: site.name })), external: true },
    { key: 'map', icon: MapPin, label: t('site.quick.directions'), hint: site.city ?? t('site.quick.directionsHint'), href: mapHref(site), external: true },
  ].filter(Boolean) as { key: string; icon: typeof Phone; label: string; hint: string; to?: string; href?: string; external?: boolean }[];

  return (
    <nav aria-label={t('site.quick.label')} className="s-wrap relative z-10 pt-6 md:pt-10">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:gap-4">
        {actions.map((a, i) => {
          const inner = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-t-primary text-t-on-primary">
                <a.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold leading-tight">{a.label}</span>
                <span className="s-small s-muted block truncate">{a.hint}</span>
              </span>
              {a.external && <span className="sr-only"> ({t('common.opensInNewTab')})</span>}
            </>
          );
          const cls = 's-card s-card-hover flex min-h-[76px] items-center gap-3 p-3 sm:p-4';
          return (
            <li key={a.key} className="s-reveal" style={delay(i)}>
              {a.to ? (
                <Link to={a.to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <a href={a.href} className={cls} {...(a.external ? ext : {})}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Signature({ extra: Extra }: { site: SiteData; extra?: ComponentType }) {
  const { t } = useTranslation();
  const { data: menu } = useSiteMenu();
  const items = featuredItems(menu, 6);
  if (!items.length) return null;
  return (
    <>
      <section className="s-section s-ruled" aria-labelledby="signature-title">
        <div className="s-wrap">
          <SectionHead id="signature-title" eyebrow={t('site.fromKitchen')} title={t('site.signatureTitle')} action={<MoreLink to="/menu">{t('site.fullMenu')}</MoreLink>} />
          <div className="s-scroller s-tilt-alt mt-10 md:mt-14">
            {items.map((item, i) => (
              <DishCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>
      {Extra && <Extra />}
    </>
  );
}

/** Interior photos first: they say more about the place than another plate of food. */
function useAmbience(site: SiteData) {
  const { data } = useSiteGallery(site.has_gallery);
  return useMemo(() => {
    const items = (data ?? []).filter((g) => g.image);
    return [...items.filter((g) => g.category === 'interior'), ...items.filter((g) => g.category !== 'interior')];
  }, [data]);
}

export function AboutSplit({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { about } = useStory(site);
  const ambience = useAmbience(site);
  const photo = ambience[0]?.image ?? site.theme.cover;
  const style = themeStyle(site);
  const paragraphs = about?.split(/\n{2,}|\r\n\r\n/).filter(Boolean) ?? [];
  return (
    <section className="s-section s-ruled s-alt" aria-labelledby="story-title">
      <div className="s-wrap s-grid items-center gap-y-12">
        <div className={`s-reveal col-span-4 md:col-span-6 ${style.hero === 'split' ? 'md:order-2 lg:col-span-5 lg:col-start-8' : ''}`}>
          {photo && (
            <div className="s-zoom">
              <SiteImg image={photo} alt={ambience[0]?.alt_text ?? t('site.coverAlt', { name: site.name })} sizes="(min-width: 1024px) 560px, 100vw" className={`s-media aspect-[4/5] w-full ${style.imageMask === 'arch' ? 's-media-arch' : ''}`} />
            </div>
          )}
        </div>
        <div className={`col-span-4 md:col-span-6 ${style.hero === 'split' ? 'md:order-1' : 'lg:col-span-5 lg:col-start-8'}`}>
          <p className="s-reveal s-eyebrow">{t('site.ourStory')}</p>
          <h2 id="story-title" className="s-reveal s-h2 mt-3" style={delay(1)}>
            {t('site.storyTitle', { name: site.name })}
          </h2>
          <div className="s-reveal s-body mt-6 space-y-4" style={delay(2)}>
            {paragraphs.length ? <Paragraphs text={paragraphs.slice(0, 2).join('\n\n')} /> : <p className="s-muted">{t('site.noStory', { name: site.name })}</p>}
          </div>
          {site.content.milestones.length > 0 && (
            <dl className="s-reveal mt-8 grid grid-cols-3 gap-4 border-t border-t-line pt-6" style={delay(3)}>
              {site.content.milestones.slice(0, 3).map((m) => (
                <div key={`${m.year}-${m.title}`}>
                  <dt className="font-display text-2xl text-t-link md:text-3xl">{m.year}</dt>
                  <dd className="s-small s-muted mt-1">{l(m, 'title')}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="s-reveal mt-8" style={delay(4)}>
            <MoreLink to="/about">{t('site.readStory')}</MoreLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MenuPreview(_props: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const price = useDishPrice();
  const { data: menu } = useSiteMenu();
  const cats = (menu ?? []).filter((c) => c.items.length).slice(0, 5);
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!cats.length) return null;
  const current = cats[Math.min(active, cats.length - 1)];
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + cats.length) % cats.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <section className="s-section s-ruled" aria-labelledby="menu-preview-title">
      <div className="s-wrap">
        <SectionHead id="menu-preview-title" eyebrow={t('site.menuEyebrow')} title={t('site.menuPreviewTitle')} action={<MoreLink to="/menu">{t('site.fullMenu')}</MoreLink>} />
        <div role="tablist" aria-label={t('site.categories')} className="s-reveal s-tabs mt-10" onKeyDown={onKey}>
          {cats.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={i === active}
              aria-controls={`panel-${c.id}`}
              tabIndex={i === active ? 0 : -1}
              className="s-chip"
              onClick={() => setActive(i)}
            >
              {l(c, 'name')}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="mt-8">
          <ul key={current.id} className="grid gap-x-12 md:grid-cols-2">
            {current.items.slice(0, 8).map((i, n) => (
              <li key={i.id} className="border-b border-t-line py-4" style={{ animation: `s-fade .5s var(--t-ease) ${n * 50}ms both` }}>
                <div className="flex items-baseline gap-2">
                  <FoodTypeMark type={i.food_type} className="translate-y-0.5" />
                  <span className="font-bold">{l(i, 'name')}</span>
                  <span className="s-leader" aria-hidden="true" />
                  <span className="s-price">{price(i)}</span>
                </div>
                {l(i, 'description') && <p className="s-small s-muted mt-1 line-clamp-1 pl-6">{l(i, 'description')}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Ambience({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const items = useAmbience(site).slice(0, 5);
  const [index, setIndex] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <section className="s-section s-ruled" aria-labelledby="ambience-title">
      <div className="s-wrap">
        <SectionHead id="ambience-title" eyebrow={t('site.ambienceEyebrow')} title={t('site.galleryTitle')} action={<MoreLink to="/gallery">{t('site.seeGallery')}</MoreLink>} />
        <ul className="mt-10 grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[200px] md:mt-14 md:grid-cols-4 md:gap-4 lg:auto-rows-[240px]">
          {items.map((g, i) => (
            <li key={g.id} className={`s-reveal s-zoom ${i === 0 ? 'col-span-2 row-span-2' : ''}`} style={delay(i)}>
              <button type="button" className="block h-full w-full" onClick={() => setIndex(i)} aria-label={t('site.openPhoto', { alt: g.alt_text })}>
                <SiteImg image={g.image!} alt="" sizes={i === 0 ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'} className="s-media h-full w-full" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Lightbox items={items as GalleryItem[]} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
    </section>
  );
}

/** Book a table online (when switched on), by phone or on WhatsApp. */
export function Reserve({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const c = site.content.contact;
  const online = !!site.reservations?.enabled;
  if (!online && (site.business_type === 'cloud_kitchen' || (!c.phone && !c.whatsapp))) return null;
  return (
    <section className="s-section-tight" aria-labelledby="reserve-title">
      <div className="s-wrap">
        <div className="s-reveal s-card relative overflow-hidden !bg-t-primary px-6 py-12 text-t-on-primary sm:px-12 md:py-16">
          <div className="s-grid items-center gap-y-8">
            <div className="col-span-4 md:col-span-7">
              <p className="s-eyebrow !text-current opacity-85">{t('site.reserveEyebrow')}</p>
              <h2 id="reserve-title" className="s-h2 mt-3">
                {t('site.reserveTitle')}
              </h2>
              <p className="mt-4 max-w-lg text-lg opacity-90">{online ? t('site.reserveTextOnline') : t('site.reserveText')}</p>
            </div>
            <div className="col-span-4 flex flex-wrap gap-3 md:col-span-5 md:justify-end">
              {online && (
                <Link to="/reserve" className="s-btn bg-t-on-primary text-t-primary">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  {t('site.reserveOnline')}
                </Link>
              )}
              {c.phone && (
                <a href={telHref(c.phone)} className={`s-btn ${online ? 's-btn-secondary' : 'bg-t-on-primary text-t-primary'}`}>
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {t('site.reserveCall')}
                </a>
              )}
              {c.whatsapp && (
                <a href={whatsappHref(c.whatsapp, t('site.reserveWhatsappText', { name: site.name }))} {...ext} className="s-btn s-btn-secondary">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {t('site.reserveWhatsapp')}
                  <span className="sr-only"> ({t('common.opensInNewTab')})</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Address, map, parking and the week's hours (today highlighted). */
export function Visit({ site, showHours = true, showMap = true }: { site: SiteData; showHours?: boolean; showMap?: boolean }) {
  const { t } = useTranslation();
  const c = site.content.contact;
  const address = [c.address, site.city].filter(Boolean).join(', ');
  return (
    <section className="s-section s-ruled" aria-labelledby="visit-title">
      <div className="s-wrap">
        <SectionHead id="visit-title" eyebrow={t('site.findUs')} title={t('site.visitTitle')} />
        <div className="s-grid mt-10 gap-y-10 md:mt-14">
          <div className="col-span-4 space-y-8 md:col-span-5">
            {showMap && (
              <div className="s-reveal space-y-5">
                {address && (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{address}</p>
                      <a href={mapHref(site)} {...ext} className="s-link s-small">
                        {t('site.directions')}
                        <span className="sr-only"> ({t('common.opensInNewTab')})</span>
                      </a>
                    </div>
                  </div>
                )}
                {c.parking && (
                  <div className="flex gap-3">
                    <Car className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
                    <p>
                      <span className="font-semibold">{t('site.parking')}: </span>
                      {c.parking}
                    </p>
                  </div>
                )}
                {c.phone && (
                  <div className="flex gap-3">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
                    <a href={telHref(c.phone)} className="font-semibold tabular-nums hover:underline">
                      {formatPhone(c.phone)}
                    </a>
                  </div>
                )}
              </div>
            )}
            {showHours && site.opening_hours && (
              <div className="s-reveal" style={delay(1)}>
                <h3 className="s-h3 mb-3">{t('site.whenOpen')}</h3>
                <Hours site={site} />
              </div>
            )}
          </div>
          {showMap && (
            <div className="s-reveal col-span-4 md:col-span-7" style={delay(2)}>
              <MapFacade site={site} className="h-full min-h-[320px]" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Home sections in the owner's order; hours + visit merge into one "Visit us" block. */
export function HomeSections({ site, sections, extra }: { site: SiteData; sections: SectionKey[]; extra?: ComponentType }) {
  const showHours = sections.includes('hours');
  const showMap = sections.includes('visit');
  const visitAt = sections.findIndex((k) => k === 'hours' || k === 'visit');
  const out: React.ReactNode[] = [];
  sections.forEach((key, i) => {
    if (key === 'specials') out.push(<Signature key={key} site={site} extra={extra} />);
    if (key === 'story') out.push(<AboutSplit key={key} site={site} />);
    if (key === 'menu_preview') out.push(<MenuPreview key={key} site={site} />);
    if (key === 'gallery') out.push(<Ambience key={key} site={site} />);
    if (i === visitAt) {
      out.push(<Reserve key="reserve" site={site} />);
      out.push(<Visit key="visit" site={site} showHours={showHours} showMap={showMap} />);
    }
  });
  if (visitAt === -1) out.push(<Reserve key="reserve" site={site} />);
  return <>{out}</>;
}
